package api

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/room"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func (s *Server) writeRoomErr(c *gin.Context, err error) {
	var ruleErr *room.RuleError
	if errors.As(err, &ruleErr) {
		fail(c, http.StatusBadRequest, ruleErr.Message)
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		fail(c, http.StatusNotFound, "房间不存在")
		return
	}
	s.logs.Error.Error("room", zap.Error(err))
	fail(c, http.StatusInternalServerError, "操作失败")
}

func fail(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"message": message})
}

func clip(value string, max int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= max {
		return value
	}
	return string([]rune(value)[:max])
}

func validGuestKey(value string) bool {
	if len(value) < 8 || len(value) > 64 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}
