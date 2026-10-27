package schema

import (
	"context"
	_ "embed"
	"fmt"
	"strings"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

//go:embed migrations/000001_init.up.sql
var upSQL string

// Up applies the initial schema once.
func Up(dsn string, gormLogger logger.Interface) (err error) {
	if gormLogger == nil {
		gormLogger = logger.Discard
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 gormLogger,
	})
	if err != nil {
		return fmt.Errorf("open mysql: %w", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("mysql pool: %w", err)
	}
	defer func() {
		if closeErr := sqlDB.Close(); closeErr != nil && err == nil {
			err = fmt.Errorf("close mysql: %w", closeErr)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err = sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("ping mysql: %w", err)
	}
	gdb := db.WithContext(ctx)
	if err = gdb.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INT PRIMARY KEY,
			applied_at DATETIME NOT NULL
		)
	`).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	var count int
	if err = gdb.Raw(`SELECT COUNT(*) FROM schema_migrations WHERE version = 1`).Scan(&count).Error; err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	if count > 0 {
		return nil
	}
	for _, stmt := range strings.Split(upSQL, ";") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if err = gdb.Exec(stmt).Error; err != nil {
			return fmt.Errorf("apply schema: %w", err)
		}
	}
	if err = gdb.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)`, time.Now()).Error; err != nil {
		return fmt.Errorf("record schema version: %w", err)
	}
	return nil
}
