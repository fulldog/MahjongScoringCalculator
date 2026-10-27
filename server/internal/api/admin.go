package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func (s *Server) adminLogin(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		fail(c, http.StatusBadRequest, "请求无效")
		return
	}
	admin, err := s.store.AdminByUsername(c.Request.Context(), body.Username)
	if err != nil || store.CheckPassword(admin.PasswordHash, body.Password) != nil {
		fail(c, http.StatusUnauthorized, "账号或密码错误")
		return
	}
	token, err := s.tokens.SignAdmin(admin.ID, admin.Username)
	if err != nil {
		fail(c, http.StatusInternalServerError, "登录失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "username": admin.Username})
}

func (s *Server) overview(c *gin.Context) {
	overview, err := s.store.Overview(c.Request.Context(), time.Now())
	if err != nil {
		s.logs.Error.Error("overview", zap.Error(err))
		fail(c, http.StatusInternalServerError, "加载失败")
		return
	}
	c.JSON(http.StatusOK, overview)
}

func (s *Server) adminUsers(c *gin.Context) {
	list, err := s.store.ListUsers(c.Request.Context(), strings.TrimSpace(c.Query("keyword")), pageQuery(c))
	if err != nil {
		s.logs.Error.Error("users", zap.Error(err))
		fail(c, http.StatusInternalServerError, "加载失败")
		return
	}
	c.JSON(http.StatusOK, list)
}

func (s *Server) adminMatches(c *gin.Context) {
	list, err := s.store.ListMatches(c.Request.Context(), c.Query("status"), pageQuery(c))
	if err != nil {
		s.logs.Error.Error("matches", zap.Error(err))
		fail(c, http.StatusInternalServerError, "加载失败")
		return
	}
	c.JSON(http.StatusOK, list)
}

func (s *Server) adminMatch(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		fail(c, http.StatusBadRequest, "牌局无效")
		return
	}
	detail, err := s.store.MatchDetailByID(c.Request.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		fail(c, http.StatusNotFound, "牌局不存在")
		return
	}
	if err != nil {
		s.logs.Error.Error("match detail", zap.Error(err))
		fail(c, http.StatusInternalServerError, "加载失败")
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (s *Server) adminMinigames(c *gin.Context) {
	game := c.DefaultQuery("game", "zuma")
	switch game {
	case "zuma", "cutrope", "kingdomrush":
	default:
		fail(c, http.StatusBadRequest, "游戏无效")
		return
	}
	rows, err := s.store.Leaderboard(c.Request.Context(), game)
	if err != nil {
		s.logs.Error.Error("leaderboard", zap.Error(err))
		fail(c, http.StatusInternalServerError, "加载失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"game": game, "items": rows})
}

func pageQuery(c *gin.Context) store.Page {
	page, _ := strconv.Atoi(c.Query("page"))
	size, _ := strconv.Atoi(c.Query("pageSize"))
	return store.Page{Page: page, PageSize: size}
}
