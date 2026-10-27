package score

import "testing"

func players(names ...string) []Player {
	out := make([]Player, len(names))
	for i, name := range names {
		out[i] = Player{ID: name, Name: name}
	}
	return out
}

func boolPtr(value bool) *bool {
	return &value
}

func mustSettle(t *testing.T, list []Player, raw map[string]Incoming) Result {
	t.Helper()
	result, err := Settle(list, raw)
	if err != nil {
		t.Fatalf("settle: %v", err)
	}
	sum := 0
	for _, delta := range result.Deltas {
		sum += delta
	}
	if sum != 0 {
		t.Fatalf("deltas not balanced: %+v", result.Deltas)
	}
	return result
}

func TestZimoChargesEveryOtherPlayer(t *testing.T) {
	list := players("甲", "乙", "丙")
	raw := map[string]Incoming{
		"甲": {Outcome: "zimo"},
		"乙": {Outcome: "zouju", HasJiao: boolPtr(true)},
		"丙": {Outcome: "zouju", HasJiao: boolPtr(true)},
	}
	result := mustSettle(t, list, raw)
	if result.Kind != "win" || result.Deltas["甲"] != 2 || result.Deltas["乙"] != -1 || result.Deltas["丙"] != -1 {
		t.Fatalf("deltas = %+v kind = %s", result.Deltas, result.Kind)
	}
}

func TestDianpaoDedupesBothDeclarations(t *testing.T) {
	list := players("甲", "乙", "丙")
	raw := map[string]Incoming{
		"甲": {Outcome: "jiepao", OpponentID: "乙"},
		"乙": {Outcome: "fangpao", OpponentID: "甲"},
		"丙": {Outcome: "zouju", HasJiao: boolPtr(true)},
	}
	result := mustSettle(t, list, raw)
	if result.Deltas["甲"] != 1 || result.Deltas["乙"] != -1 || result.Deltas["丙"] != 0 {
		t.Fatalf("deltas = %+v", result.Deltas)
	}
}

func TestMenDouChargesEachOtherPlayer(t *testing.T) {
	list := players("甲", "乙", "丙")
	raw := map[string]Incoming{
		"甲": {Outcome: "zouju", HasJiao: boolPtr(true), MenDou: 1},
		"乙": {Outcome: "zouju", HasJiao: boolPtr(true)},
		"丙": {Outcome: "zouju", HasJiao: boolPtr(true)},
	}
	result := mustSettle(t, list, raw)
	if result.Deltas["甲"] != 4 || result.Deltas["乙"] != -2 || result.Deltas["丙"] != -2 {
		t.Fatalf("deltas = %+v", result.Deltas)
	}
}

func TestHuangVoidsMissDouAndPaysChaJiao(t *testing.T) {
	list := players("甲", "乙")
	raw := map[string]Incoming{
		"甲": {Outcome: "huang_jiao", MenDou: 1},
		"乙": {Outcome: "huang_wu", MenDou: 1},
	}
	result := mustSettle(t, list, raw)
	if result.Kind != "huang" || result.Deltas["甲"] != 3 || result.Deltas["乙"] != -3 {
		t.Fatalf("deltas = %+v kind = %s", result.Deltas, result.Kind)
	}
}

func TestChickenDifferenceWhenBothHaveJiao(t *testing.T) {
	list := players("甲", "乙")
	raw := map[string]Incoming{
		"甲": {Outcome: "zouju", HasJiao: boolPtr(true), ChickenCount: 2},
		"乙": {Outcome: "zouju", HasJiao: boolPtr(true)},
	}
	result := mustSettle(t, list, raw)
	if result.Deltas["甲"] != 2 || result.Deltas["乙"] != -2 {
		t.Fatalf("deltas = %+v", result.Deltas)
	}
}

func TestCallerChickenIsPaidInFullByMiss(t *testing.T) {
	list := players("甲", "乙")
	raw := map[string]Incoming{
		"甲": {Outcome: "huang_jiao", Chongfeng: true, ChickenCount: 1},
		"乙": {Outcome: "huang_wu"},
	}
	result := mustSettle(t, list, raw)
	if result.Deltas["甲"] != 4 || result.Deltas["乙"] != -4 {
		t.Fatalf("deltas = %+v", result.Deltas)
	}
}

func TestNoJiaoChickenIsIgnored(t *testing.T) {
	list := players("甲", "乙")
	raw := map[string]Incoming{
		"甲": {Outcome: "huang_wu", ChickenCount: 5},
		"乙": {Outcome: "huang_wu", Chongfeng: true},
	}
	result := mustSettle(t, list, raw)
	if result.Deltas["甲"] != 0 || result.Deltas["乙"] != 0 {
		t.Fatalf("deltas = %+v", result.Deltas)
	}
}

func TestTwoZimoRejected(t *testing.T) {
	list := players("甲", "乙")
	raw := map[string]Incoming{
		"甲": {Outcome: "zimo"},
		"乙": {Outcome: "zimo"},
	}
	if _, err := Settle(list, raw); err == nil {
		t.Fatal("expected error")
	}
}

func TestReversePaoRejected(t *testing.T) {
	list := players("甲", "乙")
	raw := map[string]Incoming{
		"甲": {Outcome: "fangpao", OpponentID: "乙"},
		"乙": {Outcome: "fangpao", OpponentID: "甲"},
	}
	if _, err := Settle(list, raw); err == nil {
		t.Fatal("expected error")
	}
}
