package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	RoleUser  = "user"
	RoleGuest = "guest"
	RoleAdmin = "admin"
)

// Identity is the authenticated caller.
type Identity struct {
	Role      string
	UserID    int64
	GuestKey  string
	Nickname  string
	AvatarURL string
}

type claims struct {
	jwt.RegisteredClaims
	Role     string `json:"role"`
	UserID   int64  `json:"uid,omitempty"`
	GuestKey string `json:"gkey,omitempty"`
	Name     string `json:"name,omitempty"`
}

// Issuer signs and parses HMAC tokens.
type Issuer struct {
	secret []byte
}

// NewIssuer returns a signer for the given secret.
func NewIssuer(secret string) *Issuer {
	return &Issuer{secret: []byte(secret)}
}

// SignUser issues a 7-day user token.
func (i *Issuer) SignUser(userID int64, nickname string) (string, error) {
	return i.sign(claims{
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour))},
		Role:             RoleUser,
		UserID:           userID,
		Name:             nickname,
	})
}

// SignGuest issues a 7-day guest token.
func (i *Issuer) SignGuest(guestKey string) (string, error) {
	return i.sign(claims{
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour))},
		Role:             RoleGuest,
		GuestKey:         guestKey,
		Name:             "游客",
	})
}

// SignAdmin issues a 12-hour admin token.
func (i *Issuer) SignAdmin(adminID int64, username string) (string, error) {
	return i.sign(claims{
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(12 * time.Hour))},
		Role:             RoleAdmin,
		UserID:           adminID,
		Name:             username,
	})
}

func (i *Issuer) sign(c claims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, c)
	signed, err := token.SignedString(i.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

// Parse validates a token and returns its identity.
func (i *Issuer) Parse(raw string) (Identity, error) {
	parsed, err := jwt.ParseWithClaims(raw, &claims{}, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return i.secret, nil
	})
	if err != nil {
		return Identity{}, fmt.Errorf("parse token: %w", err)
	}
	c, ok := parsed.Claims.(*claims)
	if !ok || !parsed.Valid {
		return Identity{}, fmt.Errorf("invalid token")
	}
	switch c.Role {
	case RoleUser:
		if c.UserID <= 0 {
			return Identity{}, fmt.Errorf("invalid token")
		}
	case RoleGuest:
		if c.GuestKey == "" {
			return Identity{}, fmt.Errorf("invalid token")
		}
	case RoleAdmin:
		if c.UserID <= 0 {
			return Identity{}, fmt.Errorf("invalid token")
		}
	default:
		return Identity{}, fmt.Errorf("invalid token")
	}
	return Identity{Role: c.Role, UserID: c.UserID, GuestKey: c.GuestKey, Nickname: c.Name}, nil
}
