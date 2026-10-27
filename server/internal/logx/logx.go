package logx

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	rotatelogs "github.com/lestrrat-go/file-rotatelogs"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logs writes access, info, and error streams to separate daily files.
type Logs struct {
	Access *zap.Logger
	Info   *zap.Logger
	Error  *zap.Logger

	closers []io.Closer
}

// Open creates daily JSON logs under dir and deletes files older than maxAge.
func Open(dir string, maxAge time.Duration) (*Logs, error) {
	if dir == "" {
		dir = "logs"
	}
	if maxAge <= 0 {
		maxAge = 30 * 24 * time.Hour
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create log dir: %w", err)
	}
	access, accessCloser, err := dailyLogger(dir, "access", maxAge, zap.LevelEnablerFunc(func(level zapcore.Level) bool {
		return level == zapcore.InfoLevel
	}))
	if err != nil {
		return nil, err
	}
	info, infoCloser, err := dailyLogger(dir, "info", maxAge, zap.LevelEnablerFunc(func(level zapcore.Level) bool {
		return level >= zapcore.InfoLevel && level < zapcore.ErrorLevel
	}))
	if err != nil {
		return nil, joinClose(err, accessCloser)
	}
	errLog, errCloser, err := dailyLogger(dir, "error", maxAge, zap.LevelEnablerFunc(func(level zapcore.Level) bool {
		return level >= zapcore.ErrorLevel
	}))
	if err != nil {
		return nil, joinClose(err, accessCloser, infoCloser)
	}
	return &Logs{
		Access:  access,
		Info:    info,
		Error:   errLog,
		closers: []io.Closer{accessCloser, infoCloser, errCloser},
	}, nil
}

// NewFromLoggers builds Logs from existing loggers. Tests use this to observe records.
func NewFromLoggers(access, info, errLog *zap.Logger) *Logs {
	return &Logs{Access: access, Info: info, Error: errLog}
}

// Close flushes and closes the underlying files.
func (l *Logs) Close() error {
	if l == nil {
		return nil
	}
	var errs []error
	for _, logger := range []*zap.Logger{l.Access, l.Info, l.Error} {
		if logger == nil {
			continue
		}
		if err := logger.Sync(); err != nil && !isIgnorableSync(err) {
			errs = append(errs, err)
		}
	}
	for _, closer := range l.closers {
		if err := closer.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func dailyLogger(dir, name string, maxAge time.Duration, level zapcore.LevelEnabler) (*zap.Logger, io.Closer, error) {
	writer, err := rotatelogs.New(
		filepath.Join(dir, name+"-%Y%m%d.log"),
		rotatelogs.WithClock(rotatelogs.Local),
		rotatelogs.WithMaxAge(maxAge),
		rotatelogs.WithRotationTime(24*time.Hour),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("open %s log: %w", name, err)
	}
	encoder := zap.NewProductionEncoderConfig()
	encoder.EncodeTime = zapcore.ISO8601TimeEncoder
	core := zapcore.NewCore(zapcore.NewJSONEncoder(encoder), zapcore.AddSync(writer), level)
	return zap.New(core), writer, nil
}

func joinClose(err error, closers ...io.Closer) error {
	var errs []error
	errs = append(errs, err)
	for _, closer := range closers {
		if closeErr := closer.Close(); closeErr != nil {
			errs = append(errs, closeErr)
		}
	}
	return errors.Join(errs...)
}

func isIgnorableSync(err error) bool {
	var pathErr *os.PathError
	return errors.As(err, &pathErr)
}
