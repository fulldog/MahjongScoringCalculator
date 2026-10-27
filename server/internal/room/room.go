package room

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/auth"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/score"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
)

const danmakuInterval = 10 * time.Second

var seatOrder = []struct {
	Key   string
	Label string
}{
	{Key: "east", Label: "东"},
	{Key: "south", Label: "南"},
	{Key: "west", Label: "西"},
	{Key: "north", Label: "北"},
}

// RuleError is a message safe to show to a player.
type RuleError struct {
	Message string
}

func (e *RuleError) Error() string { return e.Message }

func rule(message string) error {
	return &RuleError{Message: message}
}

// Repo is the persistence used by live rooms.
type Repo interface {
	CreateMatch(ctx context.Context, hostID int64, code string) (int64, error)
	ReplaceWaitingSeats(ctx context.Context, matchID int64, seats []store.SeatRow) error
	MarkPlaying(ctx context.Context, matchID int64) error
	OpenRound(ctx context.Context, matchID int64, roundNo int) (int64, error)
	UpsertReport(ctx context.Context, roundID, userID int64, payload []byte) error
	SettleRound(ctx context.Context, matchID, roundID int64, kind string, lines []string, deltas map[int64]int) error
	EndMatch(ctx context.Context, matchID int64) error
	InsertDanmaku(ctx context.Context, row store.DanmakuRow) (int64, error)
	LoadByCode(ctx context.Context, code string) (store.LoadedMatch, error)
}

// Client is one socket in a room.
type Client struct {
	Identity auth.Identity
	Send     chan []byte
	lastChat time.Time
}

func (c *Client) key() string {
	if c.Identity.Role == auth.RoleUser {
		return "user:" + strconv.FormatInt(c.Identity.UserID, 10)
	}
	return "guest:" + c.Identity.GuestKey
}

func (c *Client) enqueue(payload []byte) {
	select {
	case c.Send <- payload:
	default:
	}
}

// Hub keeps live rooms.
type Hub struct {
	repo  Repo
	mu    sync.Mutex
	rooms map[string]*live
}

// NewHub returns an empty hub.
func NewHub(repo Repo) *Hub {
	return &Hub{repo: repo, rooms: map[string]*live{}}
}

type live struct {
	mu          sync.Mutex
	id          int64
	code        string
	hostID      int64
	status      string
	seats       map[string]*seat
	roundNo     int
	roundID     int64
	roundStatus string
	reports     map[int64]score.Incoming
	settleError string
	history     []historyItem
	clients     map[string]*Client
}

type seat struct {
	userID    int64
	nickname  string
	avatarURL string
	score     int
}

type historyItem struct {
	RoundNo int
	Lines   []string
	Deltas  map[int64]int
}

// Create opens a waiting room owned by the host.
func (h *Hub) Create(ctx context.Context, host auth.Identity) (string, error) {
	if host.Role != auth.RoleUser {
		return "", rule("登录后才能开房")
	}
	var last error
	for attempt := 0; attempt < 5; attempt++ {
		code, err := randomCode()
		if err != nil {
			return "", err
		}
		id, err := h.repo.CreateMatch(ctx, host.UserID, code)
		if err != nil {
			last = err
			continue
		}
		room := newLive(id, code, host.UserID)
		h.mu.Lock()
		h.rooms[code] = room
		h.mu.Unlock()
		return code, nil
	}
	if last != nil {
		return "", fmt.Errorf("create match: %w", last)
	}
	return "", fmt.Errorf("create match failed")
}

func newLive(id int64, code string, hostID int64) *live {
	return &live{
		id:      id,
		code:    code,
		hostID:  hostID,
		status:  "waiting",
		seats:   map[string]*seat{},
		reports: map[int64]score.Incoming{},
		clients: map[string]*Client{},
	}
}

