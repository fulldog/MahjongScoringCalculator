package score

import "fmt"

const (
	scoreZimo             = 1
	scoreDianpao          = 1
	scoreMenDou           = 2
	scorePapoDou          = 1
	scoreDianDou          = 1
	scoreChongfeng        = 2
	scoreChicken          = 1
	scoreGoldenMultiplier = 2
	scoreChaJiao          = 1

	limitMenDou       = 4
	limitPapoDou      = 4
	limitChickenCount = 18
	limitDianDou      = 8
)

var outcomes = map[string]string{
	"zimo":       "自摸",
	"jiepao":     "接炮",
	"fangpao":    "放炮",
	"huang_jiao": "黄庄有叫",
	"huang_wu":   "黄庄无叫",
	"zouju":      "未胡走局",
}

// Player is someone seated for this hand.
type Player struct {
	ID   string
	Name string
}

// DianDou is one pointed-kong claim.
type DianDou struct {
	OpponentID string `json:"opponentId"`
	Direction  string `json:"direction"`
}

// Incoming is a raw report from a client. HasJiao is nil when omitted.
type Incoming struct {
	Outcome      string    `json:"outcome"`
	OpponentID   string    `json:"opponentId"`
	HasJiao      *bool     `json:"hasJiao"`
	MenDou       int       `json:"menDou"`
	PapoDou      int       `json:"papoDou"`
	DianDou      []DianDou `json:"dianDou"`
	Chongfeng    bool      `json:"chongfeng"`
	ChickenCount int       `json:"chickenCount"`
	Golden       bool      `json:"golden"`
}

// Report is a normalized declaration.
type Report struct {
	Outcome      string
	OpponentID   string
	HasJiao      bool
	MenDou       int
	PapoDou      int
	DianDou      []DianDou
	Chongfeng    bool
	ChickenCount int
	Golden       bool
}

// Result is a balanced settlement.
type Result struct {
	Deltas map[string]int
	Kind   string
	Lines  []string
}

// Normalize clamps counts and fills the implied 叫口.
func Normalize(in Incoming) Report {
	outcome := in.Outcome
	if _, ok := outcomes[outcome]; !ok {
		outcome = "zouju"
	}
	hasJiao := false
	if implied, ok := impliedJiao(outcome); ok {
		hasJiao = implied
	} else if in.HasJiao != nil {
		hasJiao = *in.HasJiao
	} else {
		hasJiao = outcome != "fangpao"
	}
	dian := make([]DianDou, 0, len(in.DianDou))
	for _, item := range in.DianDou {
		if item.Direction != "gang" && item.Direction != "bei" {
			continue
		}
		dian = append(dian, DianDou{OpponentID: item.OpponentID, Direction: item.Direction})
		if len(dian) == limitDianDou {
			break
		}
	}
	return Report{
		Outcome:      outcome,
		OpponentID:   in.OpponentID,
		HasJiao:      hasJiao,
		MenDou:       clampCount(in.MenDou, limitMenDou),
		PapoDou:      clampCount(in.PapoDou, limitPapoDou),
		DianDou:      dian,
		Chongfeng:    in.Chongfeng,
		ChickenCount: clampCount(in.ChickenCount, limitChickenCount),
		Golden:       in.Golden,
	}
}

func impliedJiao(outcome string) (bool, bool) {
	switch outcome {
	case "zimo", "jiepao", "huang_jiao":
		return true, true
	case "huang_wu":
		return false, true
	default:
		return false, false
	}
}

func clampCount(value, max int) int {
	if value <= 0 {
		return 0
	}
	if value > max {
		return max
	}
	return value
}

func chickenValue(report Report) int {
	value := report.ChickenCount * scoreChicken
	if report.Chongfeng {
		value += scoreChongfeng
	}
	if report.Golden && value > 0 {
		value *= scoreGoldenMultiplier
	}
	return value
}

