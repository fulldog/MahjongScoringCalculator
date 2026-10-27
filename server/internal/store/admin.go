package store

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Page is an offset window.
type Page struct {
	Page     int
	PageSize int
}

func (p Page) limit() (int, int) {
	page := p.Page
	if page < 1 {
		page = 1
	}
	size := p.PageSize
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	return size, (page - 1) * size
}

// Overview is the admin dashboard.
type Overview struct {
	UserCount     int        `json:"userCount"`
	NewUsersToday int        `json:"newUsersToday"`
	ActiveRooms   int        `json:"activeRooms"`
	MatchCount    int        `json:"matchCount"`
	MinigameToday int        `json:"minigameToday"`
	RecentMatches []MatchRow `json:"recentMatches"`
}

// Overview loads dashboard counters.
func (s *Store) Overview(ctx context.Context, now time.Time) (Overview, error) {
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var overview Overview
	db := s.with(ctx)
	if err := scanOne(db, &overview.UserCount, `SELECT COUNT(*) FROM users`); err != nil {
		return Overview{}, fmt.Errorf("count users: %w", err)
	}
	if err := scanOne(db, &overview.NewUsersToday, `SELECT COUNT(*) FROM users WHERE created_at >= ?`, start); err != nil {
		return Overview{}, fmt.Errorf("count new users: %w", err)
	}
	if err := scanOne(db, &overview.ActiveRooms, `SELECT COUNT(*) FROM matches WHERE status IN ('waiting', 'playing')`); err != nil {
		return Overview{}, fmt.Errorf("count rooms: %w", err)
	}
	if err := scanOne(db, &overview.MatchCount, `SELECT COUNT(*) FROM matches`); err != nil {
		return Overview{}, fmt.Errorf("count matches: %w", err)
	}
	if err := scanOne(db, &overview.MinigameToday, `SELECT COUNT(*) FROM minigame_records WHERE created_at >= ?`, start); err != nil {
		return Overview{}, fmt.Errorf("count minigames: %w", err)
	}
	if err := scanMany(db, &overview.RecentMatches, `
		SELECT m.id, m.code, m.host_user_id, m.status, m.started_at, m.ended_at, m.created_at,
			IFNULL(u.nickname, '') AS host_name
		FROM matches m
		LEFT JOIN users u ON u.id = m.host_user_id
		ORDER BY m.id DESC
		LIMIT 8
	`); err != nil {
		return Overview{}, fmt.Errorf("recent matches: %w", err)
	}
	if overview.RecentMatches == nil {
		overview.RecentMatches = []MatchRow{}
	}
	return overview, nil
}

// UserList is a page of WeChat users.
type UserList struct {
	Total int    `json:"total"`
	Items []User `json:"items"`
}

// ListUsers searches users.
func (s *Store) ListUsers(ctx context.Context, keyword string, page Page) (UserList, error) {
	limit, offset := page.limit()
	like := "%" + keyword + "%"
	var list UserList
	db := s.with(ctx)
	if err := scanOne(db, &list.Total, `
		SELECT COUNT(*) FROM users WHERE ? = '' OR nickname LIKE ? OR openid LIKE ?
	`, keyword, like, like); err != nil {
		return UserList{}, fmt.Errorf("count user list: %w", err)
	}
	if err := scanMany(db, &list.Items, `
		SELECT id, openid, nickname, avatar_url, created_at, last_login_at
		FROM users
		WHERE ? = '' OR nickname LIKE ? OR openid LIKE ?
		ORDER BY id DESC
		LIMIT ? OFFSET ?
	`, keyword, like, like, limit, offset); err != nil {
		return UserList{}, fmt.Errorf("list users: %w", err)
	}
	if list.Items == nil {
		list.Items = []User{}
	}
	return list, nil
}

// MatchList is a page of sessions.
type MatchList struct {
	Total int        `json:"total"`
	Items []MatchRow `json:"items"`
}