// Join attaches a socket and returns the room code's live state sender.
func (h *Hub) Join(ctx context.Context, code string, client *Client) (*live, error) {
	room, err := h.room(ctx, code)
	if err != nil {
		return nil, err
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if previous, ok := room.clients[client.key()]; ok && previous != client {
		previous.enqueue(mustJSON(map[string]string{"type": "replaced", "message": "已在其他设备进入房间"}))
	}
	room.clients[client.key()] = client
	room.broadcastLocked()
	return room, nil
}

// Leave detaches a socket.
func (h *Hub) Leave(room *live, client *Client) {
	if room == nil {
		return
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	current, ok := room.clients[client.key()]
	if !ok || current != client {
		return
	}
	delete(room.clients, client.key())
	room.broadcastLocked()
}

func (h *Hub) room(ctx context.Context, code string) (*live, error) {
	h.mu.Lock()
	if room, ok := h.rooms[code]; ok {
		h.mu.Unlock()
		return room, nil
	}
	h.mu.Unlock()
	loaded, err := h.repo.LoadByCode(ctx, code)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, rule("房间不存在")
		}
		return nil, err
	}
	room := fromLoaded(loaded)
	h.mu.Lock()
	defer h.mu.Unlock()
	if existing, ok := h.rooms[code]; ok {
		return existing, nil
	}
	h.rooms[code] = room
	return room, nil
}

func fromLoaded(loaded store.LoadedMatch) *live {
	room := newLive(loaded.Match.ID, loaded.Match.Code, loaded.Match.HostUserID)
	room.status = loaded.Match.Status
	for _, item := range loaded.Seats {
		room.seats[item.Seat] = &seat{userID: item.UserID, nickname: item.Nickname, avatarURL: item.AvatarURL, score: item.Score}
	}
	if loaded.Round != nil {
		room.roundNo = loaded.Round.RoundNo
		room.roundID = loaded.Round.ID
		room.roundStatus = loaded.Round.Status
	}
	for userID, payload := range loaded.Reports {
		var incoming score.Incoming
		if err := json.Unmarshal(payload, &incoming); err == nil {
			room.reports[userID] = incoming
		}
	}
	for _, item := range loaded.History {
		room.history = append(room.history, historyItem{RoundNo: item.RoundNo, Lines: item.Lines, Deltas: item.Deltas})
	}
	return room
}

