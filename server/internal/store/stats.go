package store

import (
	"context"
	"fmt"
	"time"
)

// Stats is the signed-in player's recent record.
type Stats struct {
	MatchCount int            `json:"matchCount"`
	Wins       int            `json:"wins"`
	Losses     int            `json:"losses"`
	Draws      int            `json:"draws"`
	WinRate    float64        `json:"winRate"`
	Weeks      []WeekStat     `json:"weeks"`
	Opponents  []OpponentStat `json:"opponents"`
	Matches    []MatchStat    `json:"matches"`
}

// WeekStat is a match count for one week.
type WeekStat struct {
	Label string `gorm:"column:label" json:"label"`
	Count int    `gorm:"column:count" json:"count"`
}

// OpponentStat counts shared tables.
type OpponentStat struct {
	UserID   int64  `gorm:"column:user_id" json:"userId"`
	Nickname string `gorm:"column:nickname" json:"nickname"`
	Count    int    `gorm:"column:count" json:"count"`
}

// MatchStat is one finished session for the player.
type MatchStat struct {
	ID      int64     `gorm:"column:id" json:"id"`
	Code    string    `gorm:"column:code" json:"code"`
	EndedAt time.Time `gorm:"column:ended_at" json:"endedAt"`
	Score   int       `gorm:"column:score" json:"score"`
	Result  string    `gorm:"column:result" json:"result"`
}

// PlayerStats aggregates ended matches since the given time.
func (s *Store) PlayerStats(ctx context.Context, userID int64, since time.Time) (Stats, error) {
	stats := Stats{Weeks: []WeekStat{}, Opponents: []OpponentStat{}, Matches: []MatchStat{}}
	if err := scanMany(s.with(ctx), &stats.Matches, `
		SELECT m.id, m.code, m.ended_at, ms.score,
			CASE WHEN ms.score > 0 THEN 'win' WHEN ms.score < 0 THEN 'loss' ELSE 'draw' END AS result
		FROM matches m
		JOIN match_seats ms ON ms.match_id = m.id AND ms.user_id = ?
		WHERE m.status = 'ended' AND m.ended_at >= ?
		ORDER BY m.ended_at DESC
	`, userID, since); err != nil {
		return Stats{}, fmt.Errorf("select player matches: %w", err)
	}
	for _, match := range stats.Matches {
		stats.MatchCount++
		switch match.Result {
		case "win":
			stats.Wins++
		case "loss":
			stats.Losses++
		default:
			stats.Draws++
		}
	}
	if stats.MatchCount > 0 {
		stats.WinRate = float64(stats.Wins) * 100 / float64(stats.MatchCount)
	}
	if err := scanMany(s.with(ctx), &stats.Weeks, `
		SELECT DATE_FORMAT(DATE_SUB(m.ended_at, INTERVAL WEEKDAY(m.ended_at) DAY), '%m/%d') AS label,
			COUNT(*) AS count
		FROM matches m
		JOIN match_seats ms ON ms.match_id = m.id AND ms.user_id = ?
		WHERE m.status = 'ended' AND m.ended_at >= ?
		GROUP BY label
		ORDER BY MIN(m.ended_at)
	`, userID, since); err != nil {
		return Stats{}, fmt.Errorf("select week stats: %w", err)
	}
	if stats.Weeks == nil {
		stats.Weeks = []WeekStat{}
	}
	if err := scanMany(s.with(ctx), &stats.Opponents, `
		SELECT u.id AS user_id, u.nickname, COUNT(*) AS count
		FROM match_seats me
		JOIN matches m ON m.id = me.match_id
		JOIN match_seats other ON other.match_id = me.match_id AND other.user_id <> me.user_id
		JOIN users u ON u.id = other.user_id
		WHERE me.user_id = ? AND m.status = 'ended' AND m.ended_at >= ?
		GROUP BY u.id, u.nickname
		ORDER BY count DESC, u.id
		LIMIT 8
	`, userID, since); err != nil {
		return Stats{}, fmt.Errorf("select opponents: %w", err)
	}
	if stats.Opponents == nil {
		stats.Opponents = []OpponentStat{}
	}
	if stats.Matches == nil {
		stats.Matches = []MatchStat{}
	}
	return stats, nil
}

// MiniRecord is a submitted minigame result.
type MiniRecord struct {
	Game     string
	Result   string
	Score    int
	LevelNo  int
	Stars    int
	UserID   *int64
	GuestKey string
}

// InsertMiniRecord stores a finished minigame.
func (s *Store) InsertMiniRecord(ctx context.Context, record MiniRecord) error {
	if err := s.with(ctx).Exec(`
		INSERT INTO minigame_records (user_id, guest_key, game, result, score, level_no, stars, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, record.UserID, record.GuestKey, record.Game, record.Result, record.Score, record.LevelNo, record.Stars, time.Now()).Error; err != nil {
		return fmt.Errorf("insert minigame: %w", err)
	}
	return nil
}

// BindGuestRecords attaches anonymous plays to a user.
func (s *Store) BindGuestRecords(ctx context.Context, userID int64, guestKey string) error {
	if guestKey == "" {
		return nil
	}
	if err := s.with(ctx).Exec(`
		UPDATE minigame_records SET user_id = ?, guest_key = '' WHERE guest_key = ? AND user_id IS NULL
	`, userID, guestKey).Error; err != nil {
		return fmt.Errorf("bind guest records: %w", err)
	}
	return nil
}