func validate(player Player, report Report, seated map[string]Player) string {
	if player.ID == "" {
		return "玩家无效"
	}
	if report.Outcome == "jiepao" || report.Outcome == "fangpao" {
		verb := "放炮"
		if report.Outcome == "fangpao" {
			verb = "接炮"
		}
		if report.OpponentID == "" {
			return player.Name + "请选择" + verb + "的人"
		}
		if report.OpponentID == player.ID {
			return player.Name + "不能选择自己"
		}
		if _, ok := seated[report.OpponentID]; !ok {
			return player.Name + "选择的对手未入座"
		}
	}
	for _, item := range report.DianDou {
		if item.OpponentID == "" || item.OpponentID == player.ID {
			return player.Name + "的点豆对象无效"
		}
		if _, ok := seated[item.OpponentID]; !ok {
			return player.Name + "的点豆对象无效"
		}
	}
	return ""
}

// Settle applies 捉鸡 transfers. The net of every delta is zero.
func Settle(players []Player, raw map[string]Incoming) (Result, error) {
	if len(players) < 2 {
		return Result{}, fmt.Errorf("至少两人才能结算")
	}
	seated := make(map[string]Player, len(players))
	for _, player := range players {
		seated[player.ID] = player
	}
	reports := make(map[string]Report, len(players))
	for _, player := range players {
		incoming, ok := raw[player.ID]
		if !ok {
			return Result{}, fmt.Errorf("%s尚未填写", player.Name)
		}
		report := Normalize(incoming)
		if message := validate(player, report, seated); message != "" {
			return Result{}, fmt.Errorf("%s", message)
		}
		reports[player.ID] = report
	}

	kind, err := detectKind(players, reports)
	if err != nil {
		return Result{}, err
	}
	edges, dedupedWin, err := collectWinEdges(players, reports)
	if err != nil {
		return Result{}, err
	}

	ids := make([]string, len(players))
	for i, player := range players {
		ids[i] = player.ID
	}
	matrix := newMatrix(ids)
	jiao := make(map[string]bool, len(players))
	for _, player := range players {
		jiao[player.ID] = reports[player.ID].HasJiao
	}
	douAllowed := func(id string) bool {
		return !(kind == "huang" && !jiao[id])
	}

	for _, player := range players {
		if reports[player.ID].Outcome != "zimo" {
			continue
		}
		for _, other := range players {
			addTransfer(matrix, other.ID, player.ID, scoreZimo)
		}
	}
	for _, edge := range edges {
		addTransfer(matrix, edge.from, edge.to, scoreDianpao)
	}
	for _, player := range players {
		if !douAllowed(player.ID) {
			continue
		}
		report := reports[player.ID]
		for _, other := range players {
			addTransfer(matrix, other.ID, player.ID, report.MenDou*scoreMenDou)
			addTransfer(matrix, other.ID, player.ID, report.PapoDou*scorePapoDou)
		}
	}
	claims, dedupedDou := collectDianDou(players, reports)
	for konger, payers := range claims {
		if !douAllowed(konger) {
			continue
		}
		for payer, count := range payers {
			addTransfer(matrix, payer, konger, count*scoreDianDou)
		}
	}
	for left := 0; left < len(players); left++ {
		for right := left + 1; right < len(players); right++ {
			first := players[left]
			second := players[right]
			firstJiao := jiao[first.ID]
			secondJiao := jiao[second.ID]
			firstChicken := chickenValue(reports[first.ID])
			secondChicken := chickenValue(reports[second.ID])
			if !firstJiao && !secondJiao {
				continue
			}
			if firstJiao && !secondJiao {
				addTransfer(matrix, second.ID, first.ID, firstChicken)
				continue
			}
			if !firstJiao && secondJiao {
				addTransfer(matrix, first.ID, second.ID, secondChicken)
				continue
			}
			diff := firstChicken - secondChicken
			if diff > 0 {
				addTransfer(matrix, second.ID, first.ID, diff)
			} else if diff < 0 {
				addTransfer(matrix, first.ID, second.ID, -diff)
			}
		}
	}
	if kind == "huang" {
		for _, payer := range players {
			if jiao[payer.ID] {
				continue
			}
			for _, receiver := range players {
				if jiao[receiver.ID] {
					addTransfer(matrix, payer.ID, receiver.ID, scoreChaJiao)
				}
			}
		}
	}

	deltas := netDeltas(matrix, ids)
	sum := 0
	for _, id := range ids {
		sum += deltas[id]
	}
	if sum != 0 {
		return Result{}, fmt.Errorf("结算不平衡，请重试")
	}
	return Result{
		Deltas: deltas,
		Kind:   kind,
		Lines:  buildLines(players, reports, deltas, kind, douAllowed, dedupedWin || dedupedDou),
	}, nil
}