// Snapshot returns the room view for a caller who may not hold a socket.
func (h *Hub) Snapshot(ctx context.Context, code string, self auth.Identity) (map[string]any, error) {
	room, err := h.room(ctx, code)
	if err != nil {
		return nil, err
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	return room.view(self), nil
}

// Handle applies one client command.
func (h *Hub) Handle(ctx context.Context, room *live, client *Client, raw []byte) {
	var message struct {
		Type   string          `json:"type"`
		Seat   string          `json:"seat"`
		Text   string          `json:"text"`
		Report json.RawMessage `json:"report"`
	}
	if err := json.Unmarshal(raw, &message); err != nil {
		client.enqueue(mustJSON(map[string]string{"type": "error", "message": "消息无法识别"}))
		return
	}
	var err error
	switch message.Type {
	case "sit":
		err = h.sit(ctx, room, client, message.Seat)
	case "unsit":
		err = h.unsit(ctx, room, client)
	case "start":
		err = h.start(ctx, room, client)
	case "report":
		err = h.report(ctx, room, client, message.Report)
	case "next":
		err = h.next(ctx, room, client)
	case "end":
		err = h.end(ctx, room, client)
	case "danmaku":
		err = h.danmaku(ctx, room, client, message.Text)
	default:
		err = rule("不支持的操作")
	}
	if err != nil {
		var ruleErr *RuleError
		if errors.As(err, &ruleErr) {
			client.enqueue(mustJSON(map[string]string{"type": "error", "message": ruleErr.Message}))
			return
		}
		client.enqueue(mustJSON(map[string]string{"type": "error", "message": "操作失败"}))
	}
}

func (h *Hub) sit(ctx context.Context, room *live, client *Client, seatKey string) error {
	if client.Identity.Role != auth.RoleUser {
		return rule("登录后才能入座")
	}
	if !validSeat(seatKey) {
		return rule("座位无效")
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.status != "waiting" {
		return rule("已经开局，不能换座")
	}
	if taken := room.seats[seatKey]; taken != nil && taken.userID != client.Identity.UserID {
		return rule("这个位子有人了")
	}
	previous := cloneSeats(room.seats)
	for key, item := range room.seats {
		if item.userID == client.Identity.UserID {
			delete(room.seats, key)
		}
	}
	room.seats[seatKey] = &seat{
		userID:    client.Identity.UserID,
		nickname:  displayName(client.Identity.Nickname),
		avatarURL: client.Identity.AvatarURL,
	}
	if err := h.repo.ReplaceWaitingSeats(ctx, room.id, room.seatRows()); err != nil {
		room.seats = previous
		return err
	}
	room.broadcastLocked()
	return nil
}

func (h *Hub) unsit(ctx context.Context, room *live, client *Client) error {
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.status != "waiting" {
		return rule("已经开局，不能离座")
	}
	found := false
	previous := cloneSeats(room.seats)
	for key, item := range room.seats {
		if item.userID == client.Identity.UserID {
			delete(room.seats, key)
			found = true
		}
	}
	if !found {
		return rule("你还没有入座")
	}
	if err := h.repo.ReplaceWaitingSeats(ctx, room.id, room.seatRows()); err != nil {
		room.seats = previous
		return err
	}
	room.broadcastLocked()
	return nil
}

func (h *Hub) start(ctx context.Context, room *live, client *Client) error {
	room.mu.Lock()
	defer room.mu.Unlock()
	if client.Identity.UserID != room.hostID {
		return rule("只有房主可以开局")
	}
	if room.status != "waiting" {
		return rule("已经开局")
	}
	if err := canStart(room.hostID, room.seats); err != nil {
		return err
	}
	if err := h.repo.MarkPlaying(ctx, room.id); err != nil {
		return err
	}
	roundID, err := h.repo.OpenRound(ctx, room.id, 1)
	if err != nil {
		return err
	}
	room.status = "playing"
	room.roundNo = 1
	room.roundID = roundID
	room.roundStatus = "reporting"
	room.reports = map[int64]score.Incoming{}
	room.settleError = ""
	room.broadcastLocked()
	return nil
}

func canStart(hostID int64, seats map[string]*seat) error {
	if len(seats) < 2 {
		return rule("至少两人入座才能开局")
	}
	hostSeated := false
	for _, item := range seats {
		if item.userID == hostID {
			hostSeated = true
		}
	}
	if !hostSeated {
		return rule("组局人必须入座")
	}
	return nil
}

func (h *Hub) report(ctx context.Context, room *live, client *Client, payload json.RawMessage) error {
	var incoming score.Incoming
	if err := json.Unmarshal(payload, &incoming); err != nil {
		return rule("申报内容无效")
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.status != "playing" || room.roundStatus != "reporting" {
		return rule("当前不能申报")
	}
	seat := room.seatOf(client.Identity.UserID)
	if seat == nil {
		return rule("入座后才能申报")
	}
	room.reports[client.Identity.UserID] = incoming
	if err := h.repo.UpsertReport(ctx, room.roundID, client.Identity.UserID, payload); err != nil {
		delete(room.reports, client.Identity.UserID)
		return err
	}
	if len(room.reports) < len(room.seats) {
		room.settleError = ""
		room.broadcastLocked()
		return nil
	}
	result, err := score.Settle(room.scorePlayers(), room.scoreReports())
	if err != nil {
		room.settleError = err.Error()
		room.broadcastLocked()
		return nil
	}
	deltas := map[int64]int{}
	for _, item := range room.seatList() {
		deltas[item.userID] = result.Deltas[strconv.FormatInt(item.userID, 10)]
	}
	if err := h.repo.SettleRound(ctx, room.id, room.roundID, result.Kind, result.Lines, deltas); err != nil {
		return err
	}
	for id, delta := range deltas {
		if item := room.seatByUser(id); item != nil {
			item.score += delta
		}
	}
	room.history = append(room.history, historyItem{RoundNo: room.roundNo, Lines: result.Lines, Deltas: deltas})
	room.roundStatus = "settled"
	room.settleError = ""
	room.broadcastLocked()
	return nil
}

func (h *Hub) next(ctx context.Context, room *live, client *Client) error {
	room.mu.Lock()
	defer room.mu.Unlock()
	if client.Identity.UserID != room.hostID {
		return rule("只有房主可以开始下一把")
	}
	if room.status != "playing" || room.roundStatus != "settled" {
		return rule("这一把还没结算")
	}
	nextNo := room.roundNo + 1
	roundID, err := h.repo.OpenRound(ctx, room.id, nextNo)
	if err != nil {
		return err
	}
	room.roundNo = nextNo
	room.roundID = roundID
	room.roundStatus = "reporting"
	room.reports = map[int64]score.Incoming{}
	room.settleError = ""
	room.broadcastLocked()
	return nil
}

func (h *Hub) end(ctx context.Context, room *live, client *Client) error {
	room.mu.Lock()
	defer room.mu.Unlock()
	if client.Identity.UserID != room.hostID {
		return rule("只有房主可以结束牌局")
	}
	if room.status == "ended" {
		return rule("牌局已结束")
	}
	if room.status == "waiting" {
		return rule("还没开局")
	}
	if err := h.repo.EndMatch(ctx, room.id); err != nil {
		return err
	}
	room.status = "ended"
	room.broadcastLocked()
	return nil
}

func (h *Hub) danmaku(ctx context.Context, room *live, client *Client, text string) error {
	text = trimRunes(text, 30)
	if text == "" {
		return rule("弹幕不能为空")
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.status == "ended" {
		return rule("牌局已结束")
	}
	if !client.lastChat.IsZero() && time.Since(client.lastChat) < danmakuInterval {
		return rule("10 秒内只能发一条弹幕")
	}
	row := store.DanmakuRow{
		MatchID:  room.id,
		GuestKey: client.Identity.GuestKey,
		Nickname: displayName(client.Identity.Nickname),
		Content:  text,
	}
	if client.Identity.Role == auth.RoleUser {
		row.UserID = &client.Identity.UserID
		row.GuestKey = ""
	} else {
		row.Nickname = "游客"
	}
	id, err := h.repo.InsertDanmaku(ctx, row)
	if err != nil {
		return err
	}
	client.lastChat = time.Now()
	body := mustJSON(map[string]any{
		"type":     "danmaku",
		"id":       id,
		"nickname": row.Nickname,
		"content":  text,
		"guest":    client.Identity.Role != auth.RoleUser,
	})
	for _, current := range room.clients {
		current.enqueue(body)
	}
	return nil
}

func (r *live) broadcastLocked() {
	for _, client := range r.clients {
		client.enqueue(mustJSON(map[string]any{"type": "state", "room": r.view(client.Identity)}))
	}
}

func (r *live) view(self auth.Identity) map[string]any {
	seats := make([]map[string]any, 0, 4)
	submitted := map[int64]bool{}
	for id := range r.reports {
		submitted[id] = true
	}
	mySeat := ""
	for _, meta := range seatOrder {
		item := r.seats[meta.Key]
		view := map[string]any{
			"key": meta.Key, "label": meta.Label, "empty": item == nil,
			"userId": int64(0), "nickname": "", "avatarUrl": "", "score": 0, "submitted": false,
		}
		if item != nil {
			view["userId"] = item.userID
			view["nickname"] = item.nickname
			view["avatarUrl"] = item.avatarURL
			view["score"] = item.score
			view["submitted"] = r.roundStatus == "reporting" && submitted[item.userID]
			if item.userID == self.UserID {
				mySeat = meta.Key
			}
		}
		seats = append(seats, view)
	}
	online := make([]map[string]any, 0, len(r.clients))
	for _, client := range r.clients {
		nickname := displayName(client.Identity.Nickname)
		guest := client.Identity.Role != auth.RoleUser
		if guest {
			nickname = "游客"
		}
		online = append(online, map[string]any{
			"key": client.key(), "nickname": nickname, "avatarUrl": client.Identity.AvatarURL,
			"guest": guest, "userId": client.Identity.UserID,
		})
	}
	history := make([]map[string]any, 0, len(r.history))
	for _, item := range r.history {
		deltas := make([]map[string]any, 0, len(item.Deltas))
		for _, meta := range seatOrder {
			seat := r.seats[meta.Key]
			if seat == nil {
				continue
			}
			deltas = append(deltas, map[string]any{
				"userId": seat.userID, "nickname": seat.nickname, "delta": item.Deltas[seat.userID],
			})
		}
		lines := item.Lines
		if lines == nil {
			lines = []string{}
		}
		history = append(history, map[string]any{"roundNo": item.RoundNo, "lines": lines, "deltas": deltas})
	}
	return map[string]any{
		"code": r.code, "status": r.status, "hostUserId": r.hostID,
		"roundNo": r.roundNo, "roundStatus": r.roundStatus, "settleError": r.settleError,
		"seats": seats, "online": online, "history": history,
		"you": map[string]any{
			"userId": self.UserID, "guest": self.Role != auth.RoleUser, "seat": mySeat,
			"host":      self.UserID == r.hostID && self.Role == auth.RoleUser,
			"submitted": mySeat != "" && submitted[self.UserID] && r.roundStatus == "reporting",
		},
	}
}

func (r *live) seatRows() []store.SeatRow {
	rows := make([]store.SeatRow, 0, len(r.seats))
	for key, item := range r.seats {
		rows = append(rows, store.SeatRow{UserID: item.userID, Seat: key, Nickname: item.nickname, AvatarURL: item.avatarURL, Score: item.score})
	}
	return rows
}

func (r *live) seatList() []*seat {
	list := make([]*seat, 0, len(r.seats))
	for _, meta := range seatOrder {
		if item := r.seats[meta.Key]; item != nil {
			list = append(list, item)
		}
	}
	return list
}

func (r *live) seatOf(userID int64) *seat {
	for _, item := range r.seats {
		if item.userID == userID {
			return item
		}
	}
	return nil
}

func (r *live) seatByUser(userID int64) *seat {
	return r.seatOf(userID)
}

func (r *live) scorePlayers() []score.Player {
	list := r.seatList()
	players := make([]score.Player, len(list))
	for i, item := range list {
		players[i] = score.Player{ID: strconv.FormatInt(item.userID, 10), Name: item.nickname}
	}
	return players
}

func (r *live) scoreReports() map[string]score.Incoming {
	raw := make(map[string]score.Incoming, len(r.reports))
	for id, report := range r.reports {
		raw[strconv.FormatInt(id, 10)] = report
	}
	return raw
}

func cloneSeats(seats map[string]*seat) map[string]*seat {
	copied := make(map[string]*seat, len(seats))
	for key, item := range seats {
		dup := *item
		copied[key] = &dup
	}
	return copied
}

func validSeat(key string) bool {
	for _, meta := range seatOrder {
		if meta.Key == key {
			return true
		}
	}
	return false
}

func displayName(name string) string {
	name = trimRunes(name, 16)
	if name == "" {
		return "微信用户"
	}
	return name
}

func trimRunes(value string, max int) string {
	value = trimSpace(value)
	if utf8.RuneCountInString(value) <= max {
		return value
	}
	runes := []rune(value)
	return string(runes[:max])
}

func trimSpace(value string) string {
	out := make([]rune, 0, len(value))
	for _, r := range value {
		if r == '\n' || r == '\r' || r == '\t' {
			continue
		}
		out = append(out, r)
	}
	start := 0
	end := len(out)
	for start < end && out[start] == ' ' {
		start++
	}
	for end > start && out[end-1] == ' ' {
		end--
	}
	return string(out[start:end])
}

func randomCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("random code: %w", err)
	}
	for i := range buf {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	return string(buf), nil
}

func mustJSON(value any) []byte {
	payload, err := json.Marshal(value)
	if err != nil {
		return []byte(`{"type":"error","message":"编码失败"}`)
	}
	return payload
}
