package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// SeatRow is a persisted seat.
type SeatRow struct {
	UserID    int64  `gorm:"column:user_id" json:"userId"`
	Seat      string `gorm:"column:seat" json:"seat"`
	Score     int    `gorm:"column:score" json:"score"`
	Nickname  string `gorm:"column:nickname" json:"nickname"`
	AvatarURL string `gorm:"column:avatar_url" json:"avatarUrl"`
}

// RoundRow is one hand inside a match.
type RoundRow struct {
	ID        int64      `gorm:"column:id" json:"id"`
	MatchID   int64      `gorm:"column:match_id" json:"matchId"`
	RoundNo   int        `gorm:"column:round_no" json:"roundNo"`
	Status    string     `gorm:"column:status" json:"status"`
	Kind      string     `gorm:"column:kind" json:"kind"`
	LinesJSON rawJSON    `gorm:"column:lines_json" json:"-"`
	SettledAt *time.Time `gorm:"column:settled_at" json:"settledAt"`
}

// Lines decodes the stored summary.
func (r RoundRow) Lines() []string {
	if len(r.LinesJSON) == 0 {
		return nil
	}
	var lines []string
	if err := json.Unmarshal([]byte(r.LinesJSON), &lines); err != nil {
		return nil
	}
	return lines
}

// ReportRow is one player's declaration.
type ReportRow struct {
	RoundID  int64   `gorm:"column:round_id" json:"roundId"`
	UserID   int64   `gorm:"column:user_id" json:"userId"`
	Nickname string  `gorm:"column:nickname" json:"nickname"`
	Payload  rawJSON `gorm:"column:payload" json:"-"`
}

// DeltaRow is one player's net score for a hand.
type DeltaRow struct {
	RoundID  int64  `gorm:"column:round_id" json:"roundId"`
	UserID   int64  `gorm:"column:user_id" json:"userId"`
	Nickname string `gorm:"column:nickname" json:"nickname"`
	Delta    int    `gorm:"column:delta" json:"delta"`
}

// DanmakuRow is a room comment.
type DanmakuRow struct {
	ID        int64     `gorm:"column:id" json:"id"`
	MatchID   int64     `gorm:"column:match_id" json:"matchId"`
	UserID    *int64    `gorm:"column:user_id" json:"userId"`
	GuestKey  string    `gorm:"column:guest_key" json:"guestKey"`
	Nickname  string    `gorm:"column:nickname" json:"nickname"`
	Content   string    `gorm:"column:content" json:"content"`
	CreatedAt time.Time `gorm:"column:created_at" json:"createdAt"`
}

// MatchRow is a full mahjong session.
type MatchRow struct {
	ID         int64      `gorm:"column:id" json:"id"`
	Code       string     `gorm:"column:code" json:"code"`
	HostUserID int64      `gorm:"column:host_user_id" json:"hostUserId"`
	Status     string     `gorm:"column:status" json:"status"`
	StartedAt  *time.Time `gorm:"column:started_at" json:"startedAt"`
	EndedAt    *time.Time `gorm:"column:ended_at" json:"endedAt"`
	CreatedAt  time.Time  `gorm:"column:created_at" json:"createdAt"`
	HostName   string     `gorm:"column:host_name" json:"hostName"`
}

// LoadedMatch is the in-memory restoration of a room.
type LoadedMatch struct {
	Match   MatchRow
	Seats   []SeatRow
	Round   *RoundRow
	Reports map[int64][]byte
	History []HistoryRound
}

// HistoryRound is a settled hand summary.
type HistoryRound struct {
	RoundNo int
	Lines   []string
	Deltas  map[int64]int
}

// CreateMatch inserts a waiting room.
func (s *Store) CreateMatch(ctx context.Context, hostID int64, code string) (int64, error) {
	id, err := insertID(s.with(ctx), `
		INSERT INTO matches (code, host_user_id, status, created_at) VALUES (?, ?, 'waiting', ?)
	`, code, hostID, time.Now())
	if err != nil {
		return 0, fmt.Errorf("insert match: %w", err)
	}
	return id, nil
}