func detectKind(players []Player, reports map[string]Report) (string, error) {
	zimoCount := 0
	hasWin := false
	hasHuang := false
	hasOther := false
	for _, player := range players {
		outcome := reports[player.ID].Outcome
		switch outcome {
		case "zimo":
			zimoCount++
			hasWin = true
		case "jiepao", "fangpao":
			hasWin = true
		case "huang_jiao", "huang_wu":
			hasHuang = true
		default:
			hasOther = true
		}
	}
	if zimoCount > 1 {
		return "", fmt.Errorf("一局只能有一家自摸")
	}
	if zimoCount == 1 {
		for _, player := range players {
			outcome := reports[player.ID].Outcome
			if outcome == "jiepao" || outcome == "fangpao" {
				return "", fmt.Errorf("自摸和点炮不能在同一局")
			}
		}
	}
	if hasWin && hasHuang {
		return "", fmt.Errorf("胡牌和黄庄不能在同一局")
	}
	if hasHuang && hasOther {
		return "", fmt.Errorf("黄庄时每人都要选择黄庄有叫或黄庄无叫")
	}
	if hasHuang {
		return "huang", nil
	}
	if hasWin {
		return "win", nil
	}
	return "pass", nil
}

type edge struct {
	from string
	to   string
}

func collectWinEdges(players []Player, reports map[string]Report) ([]edge, bool, error) {
	var raw []edge
	for _, player := range players {
		report := reports[player.ID]
		if report.Outcome == "jiepao" {
			raw = append(raw, edge{from: report.OpponentID, to: player.ID})
		}
		if report.Outcome == "fangpao" {
			raw = append(raw, edge{from: player.ID, to: report.OpponentID})
		}
	}
	seen := map[string]struct{}{}
	edges := make([]edge, 0, len(raw))
	for _, item := range raw {
		key := item.from + ">" + item.to
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		edges = append(edges, item)
	}
	for _, item := range edges {
		if _, ok := seen[item.to+">"+item.from]; ok {
			return nil, false, fmt.Errorf("点炮方向冲突，请核对谁放炮、谁接炮")
		}
	}
	return edges, len(raw) > len(edges), nil
}

func collectDianDou(players []Player, reports map[string]Report) (map[string]map[string]int, bool) {
	combined := map[string]map[string]int{}
	deduped := false
	for _, player := range players {
		local := map[string]map[string]int{}
		for _, item := range reports[player.ID].DianDou {
			konger := player.ID
			payer := item.OpponentID
			if item.Direction == "bei" {
				konger = item.OpponentID
				payer = player.ID
			}
			if local[konger] == nil {
				local[konger] = map[string]int{}
			}
			local[konger][payer]++
		}
		for konger, payers := range local {
			if combined[konger] == nil {
				combined[konger] = map[string]int{}
			}
			for payer, count := range payers {
				previous := combined[konger][payer]
				if previous > 0 && count > 0 {
					deduped = true
				}
				if count > previous {
					combined[konger][payer] = count
				}
			}
		}
	}
	return combined, deduped
}

func newMatrix(ids []string) map[string]map[string]int {
	matrix := make(map[string]map[string]int, len(ids))
	for _, from := range ids {
		matrix[from] = make(map[string]int, len(ids))
	}
	return matrix
}

