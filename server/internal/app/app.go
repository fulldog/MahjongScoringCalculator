package app

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/api"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/auth"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/config"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/logx"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/room"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/schema"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/wechat"
	"go.uber.org/zap"
)

// Run opens logs and MySQL, then serves the API until the process is interrupted.
func Run(cfg config.Config) error {
	logs, err := logx.Open(cfg.LogDir, time.Duration(cfg.LogMaxAgeDays)*24*time.Hour)
	if err != nil {
		return fmt.Errorf("logs: %w", err)
	}
	defer func() {
		if closeErr := logs.Close(); closeErr != nil {
			fmt.Fprintf(os.Stderr, "close logs: %v\n", closeErr)
		}
	}()
	if cfg.DotenvPath != "" {
		logs.Info.Info("loaded dotenv", zap.String("path", cfg.DotenvPath))
	}
	if cfg.JWTSecret == "dev-secret-change-me" {
		logs.Info.Warn("JWT_SECRET is the local default")
	}
	if err := schema.Up(cfg.MySQLDSN, logs.Gorm()); err != nil {
		logs.Error.Error("migrate", zap.Error(err))
		return fmt.Errorf("migrate: %w", err)
	}
	db, err := store.Open(cfg.MySQLDSN, logs.Gorm())
	if err != nil {
		logs.Error.Error("mysql", zap.Error(err))
		return fmt.Errorf("mysql: %w", err)
	}
	defer func() {
		if closeErr := db.Close(); closeErr != nil {
			logs.Error.Error("close mysql", zap.Error(closeErr))
		}
	}()
	if err := db.EnsureAdmin(context.Background(), cfg.AdminUser, cfg.AdminPassword); err != nil {
		logs.Error.Error("admin seed", zap.Error(err))
		return fmt.Errorf("admin seed: %w", err)
	}
	httpServer := api.New(cfg, db, auth.NewIssuer(cfg.JWTSecret), wechat.New(cfg.WeChatAppID, cfg.WeChatSecret), room.NewHub(db), logs)
	errCh := make(chan error, 1)
	go func() {
		logs.Info.Info("listen", zap.String("addr", cfg.Addr))
		errCh <- httpServer.Run(cfg.Addr)
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-stop:
		logs.Info.Info("shutdown")
		return nil
	case err := <-errCh:
		if err != nil {
			logs.Error.Error("listen", zap.Error(err))
			return fmt.Errorf("listen: %w", err)
		}
		return nil
	}
}
