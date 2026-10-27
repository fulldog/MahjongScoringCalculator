package logx

import (
	"context"
	"time"

	"go.uber.org/zap"
	gormlogger "gorm.io/gorm/logger"
)

type gormLogger struct {
	info  *zap.Logger
	err   *zap.Logger
	level gormlogger.LogLevel
}

// Gorm logs every SQL statement to info, and failures to error as well.
func (l *Logs) Gorm() gormlogger.Interface {
	return &gormLogger{info: l.Info, err: l.Error, level: gormlogger.Info}
}

func (l *gormLogger) LogMode(level gormlogger.LogLevel) gormlogger.Interface {
	next := *l
	next.level = level
	return &next
}

func (l *gormLogger) Info(_ context.Context, msg string, args ...interface{}) {
	if l.level < gormlogger.Info {
		return
	}
	l.info.Sugar().Infof(msg, args...)
}

func (l *gormLogger) Warn(_ context.Context, msg string, args ...interface{}) {
	if l.level < gormlogger.Warn {
		return
	}
	l.info.Sugar().Warnf(msg, args...)
}

func (l *gormLogger) Error(_ context.Context, msg string, args ...interface{}) {
	if l.level < gormlogger.Error {
		return
	}
	l.err.Sugar().Errorf(msg, args...)
}

func (l *gormLogger) Trace(_ context.Context, begin time.Time, fc func() (string, int64), err error) {
	if l.level <= gormlogger.Silent {
		return
	}
	sql, rows := fc()
	fields := []zap.Field{
		zap.String("sql", sql),
		zap.Duration("elapsed", time.Since(begin)),
		zap.Int64("rows", rows),
	}
	l.info.Info("sql", fields...)
	if err == nil {
		return
	}
	errFields := make([]zap.Field, len(fields)+1)
	copy(errFields, fields)
	errFields[len(fields)] = zap.Error(err)
	l.err.Error("sql", errFields...)
}
