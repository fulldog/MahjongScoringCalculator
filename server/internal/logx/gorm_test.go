package logx

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
	gormlogger "gorm.io/gorm/logger"
)

func TestTraceSuccessWritesInfoOnly(t *testing.T) {
	logs, infoLogs, errLogs := observeLogs()
	logs.Gorm().Trace(context.Background(), time.Now().Add(-time.Millisecond), func() (string, int64) {
		return "SELECT 1", 1
	}, nil)
	if infoLogs.Len() != 1 {
		t.Fatalf("info entries %d", infoLogs.Len())
	}
	if errLogs.Len() != 0 {
		t.Fatalf("error entries %d", errLogs.Len())
	}
	if got := infoLogs.All()[0].ContextMap()["sql"]; got != "SELECT 1" {
		t.Fatalf("sql %v", got)
	}
}

func TestTraceErrorWritesInfoAndError(t *testing.T) {
	logs, infoLogs, errLogs := observeLogs()
	logs.Gorm().Trace(context.Background(), time.Now(), func() (string, int64) {
		return "UPDATE matches SET status = 'ended'", 0
	}, errors.New("boom"))
	if infoLogs.Len() != 1 || errLogs.Len() != 1 {
		t.Fatalf("info %d error %d", infoLogs.Len(), errLogs.Len())
	}
	if errLogs.All()[0].ContextMap()["error"] == nil {
		t.Fatal("missing error field")
	}
}

func TestTraceSilentSkipsSQL(t *testing.T) {
	logs, infoLogs, errLogs := observeLogs()
	logs.Gorm().LogMode(gormlogger.Silent).Trace(context.Background(), time.Now(), func() (string, int64) {
		return "SELECT 1", 1
	}, errors.New("boom"))
	if infoLogs.Len() != 0 || errLogs.Len() != 0 {
		t.Fatalf("info %d error %d", infoLogs.Len(), errLogs.Len())
	}
}

func observeLogs() (*Logs, *observer.ObservedLogs, *observer.ObservedLogs) {
	infoCore, infoLogs := observer.New(zapcore.InfoLevel)
	errCore, errLogs := observer.New(zapcore.ErrorLevel)
	return NewFromLoggers(zap.NewNop(), zap.New(infoCore), zap.New(errCore)), infoLogs, errLogs
}