// ListMatches filters sessions by status. Empty status returns every session.
func (s *Store) ListMatches(ctx context.Context, status string, page Page) (MatchList, error) {
	limit, offset := page.limit()
	var list MatchList
	db := s.with(ctx)
	if err := scanOne(db, &list.Total, `
		SELECT COUNT(*) FROM matches WHERE ? = '' OR status = ?
	`, status, status); err != nil {
		return MatchList{}, fmt.Errorf("count matches: %w", err)
	}
	if err := scanMany(db, &list.Items, `
		SELECT m.id, m.code, m.host_user_id, m.status, m.started_at, m.ended_at, m.created_at,
			IFNULL(u.nickname, '') AS host_name
		FROM matches m
		LEFT JOIN users u ON u.id = m.host_user_id
		WHERE ? = '' OR m.status = ?
		ORDER BY m.id DESC
		LIMIT ? OFFSET ?
	`, status, status, limit, offset); err != nil {
		return MatchList{}, fmt.Errorf("list matches: %w", err)
	}
	if list.Items == nil {
		list.Items = []MatchRow{}
	}
	return list, nil
}

// MatchDetail is a session with hands and comments.
type MatchDetail struct {
	Match   MatchRow      `json:"match"`
	Seats   []SeatRow     `json:"seats"`
	Rounds  []RoundDetail `json:"rounds"`
	Danmaku []DanmakuRow  `json:"danmaku"`
}

// RoundDetail joins declarations and nets.
type RoundDetail struct {
	ID      int64        `json:"id"`
	RoundNo int          `json:"roundNo"`
	Status  string       `json:"status"`
	Kind    string       `json:"kind"`
	Lines   []string     `json:"lines"`
	Reports []ReportView `json:"reports"`
	Deltas  []DeltaRow   `json:"deltas"`
}

// ReportView is a declaration plus the player name.
type ReportView struct {
	UserID   int64          `json:"userId"`
	Nickname string         `json:"nickname"`
	Payload  map[string]any `json:"payload"`
}

// MatchDetailByID loads one session for the admin.
func (s *Store) MatchDetailByID(ctx context.Context, id int64) (MatchDetail, error) {
	var match MatchRow
	db := s.with(ctx)
	err := scanOne(db, &match, `
		SELECT m.id, m.code, m.host_user_id, m.status, m.started_at, m.ended_at, m.created_at,
			IFNULL(u.nickname, '') AS host_name
		FROM matches m
		LEFT JOIN users u ON u.id = m.host_user_id
		WHERE m.id = ?
	`, id)
	if errors.Is(err, ErrNotFound) {
		return MatchDetail{}, ErrNotFound
	}
	if err != nil {
		return MatchDetail{}, fmt.Errorf("select match detail: %w", err)
	}
	detail := MatchDetail{Match: match, Seats: []SeatRow{}, Rounds: []RoundDetail{}, Danmaku: []DanmakuRow{}}
	seats, err := s.seats(ctx, id)
	if err != nil {
		return MatchDetail{}, err
	}
	detail.Seats = seats
	var rounds []RoundRow
	if err := scanMany(db, &rounds, `
		SELECT id, match_id, round_no, status, kind, lines_json, settled_at
		FROM rounds WHERE match_id = ? ORDER BY round_no
	`, id); err != nil {
		return MatchDetail{}, fmt.Errorf("detail rounds: %w", err)
	}
	var reports []ReportRow
	if err := scanMany(db, &reports, `
		SELECT rr.round_id, rr.user_id, u.nickname, rr.payload
		FROM round_reports rr
		JOIN rounds r ON r.id = rr.round_id
		JOIN users u ON u.id = rr.user_id
		WHERE r.match_id = ?
	`, id); err != nil {
		return MatchDetail{}, fmt.Errorf("detail reports: %w", err)
	}
	var deltas []DeltaRow
	if err := scanMany(db, &deltas, `
		SELECT rd.round_id, rd.user_id, u.nickname, rd.delta
		FROM round_deltas rd
		JOIN rounds r ON r.id = rd.round_id
		JOIN users u ON u.id = rd.user_id
		WHERE r.match_id = ?
	`, id); err != nil {
		return MatchDetail{}, fmt.Errorf("detail deltas: %w", err)
	}
	if err := scanMany(db, &detail.Danmaku, `
		SELECT id, match_id, user_id, guest_key, nickname, content, created_at
		FROM danmaku WHERE match_id = ? ORDER BY id
	`, id); err != nil {
		return MatchDetail{}, fmt.Errorf("detail danmaku: %w", err)
	}
	if detail.Danmaku == nil {
		detail.Danmaku = []DanmakuRow{}
	}
	reportsByRound := map[int64][]ReportView{}
	for _, report := range reports {
		payload := map[string]any{}
		if err := jsonUnmarshal(report.Payload, &payload); err != nil {
			payload = map[string]any{}
		}
		reportsByRound[report.RoundID] = append(reportsByRound[report.RoundID], ReportView{
			UserID: report.UserID, Nickname: report.Nickname, Payload: payload,
		})
	}
	deltasByRound := map[int64][]DeltaRow{}
	for _, delta := range deltas {
		deltasByRound[delta.RoundID] = append(deltasByRound[delta.RoundID], delta)
	}
	for _, round := range rounds {
		lines := round.Lines()
		if lines == nil {
			lines = []string{}
		}
		reportViews := reportsByRound[round.ID]
		if reportViews == nil {
			reportViews = []ReportView{}
		}
		deltaViews := deltasByRound[round.ID]
		if deltaViews == nil {
			deltaViews = []DeltaRow{}
		}
		detail.Rounds = append(detail.Rounds, RoundDetail{
			ID: round.ID, RoundNo: round.RoundNo, Status: round.Status, Kind: round.Kind,
			Lines: lines, Reports: reportViews, Deltas: deltaViews,
		})
	}
	return detail, nil
}

