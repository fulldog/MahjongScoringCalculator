package api

import (
	"net/http"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/auth"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/config"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/logx"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/room"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/wechat"
	"github.com/gin-gonic/gin"
)

// Server is the HTTP and WebSocket API.
type Server struct {
	cfg    config.Config
	store  *store.Store
	tokens *auth.Issuer
	wechat *wechat.Client
	hub    *room.Hub
	logs   *logx.Logs
	engine *gin.Engine
}

// New wires routes.
func New(cfg config.Config, st *store.Store, tokens *auth.Issuer, wx *wechat.Client, hub *room.Hub, logs *logx.Logs) *Server {
	gin.SetMode(gin.ReleaseMode)
	s := &Server{cfg: cfg, store: st, tokens: tokens, wechat: wx, hub: hub, logs: logs, engine: gin.New()}
	s.engine.Use(accessLog(logs.Access), s.cors, s.recovery())
	s.engine.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	player := s.engine.Group("/api/v1")
	player.POST("/auth/wechat", s.loginWeChat)
	player.POST("/auth/guest", s.loginGuest)
	player.POST("/auth/bind-guest", s.requireUser, s.bindGuest)
	player.GET("/me", s.requireUser, s.me)
	player.GET("/me/stats", s.requireUser, s.stats)
	player.POST("/rooms", s.requireUser, s.createRoom)
	player.GET("/rooms/:code", s.requirePlayer, s.roomSnapshot)
	player.GET("/ws", s.socket)
	player.POST("/minigames", s.requirePlayer, s.reportMini)
	admin := s.engine.Group("/api/admin")
	admin.POST("/login", s.adminLogin)
	admin.Use(s.requireAdmin)
	admin.GET("/overview", s.overview)
	admin.GET("/users", s.adminUsers)
	admin.GET("/matches", s.adminMatches)
	admin.GET("/matches/:id", s.adminMatch)
	admin.GET("/minigames", s.adminMinigames)
	return s
}

// Handler is the Gin engine.
func (s *Server) Handler() http.Handler { return s.engine }

// Run starts the Gin server on addr.
func (s *Server) Run(addr string) error {
	return s.engine.Run(addr)
}
