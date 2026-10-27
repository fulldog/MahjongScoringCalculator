package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/config"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/logx"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func TestCORSAllowsConfiguredOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv := newTestServer(t, "http://localhost:5173")
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatalf("origin %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	methods := rec.Header().Get("Access-Control-Allow-Methods")
	for _, method := range []string{"PUT", "PATCH", "DELETE"} {
		if !strings.Contains(methods, method) {
			t.Fatalf("methods %q", methods)
		}
	}
	if rec.Header().Get("Access-Control-Max-Age") != "600" {
		t.Fatalf("max-age %q", rec.Header().Get("Access-Control-Max-Age"))
	}
	if rec.Header().Get("Vary") != "Origin" {
		t.Fatalf("vary %q", rec.Header().Get("Vary"))
	}
}

func TestCORSRejectsOtherOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv := newTestServer(t, "http://localhost:5173")
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://evil.example")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("origin %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestCORSWithoutOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	srv := newTestServer(t, "http://localhost:5173")
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("origin %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func newTestServer(t *testing.T, origin string) *Server {
	t.Helper()
	logs := logx.NewFromLoggers(zap.NewNop(), zap.NewNop(), zap.NewNop())
	return New(config.Config{AdminOrigin: origin}, nil, nil, nil, nil, logs)
}