// LeaderRow is one ranked minigame identity.
type LeaderRow struct {
	Nickname string    `gorm:"column:nickname" json:"nickname"`
	GuestInt int       `gorm:"column:guest" json:"-"`
	Guest    bool      `gorm:"-" json:"guest"`
	Score    int       `gorm:"column:score" json:"score"`
	Result   string    `gorm:"column:result" json:"result"`
	LevelNo  int       `gorm:"column:level_no" json:"levelNo"`
	Stars    int       `gorm:"column:stars" json:"stars"`
	PlayedAt time.Time `gorm:"column:played_at" json:"playedAt"`
}

// Leaderboard returns the best score per player for one game.
func (s *Store) Leaderboard(ctx context.Context, game string) ([]LeaderRow, error) {
	var rows []LeaderRow
	err := scanMany(s.with(ctx), &rows, `
		SELECT nickname, guest, score, result, level_no, stars, played_at FROM (
			SELECT
				CASE WHEN r.user_id IS NULL OR r.user_id = 0 THEN '游客' ELSE IFNULL(u.nickname, '游客') END AS nickname,
				CASE WHEN r.user_id IS NULL OR r.user_id = 0 THEN 1 ELSE 0 END AS guest,
				r.score, r.result, r.level_no, r.stars, r.created_at AS played_at,
				ROW_NUMBER() OVER (
					PARTITION BY IFNULL(r.user_id, 0), IF(r.user_id IS NULL, r.guest_key, '')
					ORDER BY r.score DESC, r.id ASC
				) AS rn
			FROM minigame_records r
			LEFT JOIN users u ON u.id = r.user_id
			WHERE r.game = ?
		) ranked
		WHERE rn = 1
		ORDER BY score DESC, played_at ASC
		LIMIT 50
	`, game)
	if err != nil {
		return nil, fmt.Errorf("leaderboard: %w", err)
	}
	if rows == nil {
		rows = []LeaderRow{}
	}
	for i := range rows {
		rows[i].Guest = rows[i].GuestInt == 1
	}
	return rows, nil
}