// ReplaceWaitingSeats rewrites seats before the match starts.
func (s *Store) ReplaceWaitingSeats(ctx context.Context, matchID int64, seats []SeatRow) error {
	err := s.with(ctx).Transaction(func(tx *gorm.DB) error {
		var status string
		if err := scanOne(tx, &status, `SELECT status FROM matches WHERE id = ? FOR UPDATE`, matchID); err != nil {
			return fmt.Errorf("lock match: %w", err)
		}
		if status != "waiting" {
			return fmt.Errorf("match is not waiting")
		}
		if err := tx.Exec(`DELETE FROM match_seats WHERE match_id = ?`, matchID).Error; err != nil {
			return fmt.Errorf("clear seats: %w", err)
		}
		for _, seat := range seats {
			if err := tx.Exec(`
				INSERT INTO match_seats (match_id, user_id, seat, score) VALUES (?, ?, ?, 0)
			`, matchID, seat.UserID, seat.Seat).Error; err != nil {
				return fmt.Errorf("insert seat: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return nil
}

// MarkPlaying starts the match clock.
func (s *Store) MarkPlaying(ctx context.Context, matchID int64) error {
	if err := s.with(ctx).Exec(`
		UPDATE matches SET status = 'playing', started_at = IFNULL(started_at, ?) WHERE id = ? AND status = 'waiting'
	`, time.Now(), matchID).Error; err != nil {
		return fmt.Errorf("mark playing: %w", err)
	}
	return nil
}

// OpenRound inserts a reporting hand.
func (s *Store) OpenRound(ctx context.Context, matchID int64, roundNo int) (int64, error) {
	id, err := insertID(s.with(ctx), `
		INSERT INTO rounds (match_id, round_no, status, created_at) VALUES (?, ?, 'reporting', ?)
	`, matchID, roundNo, time.Now())
	if err != nil {
		return 0, fmt.Errorf("open round: %w", err)
	}
	return id, nil
}

// UpsertReport stores one declaration.
func (s *Store) UpsertReport(ctx context.Context, roundID, userID int64, payload []byte) error {
	if err := s.with(ctx).Exec(`
		INSERT INTO round_reports (round_id, user_id, payload, created_at)
		VALUES (?, ?, ?, ?) AS new
		ON DUPLICATE KEY UPDATE payload = new.payload
	`, roundID, userID, payload, time.Now()).Error; err != nil {
		return fmt.Errorf("upsert report: %w", err)
	}
	return nil
}

// SettleRound marks a hand settled and adds seat scores.
func (s *Store) SettleRound(ctx context.Context, matchID, roundID int64, kind string, lines []string, deltas map[int64]int) error {
	encoded, err := json.Marshal(lines)
	if err != nil {
		return fmt.Errorf("encode lines: %w", err)
	}
	err = s.with(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(`
			UPDATE rounds SET status = 'settled', kind = ?, lines_json = ?, settled_at = ?
			WHERE id = ? AND status = 'reporting'
		`, kind, encoded, time.Now(), roundID)
		if res.Error != nil {
			return fmt.Errorf("update round: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			return fmt.Errorf("round already settled")
		}
		for userID, delta := range deltas {
			if err := tx.Exec(`
				INSERT INTO round_deltas (round_id, user_id, delta) VALUES (?, ?, ?)
			`, roundID, userID, delta).Error; err != nil {
				return fmt.Errorf("insert delta: %w", err)
			}
			if err := tx.Exec(`
				UPDATE match_seats SET score = score + ? WHERE match_id = ? AND user_id = ?
			`, delta, matchID, userID).Error; err != nil {
				return fmt.Errorf("add score: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return nil
}

// EndMatch closes a session.
func (s *Store) EndMatch(ctx context.Context, matchID int64) error {
	if err := s.with(ctx).Exec(`
		UPDATE matches SET status = 'ended', ended_at = ? WHERE id = ? AND status <> 'ended'
	`, time.Now(), matchID).Error; err != nil {
		return fmt.Errorf("end match: %w", err)
	}
	return nil
}

// InsertDanmaku stores a comment.
func (s *Store) InsertDanmaku(ctx context.Context, row DanmakuRow) (int64, error) {
	id, err := insertID(s.with(ctx), `
		INSERT INTO danmaku (match_id, user_id, guest_key, nickname, content, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, row.MatchID, row.UserID, row.GuestKey, row.Nickname, row.Content, time.Now())
	if err != nil {
		return 0, fmt.Errorf("insert danmaku: %w", err)
	}
	return id, nil
}

// LoadByCode restores a room.
func (s *Store) LoadByCode(ctx context.Context, code string) (LoadedMatch, error) {
	var match MatchRow
	err := scanOne(s.with(ctx), &match, `
		SELECT m.id, m.code, m.host_user_id, m.status, m.started_at, m.ended_at, m.created_at,
			IFNULL(u.nickname, '') AS host_name
		FROM matches m
		LEFT JOIN users u ON u.id = m.host_user_id
		WHERE m.code = ?
	`, code)
	if errors.Is(err, ErrNotFound) {
		return LoadedMatch{}, ErrNotFound
	}
	if err != nil {
		return LoadedMatch{}, fmt.Errorf("select match: %w", err)
	}
	seats, err := s.seats(ctx, match.ID)
	if err != nil {
		return LoadedMatch{}, err
	}
	loaded := LoadedMatch{Match: match, Seats: seats, Reports: map[int64][]byte{}}
	var round RoundRow
	err = scanOne(s.with(ctx), &round, `
		SELECT id, match_id, round_no, status, kind, lines_json, settled_at
		FROM rounds WHERE match_id = ? ORDER BY round_no DESC LIMIT 1
	`, match.ID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return LoadedMatch{}, fmt.Errorf("select round: %w", err)
	}
	if err == nil {
		loaded.Round = &round
		if round.Status == "reporting" {
			rows, err := s.reports(ctx, round.ID)
			if err != nil {
				return LoadedMatch{}, err
			}
			for _, row := range rows {
				loaded.Reports[row.UserID] = append([]byte(nil), row.Payload...)
			}
		}
	}
	history, err := s.history(ctx, match.ID)
	if err != nil {
		return LoadedMatch{}, err
	}
	loaded.History = history
	return loaded, nil
}

func (s *Store) seats(ctx context.Context, matchID int64) ([]SeatRow, error) {
	var seats []SeatRow
	if err := scanMany(s.with(ctx), &seats, `
		SELECT ms.user_id, ms.seat, ms.score, u.nickname, u.avatar_url
		FROM match_seats ms
		JOIN users u ON u.id = ms.user_id
		WHERE ms.match_id = ?
		ORDER BY ms.id
	`, matchID); err != nil {
		return nil, fmt.Errorf("select seats: %w", err)
	}
	if seats == nil {
		seats = []SeatRow{}
	}
	return seats, nil
}

func (s *Store) reports(ctx context.Context, roundID int64) ([]ReportRow, error) {
	var rows []ReportRow
	if err := scanMany(s.with(ctx), &rows, `
		SELECT rr.round_id, rr.user_id, u.nickname, rr.payload
		FROM round_reports rr
		JOIN users u ON u.id = rr.user_id
		WHERE rr.round_id = ?
	`, roundID); err != nil {
		return nil, fmt.Errorf("select reports: %w", err)
	}
	return rows, nil
}

func (s *Store) history(ctx context.Context, matchID int64) ([]HistoryRound, error) {
	var rounds []RoundRow
	if err := scanMany(s.with(ctx), &rounds, `
		SELECT id, match_id, round_no, status, kind, lines_json, settled_at
		FROM rounds WHERE match_id = ? AND status = 'settled' ORDER BY round_no
	`, matchID); err != nil {
		return nil, fmt.Errorf("select history: %w", err)
	}
	if len(rounds) == 0 {
		return nil, nil
	}
	var deltas []DeltaRow
	if err := scanMany(s.with(ctx), &deltas, `
		SELECT rd.round_id, rd.user_id, u.nickname, rd.delta
		FROM round_deltas rd
		JOIN rounds r ON r.id = rd.round_id
		JOIN users u ON u.id = rd.user_id
		WHERE r.match_id = ? AND r.status = 'settled'
	`, matchID); err != nil {
		return nil, fmt.Errorf("select history deltas: %w", err)
	}
	byRound := map[int64]map[int64]int{}
	for _, delta := range deltas {
		if byRound[delta.RoundID] == nil {
			byRound[delta.RoundID] = map[int64]int{}
		}
		byRound[delta.RoundID][delta.UserID] = delta.Delta
	}
	out := make([]HistoryRound, 0, len(rounds))
	for _, round := range rounds {
		out = append(out, HistoryRound{RoundNo: round.RoundNo, Lines: round.Lines(), Deltas: byRound[round.ID]})
	}
	return out, nil
}
