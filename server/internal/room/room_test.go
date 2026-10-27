package room

import (
	"context"
	"errors"
	"testing"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/auth"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/store"
)

type fakeRepo struct {
	nextID int64
	match  store.LoadedMatch
}

func (f *fakeRepo) CreateMatch(context.Context, int64, string) (int64, error) {
	f.nextID++
	return f.nextID, nil
}
func (f *fakeRepo) ReplaceWaitingSeats(context.Context, int64, []store.SeatRow) error { return nil }
func (f *fakeRepo) MarkPlaying(context.Context, int64) error                          { return nil }
func (f *fakeRepo) OpenRound(context.Context, int64, int) (int64, error) {
	f.nextID++
	return f.nextID, nil
}
func (f *fakeRepo) UpsertReport(context.Context, int64, int64, []byte) error { return nil }
func (f *fakeRepo) SettleRound(context.Context, int64, int64, string, []string, map[int64]int) error {
	return nil
}
func (f *fakeRepo) EndMatch(context.Context, int64) error { return nil }
func (f *fakeRepo) InsertDanmaku(context.Context, store.DanmakuRow) (int64, error) {
	f.nextID++
	return f.nextID, nil
}
func (f *fakeRepo) LoadByCode(context.Context, string) (store.LoadedMatch, error) {
	return store.LoadedMatch{}, store.ErrNotFound
}

func user(id int64, name string) *Client {
	return &Client{Identity: auth.Identity{Role: auth.RoleUser, UserID: id, Nickname: name}, Send: make(chan []byte, 8)}
}

func TestStartRequiresHostSeatAndTwoPlayers(t *testing.T) {
	hub := NewHub(&fakeRepo{})
	ctx := context.Background()
	code, err := hub.Create(ctx, auth.Identity{Role: auth.RoleUser, UserID: 1, Nickname: "甲"})
	if err != nil {
		t.Fatal(err)
	}
	room, err := hub.Join(ctx, code, user(1, "甲"))
	if err != nil {
		t.Fatal(err)
	}
	if err := hub.HandleResult(ctx, room, user(1, "甲"), []byte(`{"type":"start"}`)); err == nil {
		t.Fatal("expected start to fail")
	}
	if err := hub.sit(ctx, room, user(1, "甲"), "south"); err != nil {
		t.Fatal(err)
	}
	if err := hub.sit(ctx, room, user(2, "乙"), "east"); err != nil {
		t.Fatal(err)
	}
	guest := &Client{Identity: auth.Identity{Role: auth.RoleGuest, GuestKey: "g", Nickname: "游客"}, Send: make(chan []byte, 4)}
	if err := hub.sit(ctx, room, guest, "west"); !errors.As(err, new(*RuleError)) {
		t.Fatalf("guest sit err = %v", err)
	}
	if err := hub.start(ctx, room, user(2, "乙")); !errors.As(err, new(*RuleError)) {
		t.Fatalf("non-host start err = %v", err)
	}
	if err := hub.start(ctx, room, user(1, "甲")); err != nil {
		t.Fatal(err)
	}
	room.mu.Lock()
	defer room.mu.Unlock()
	if room.status != "playing" || room.roundNo != 1 {
		t.Fatalf("status=%s round=%d", room.status, room.roundNo)
	}
}

func (h *Hub) HandleResult(ctx context.Context, room *live, client *Client, raw []byte) error {
	return h.start(ctx, room, client)
}
