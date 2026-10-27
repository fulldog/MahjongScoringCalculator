package api

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

func TestAccessLogsRequestAndResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	core, recorded := observer.New(zapcore.InfoLevel)
	router := gin.New()
	router.Use(accessLog(zap.New(core)))
	router.POST("/api/v1/minigames", func(c *gin.Context) {
		raw, err := io.ReadAll(c.Request.Body)
		if err != nil {
			t.Errorf("read body: %v", err)
		}
		if string(raw) != `{"score":1}` {
			t.Errorf("handler body %s", raw)
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/minigames?game=zuma", strings.NewReader(`{"score":1}`))
	req.Header.Set("Authorization", "Bearer secret-token")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	entries := recorded.All()
	if len(entries) != 1 {
		t.Fatalf("entries %d", len(entries))
	}
	fields := entries[0].ContextMap()
	if fields["request"] != `{"score":1}` {
		t.Fatalf("request %v", fields["request"])
	}
	response, _ := fields["response"].(string)
	if !strings.Contains(response, `"ok":true`) {
		t.Fatalf("response %v", fields["response"])
	}
	if fields["query"] != "game=zuma" {
		t.Fatalf("query %v", fields["query"])
	}
	blob := fmt.Sprint(fields)
	if strings.Contains(blob, "secret-token") || strings.Contains(blob, "Bearer") {
		t.Fatalf("authorization leaked: %s", blob)
	}
}

func TestAccessSkipsLoginBodies(t *testing.T) {
	paths := []string{"/api/v1/auth/wechat", "/api/v1/auth/guest", "/api/admin/login"}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			core, recorded := observer.New(zapcore.InfoLevel)
			router := gin.New()
			router.Use(accessLog(zap.New(core)))
			router.POST(path, func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"token": "secret-token"})
			})
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"password":"secret-token"}`))
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			entries := recorded.All()
			if len(entries) != 1 {
				t.Fatalf("entries %d", len(entries))
			}
			fields := entries[0].ContextMap()
			if _, ok := fields["request"]; ok {
				t.Fatal("request body logged")
			}
			if _, ok := fields["response"]; ok {
				t.Fatal("response body logged")
			}
			if fields["status"] != int64(http.StatusOK) {
				t.Fatalf("status %v", fields["status"])
			}
			if strings.Contains(fmt.Sprint(fields), "secret-token") {
				t.Fatalf("secret leaked: %v", fields)
			}
		})
	}
}

func TestAccessSkipsWebSocketBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	core, recorded := observer.New(zapcore.InfoLevel)
	router := gin.New()
	router.Use(accessLog(zap.New(core)))
	router.GET("/api/v1/ws", func(c *gin.Context) {
		c.Status(http.StatusSwitchingProtocols)
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ws?token=secret-token", strings.NewReader("frame"))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	fields := recorded.All()[0].ContextMap()
	if _, ok := fields["request"]; ok {
		t.Fatal("request body logged")
	}
	if fields["query"] != "token=secret-token" {
		t.Fatalf("query %v", fields["query"])
	}
}
