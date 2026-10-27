package api

import (
	"context"
	"net/http"
	"time"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/auth"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/room"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"nhooyr.io/websocket"
)

func (s *Server) loginWeChat(c *gin.Context) {
	var body struct {
		Code      string `json:"code"`
		DevOpenID string `json:"devOpenid"`
		Nickname  string `json:"nickname"`
		AvatarURL string `json:"avatarUrl"`
		GuestKey  string `json:"guestKey"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求无效")
		return
	}
	openid, err := s.wechat.OpenID(c.Request.Context(), body.Code, body.DevOpenID)
	if err != nil {
		fail(c, http.StatusBadRequest, err.Error())
		return
	}
	user, err := s.store.UpsertUser(c.Request.Context(), openid, clip(body.Nickname, 16), clip(body.AvatarURL, 512))
	if err != nil {
		s.logs.Error.Error("upsert user", zap.Error(err))
		fail(c, http.StatusInternalServerError, "登录失败")
		return
	}
	if err := s.store.BindGuestRecords(c.Request.Context(), user.ID, clip(body.GuestKey, 64)); err != nil {
		s.logs.Error.Error("bind guest", zap.Error(err))
	}
	token, err := s.tokens.SignUser(user.ID, user.Nickname)
	if err != nil {
		fail(c, http.StatusInternalServerError, "登录失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func (s *Server) loginGuest(c *gin.Context) {
	var body struct {
		GuestKey string `json:"guestKey"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !validGuestKey(body.GuestKey) {
		fail(c, http.StatusBadRequest, "游客标识无效")
		return
	}
	token, err := s.tokens.SignGuest(body.GuestKey)
	if err != nil {
		fail(c, http.StatusInternalServerError, "登录失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "guestKey": body.GuestKey, "nickname": "游客"})
}

func (s *Server) bindGuest(c *gin.Context) {
	var body struct {
		GuestKey string `json:"guestKey"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || !validGuestKey(body.GuestKey) {
		fail(c, http.StatusBadRequest, "游客标识无效")
		return
	}
	ident := current(c)
	if err := s.store.BindGuestRecords(c.Request.Context(), ident.UserID, body.GuestKey); err != nil {
		s.logs.Error.Error("bind guest", zap.Error(err))
		fail(c, http.StatusInternalServerError, "绑定失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) me(c *gin.Context) {
	ident := current(c)
	user, err := s.store.UserByID(c.Request.Context(), ident.UserID)
	if err != nil {
		fail(c, http.StatusUnauthorized, "请先登录")
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (s *Server) stats(c *gin.Context) {
	ident := current(c)
	stats, err := s.store.PlayerStats(c.Request.Context(), ident.UserID, time.Now().AddDate(0, 0, -30))
	if err != nil {
		s.logs.Error.Error("stats", zap.Error(err))
		fail(c, http.StatusInternalServerError, "统计失败")
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (s *Server) createRoom(c *gin.Context) {
	code, err := s.hub.Create(c.Request.Context(), current(c))
	if err != nil {
		s.writeRoomErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": code})
}

func (s *Server) roomSnapshot(c *gin.Context) {
	view, err := s.hub.Snapshot(c.Request.Context(), c.Param("code"), current(c))
	if err != nil {
		s.writeRoomErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"room": view})
}

func (s *Server) reportMini(c *gin.Context) {
	var body struct {
		Game    string `json:"game"`
		Result  string `json:"result"`
		Score   int    `json:"score"`
		LevelNo int    `json:"levelNo"`
		Stars   int    `json:"stars"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求无效")
		return
	}
	switch body.Game {
	case "zuma", "cutrope", "kingdomrush":
	default:
		fail(c, http.StatusBadRequest, "游戏无效")
		return
	}
	if body.Result != "win" && body.Result != "lose" {
		fail(c, http.StatusBadRequest, "结果无效")
		return
	}
	if body.Score < 0 {
		body.Score = 0
	}
	if body.Stars < 0 {
		body.Stars = 0
	}
	if body.Stars > 3 {
		body.Stars = 3
	}
	ident := current(c)
	record := store.MiniRecord{Game: body.Game, Result: body.Result, Score: body.Score, LevelNo: body.LevelNo, Stars: body.Stars}
	if ident.Role == auth.RoleUser {
		record.UserID = &ident.UserID
	} else {
		record.GuestKey = ident.GuestKey
	}
	if err := s.store.InsertMiniRecord(c.Request.Context(), record); err != nil {
		s.logs.Error.Error("minigame", zap.Error(err))
		fail(c, http.StatusInternalServerError, "上报失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (s *Server) socket(c *gin.Context) {
	ident, err := s.tokens.Parse(c.Query("token"))
	if err != nil || (ident.Role != auth.RoleUser && ident.Role != auth.RoleGuest) {
		fail(c, http.StatusUnauthorized, "请先登录")
		return
	}
	if ident.Role == auth.RoleUser {
		user, err := s.store.UserByID(c.Request.Context(), ident.UserID)
		if err != nil {
			fail(c, http.StatusUnauthorized, "请先登录")
			return
		}
		ident.Nickname = user.Nickname
		ident.AvatarURL = user.AvatarURL
	}
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		OriginPatterns:  []string{"*"},
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		s.logs.Error.Error("accept websocket", zap.Error(err))
		return
	}
	conn.SetReadLimit(1 << 16)
	client := &room.Client{Identity: ident, Send: make(chan []byte, 16)}
	live, err := s.hub.Join(c.Request.Context(), c.Query("room"), client)
	if err != nil {
		_ = conn.Close(websocket.StatusPolicyViolation, "join failed")
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go writeLoop(ctx, conn, client)
	for {
		_, payload, err := conn.Read(context.Background())
		if err != nil {
			break
		}
		callCtx, callCancel := context.WithTimeout(context.Background(), 5*time.Second)
		s.hub.Handle(callCtx, live, client, payload)
		callCancel()
	}
	cancel()
	s.hub.Leave(live, client)
	_ = conn.Close(websocket.StatusNormalClosure, "")
}

func writeLoop(ctx context.Context, conn *websocket.Conn, client *room.Client) {
	for {
		select {
		case <-ctx.Done():
			return
		case payload := <-client.Send:
			writeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			err := conn.Write(writeCtx, websocket.MessageText, payload)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
