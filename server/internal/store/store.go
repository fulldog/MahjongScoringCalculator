package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ErrNotFound is returned when a row does not exist.
var ErrNotFound = errors.New("not found")

// Store is the MySQL access layer backed by GORM.
type Store struct {
	db *gorm.DB
}

// Open connects to MySQL and configures the pool.
func Open(dsn string, gormLogger logger.Interface) (*Store, error) {
	if gormLogger == nil {
		gormLogger = logger.Discard
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 gormLogger,
	})
	if err != nil {
		return nil, fmt.Errorf("open mysql: %w", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("mysql pool: %w", err)
	}
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	if err := sqlDB.Ping(); err != nil {
		if closeErr := sqlDB.Close(); closeErr != nil {
			return nil, fmt.Errorf("ping mysql: %w", errors.Join(err, closeErr))
		}
		return nil, fmt.Errorf("ping mysql: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the pool.
func (s *Store) Close() error {
	sqlDB, err := s.db.DB()
	if err != nil {
		return fmt.Errorf("mysql pool: %w", err)
	}
	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("close mysql: %w", err)
	}
	return nil
}

func (s *Store) with(ctx context.Context) *gorm.DB {
	return s.db.WithContext(ctx)
}

func scanOne(db *gorm.DB, dest any, query string, args ...any) error {
	res := db.Raw(query, args...).Scan(dest)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func scanMany(db *gorm.DB, dest any, query string, args ...any) error {
	return db.Raw(query, args...).Scan(dest).Error
}

func insertID(db *gorm.DB, query string, args ...any) (int64, error) {
	var id int64
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(query, args...).Error; err != nil {
			return err
		}
		if err := tx.Raw(`SELECT LAST_INSERT_ID()`).Scan(&id).Error; err != nil {
			return err
		}
		if id == 0 {
			return fmt.Errorf("missing insert id")
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return id, nil
}

// User is a WeChat player.
type User struct {
	ID          int64     `gorm:"column:id" json:"id"`
	OpenID      string    `gorm:"column:openid" json:"openid"`
	Nickname    string    `gorm:"column:nickname" json:"nickname"`
	AvatarURL   string    `gorm:"column:avatar_url" json:"avatarUrl"`
	CreatedAt   time.Time `gorm:"column:created_at" json:"createdAt"`
	LastLoginAt time.Time `gorm:"column:last_login_at" json:"lastLoginAt"`
}

// UpsertUser creates or refreshes a WeChat user.
func (s *Store) UpsertUser(ctx context.Context, openid, nickname, avatarURL string) (User, error) {
	now := time.Now()
	err := s.with(ctx).Exec(`
		INSERT INTO users (openid, nickname, avatar_url, created_at, last_login_at)
		VALUES (?, ?, ?, ?, ?) AS new
		ON DUPLICATE KEY UPDATE
			nickname = IF(new.nickname = '', users.nickname, new.nickname),
			avatar_url = IF(new.avatar_url = '', users.avatar_url, new.avatar_url),
			last_login_at = new.last_login_at
	`, openid, nickname, avatarURL, now, now).Error
	if err != nil {
		return User{}, fmt.Errorf("upsert user: %w", err)
	}
	return s.UserByOpenID(ctx, openid)
}

// UserByOpenID loads a user by openid.
func (s *Store) UserByOpenID(ctx context.Context, openid string) (User, error) {
	var user User
	err := scanOne(s.with(ctx), &user, `
		SELECT id, openid, nickname, avatar_url, created_at, last_login_at
		FROM users WHERE openid = ?
	`, openid)
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("select user: %w", err)
	}
	return user, nil
}

// UserByID loads a user by primary key.
func (s *Store) UserByID(ctx context.Context, id int64) (User, error) {
	var user User
	err := scanOne(s.with(ctx), &user, `
		SELECT id, openid, nickname, avatar_url, created_at, last_login_at
		FROM users WHERE id = ?
	`, id)
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("select user: %w", err)
	}
	return user, nil
}

// EnsureAdmin inserts the seed admin when the username is absent.
func (s *Store) EnsureAdmin(ctx context.Context, username, password string) error {
	var count int
	if err := scanOne(s.with(ctx), &count, `SELECT COUNT(*) FROM admins WHERE username = ?`, username); err != nil {
		return fmt.Errorf("count admin: %w", err)
	}
	if count > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}
	if err := s.with(ctx).Exec(`
		INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)
	`, username, string(hash), time.Now()).Error; err != nil {
		return fmt.Errorf("insert admin: %w", err)
	}
	return nil
}

// Admin is a backend operator.
type Admin struct {
	ID           int64  `gorm:"column:id"`
	Username     string `gorm:"column:username"`
	PasswordHash string `gorm:"column:password_hash"`
}

// AdminByUsername loads an operator.
func (s *Store) AdminByUsername(ctx context.Context, username string) (Admin, error) {
	var admin Admin
	err := scanOne(s.with(ctx), &admin, `SELECT id, username, password_hash FROM admins WHERE username = ?`, username)
	if errors.Is(err, ErrNotFound) {
		return Admin{}, ErrNotFound
	}
	if err != nil {
		return Admin{}, fmt.Errorf("select admin: %w", err)
	}
	return admin, nil
}

// CheckPassword reports whether the password matches.
func CheckPassword(hash, password string) error {
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return fmt.Errorf("password mismatch")
	}
	return nil
}
