package api

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const maxLogBody = 64 * 1024

func accessLog(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		skipBody := hideBody(c.Request.URL.Path)
		var request string
		var requestTruncated bool
		if !skipBody && c.Request.Body != nil {
			raw, err := io.ReadAll(c.Request.Body)
			if err != nil {
				logger.Info("http",
					zap.String("method", c.Request.Method),
					zap.String("path", c.Request.URL.Path),
					zap.Error(err),
				)
				c.AbortWithStatus(http.StatusBadRequest)
				return
			}
			c.Request.Body = io.NopCloser(bytes.NewReader(raw))
			request, requestTruncated = clipBody(raw)
		}
		writer := &bodyWriter{ResponseWriter: c.Writer, skip: skipBody, max: maxLogBody}
		c.Writer = writer
		c.Next()
		fields := []zap.Field{
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(start)),
			zap.String("ip", c.ClientIP()),
			zap.String("query", c.Request.URL.RawQuery),
		}
		if !skipBody {
			response, responseTruncated := clipBody(writer.buf.Bytes())
			fields = append(fields,
				zap.String("request", request),
				zap.Bool("requestTruncated", requestTruncated),
				zap.String("response", response),
				zap.Bool("responseTruncated", responseTruncated),
			)
		}
		logger.Info("http", fields...)
	}
}

func hideBody(path string) bool {
	switch path {
	case "/api/v1/auth/wechat", "/api/v1/auth/guest", "/api/admin/login", "/api/v1/ws":
		return true
	default:
		return false
	}
}

func clipBody(raw []byte) (string, bool) {
	if len(raw) <= maxLogBody {
		return string(raw), false
	}
	return string(raw[:maxLogBody]), true
}

type bodyWriter struct {
	gin.ResponseWriter
	buf  bytes.Buffer
	skip bool
	max  int
}

func (w *bodyWriter) Write(p []byte) (int, error) {
	w.capture(p)
	return w.ResponseWriter.Write(p)
}

func (w *bodyWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}

func (w *bodyWriter) capture(p []byte) {
	if w.skip || w.buf.Len() >= w.max {
		return
	}
	remain := w.max - w.buf.Len()
	if len(p) > remain {
		p = p[:remain]
	}
	if _, err := w.buf.Write(p); err != nil {
		w.skip = true
	}
}
