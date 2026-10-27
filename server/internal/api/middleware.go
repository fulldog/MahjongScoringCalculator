package api

import (
	"net/http"
	"runtime/debug"
	"strings"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/auth"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func (s *Server) recovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		s.logs.Error.Error("panic",
			zap.Any("panic", recovered),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.ByteString("stack", debug.Stack()),
		)
		c.AbortWithStatus(http.StatusInternalServerError)
	})
}

func (s *Server) cors(c *gin.Context) {
	c.Header("Vary", "Origin")
	origin := c.GetHeader("Origin")
	if origin != "" && origin == s.cfg.AdminOrigin {
		c.Header("Access-Control-Allow-Origin", s.cfg.AdminOrigin)
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Max-Age", "600")
	}
	if c.Request.Method == http.MethodOptions {
		c.AbortWithStatus(http.StatusNoContent)
		return
	}
	c.Next()
}

func (s *Server) requireUser(c *gin.Context) {
	ident, ok := s.bearer(c)
	if !ok || ident.Role != auth.RoleUser {
		fail(c, http.StatusUnauthorized, "请先登录")
		c.Abort()
		return
	}
	c.Set("ident", ident)
}

func (s *Server) requirePlayer(c *gin.Context) {
	ident, ok := s.bearer(c)
	if !ok || (ident.Role != auth.RoleUser && ident.Role != auth.RoleGuest) {
		fail(c, http.StatusUnauthorized, "请先登录")
		c.Abort()
		return
	}
	c.Set("ident", ident)
}

func (s *Server) requireAdmin(c *gin.Context) {
	if c.Request.Method == http.MethodPost && c.FullPath() == "/api/admin/login" {
		c.Next()
		return
	}
	ident, ok := s.bearer(c)
	if !ok || ident.Role != auth.RoleAdmin {
		fail(c, http.StatusUnauthorized, "请先登录管理后台")
		c.Abort()
		return
	}
	c.Set("ident", ident)
}

func (s *Server) bearer(c *gin.Context) (auth.Identity, bool) {
	header := c.GetHeader("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return auth.Identity{}, false
	}
	ident, err := s.tokens.Parse(strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return auth.Identity{}, false
	}
	return ident, true
}

func current(c *gin.Context) auth.Identity {
	value, _ := c.Get("ident")
	ident, _ := value.(auth.Identity)
	return ident
}