func addTransfer(matrix map[string]map[string]int, from, to string, points int) {
	if from == "" || to == "" || from == to || points <= 0 {
		return
	}
	matrix[from][to] += points
}

func netDeltas(matrix map[string]map[string]int, ids []string) map[string]int {
	deltas := make(map[string]int, len(ids))
	for _, id := range ids {
		income := 0
		payout := 0
		for _, other := range ids {
			income += matrix[other][id]
			payout += matrix[id][other]
		}
		deltas[id] = income - payout
	}
	return deltas
}

func buildLines(players []Player, reports map[string]Report, deltas map[string]int, kind string, douAllowed func(string) bool, deduped bool) []string {
	names := map[string]string{}
	for _, player := range players {
		names[player.ID] = player.Name
	}
	nameOf := func(id string) string {
		if name := names[id]; name != "" {
			return name
		}
		return "未知"
	}
	lines := make([]string, 0, len(players)+2)
	for _, player := range players {
		report := reports[player.ID]
		bits := make([]string, 0, 4)
		if report.Outcome != "zouju" {
			switch report.Outcome {
			case "jiepao":
				bits = append(bits, "接炮（"+nameOf(report.OpponentID)+"放炮）")
			case "fangpao":
				bits = append(bits, "放炮（"+nameOf(report.OpponentID)+"胡）")
			default:
				bits = append(bits, outcomes[report.Outcome])
			}
		}
		voidDou := !douAllowed(player.ID)
		var douBits []string
		if report.MenDou > 0 {
			douBits = append(douBits, fmt.Sprintf("闷豆×%d", report.MenDou))
		}
		if report.PapoDou > 0 {
			douBits = append(douBits, fmt.Sprintf("爬坡豆×%d", report.PapoDou))
		}
		for _, item := range report.DianDou {
			name := nameOf(item.OpponentID)
			if item.Direction == "gang" {
				douBits = append(douBits, "点豆杠了"+name)
			} else {
				douBits = append(douBits, "被"+name+"点豆")
			}
		}
		if len(douBits) > 0 {
			text := join(douBits, "、")
			if voidDou {
				text += "（不计）"
			}
			bits = append(bits, text)
		}
		var chickenBits []string
		if report.Chongfeng {
			chickenBits = append(chickenBits, "冲锋鸡")
		}
		if report.ChickenCount > 0 {
			chickenBits = append(chickenBits, fmt.Sprintf("鸡%d", report.ChickenCount))
		}
		if len(chickenBits) > 0 {
			text := join(chickenBits, "、")
			if report.Golden {
				text += "（金鸡）"
			}
			if report.HasJiao {
				bits = append(bits, text)
			} else {
				bits = append(bits, text+"（无叫不计）")
			}
		}
		if len(bits) > 0 {
			lines = append(lines, player.Name+"："+join(bits, "，"))
		}
	}
	if kind == "huang" {
		hasCaller := false
		hasMiss := false
		for _, player := range players {
			if reports[player.ID].HasJiao {
				hasCaller = true
			} else {
				hasMiss = true
			}
		}
		if hasCaller && hasMiss {
			lines = append(lines, fmt.Sprintf("查叫：无叫向有叫各赔%d", scoreChaJiao))
		}
	}
	if deduped {
		lines = append(lines, "双方重复申报的点炮或点豆已去重")
	}
	if len(lines) == 0 {
		lines = append(lines, "本局无分数变化")
	}
	parts := make([]string, len(players))
	for i, player := range players {
		delta := deltas[player.ID]
		if delta > 0 {
			parts[i] = fmt.Sprintf("%s+%d", player.Name, delta)
			continue
		}
		parts[i] = fmt.Sprintf("%s%d", player.Name, delta)
	}
	lines = append(lines, "结算："+join(parts, "  "))
	return lines
}

func join(parts []string, sep string) string {
	out := ""
	for i, part := range parts {
		if i > 0 {
			out += sep
		}
		out += part
	}
	return out
}
