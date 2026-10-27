const SCORE = {
  zimo: 1,
  dianpao: 1,
  menDou: 2,
  papoDou: 1,
  dianDou: 1,
  chongfeng: 2,
  chicken: 1,
  goldenMultiplier: 2,
  chaJiao: 1
}

const LIMITS = {
  menDou: 4,
  papoDou: 4,
  chickenCount: 18,
  dianDou: 8
}

const SEATS = [
  { key: 'east', label: '东' },
  { key: 'south', label: '南' },
  { key: 'west', label: '西' },
  { key: 'north', label: '北' }
]

const OUTCOMES = [
  { key: 'zimo', label: '自摸' },
  { key: 'jiepao', label: '接炮' },
  { key: 'fangpao', label: '放炮' },
  { key: 'huang_jiao', label: '黄庄有叫' },
  { key: 'huang_wu', label: '黄庄无叫' },
  { key: 'zouju', label: '未胡走局' }
]

const WIN_OUTCOMES = ['zimo', 'jiepao', 'fangpao']
const HUANG_OUTCOMES = ['huang_jiao', 'huang_wu']

function clampCount(value, max) {
  const number = Math.floor(Number(value))

  if (!Number.isFinite(number) || number <= 0) {
    return 0
  }

  return Math.min(number, max)
}

function createSeats() {
  return SEATS.map((seat) => ({
    key: seat.key,
    label: seat.label,
    name: ''
  }))
}

function createEmptyReport() {
  return {
    outcome: 'zouju',
    opponentId: '',
    hasJiao: true,
    menDou: 0,
    papoDou: 0,
    dianDou: [],
    chongfeng: false,
    chickenCount: 0,
    golden: false
  }
}

function impliedJiao(outcome) {
  if (outcome === 'zimo' || outcome === 'jiepao' || outcome === 'huang_jiao') {
    return true
  }

  if (outcome === 'huang_wu') {
    return false
  }

  return null
}

function jiaoMode(outcome) {
  const implied = impliedJiao(outcome)

  if (implied === true) {
    return 'yes'
  }

  if (implied === false) {
    return 'no'
  }

  return 'toggle'
}

function normalizeReport(report) {
  const source = report || {}
  const outcome = OUTCOMES.some((item) => item.key === source.outcome) ? source.outcome : 'zouju'
  const implied = impliedJiao(outcome)
  let hasJiao = !!source.hasJiao

  if (implied !== null) {
    hasJiao = implied
  } else if (typeof source.hasJiao !== 'boolean') {
    hasJiao = outcome !== 'fangpao'
  }

  const dianDou = Array.isArray(source.dianDou) ? source.dianDou : []

  return {
    outcome,
    opponentId: source.opponentId || '',
    hasJiao,
    menDou: clampCount(source.menDou, LIMITS.menDou),
    papoDou: clampCount(source.papoDou, LIMITS.papoDou),
    dianDou: dianDou
      .filter((item) => item && (item.direction === 'gang' || item.direction === 'bei'))
      .slice(0, LIMITS.dianDou)
      .map((item) => ({
        opponentId: item.opponentId || '',
        direction: item.direction
      })),
    chongfeng: !!source.chongfeng,
    chickenCount: clampCount(source.chickenCount, LIMITS.chickenCount),
    golden: !!source.golden
  }
}

function resolveHasJiao(report) {
  return normalizeReport(report).hasJiao
}

function chickenValue(report) {
  const normalized = normalizeReport(report)
  let value = (normalized.chongfeng ? SCORE.chongfeng : 0) + normalized.chickenCount * SCORE.chicken

  if (normalized.golden && value > 0) {
    value *= SCORE.goldenMultiplier
  }

  return value
}

function validateReport(player, report, players) {
  if (!player) {
    return '玩家无效'
  }

  const normalized = normalizeReport(report)

  if (!report) {
    return `${player.name}尚未填写`
  }

  if (normalized.outcome === 'jiepao' || normalized.outcome === 'fangpao') {
    const verb = normalized.outcome === 'jiepao' ? '放炮' : '接炮'

    if (!normalized.opponentId) {
      return `${player.name}请选择${verb}的人`
    }

    if (normalized.opponentId === player.id) {
      return `${player.name}不能选择自己`
    }

    if (!players.some((item) => item.id === normalized.opponentId)) {
      return `${player.name}选择的对手未入座`
    }
  }

  for (let index = 0; index < normalized.dianDou.length; index += 1) {
    const item = normalized.dianDou[index]

    if (!item.opponentId || item.opponentId === player.id || !players.some((seat) => seat.id === item.opponentId)) {
      return `${player.name}的点豆对象无效`
    }
  }

  return ''
}

function createMatrix(ids) {
  return ids.reduce((matrix, from) => {
    matrix[from] = {}
    ids.forEach((to) => {
      matrix[from][to] = 0
    })
    return matrix
  }, {})
}

function addTransfer(matrix, from, to, points) {
  if (!from || !to || from === to || points <= 0) {
    return
  }

  matrix[from][to] += points
}

function detectKind(players, reports) {
  const outcomes = players.map((player) => reports[player.id].outcome)
  const hasWin = outcomes.some((outcome) => WIN_OUTCOMES.indexOf(outcome) !== -1)
  const hasHuang = outcomes.some((outcome) => HUANG_OUTCOMES.indexOf(outcome) !== -1)
  const zimoCount = outcomes.filter((outcome) => outcome === 'zimo').length

  if (zimoCount > 1) {
    return { error: '一局只能有一家自摸' }
  }

  if (zimoCount === 1 && outcomes.some((outcome) => outcome === 'jiepao' || outcome === 'fangpao')) {
    return { error: '自摸和点炮不能在同一局' }
  }

  if (hasWin && hasHuang) {
    return { error: '胡牌和黄庄不能在同一局' }
  }

  if (hasHuang && outcomes.some((outcome) => HUANG_OUTCOMES.indexOf(outcome) === -1)) {
    return { error: '黄庄时每人都要选择黄庄有叫或黄庄无叫' }
  }

  if (hasHuang) {
    return { kind: 'huang' }
  }

  if (hasWin) {
    return { kind: 'win' }
  }

  return { kind: 'pass' }
}

function collectWinEdges(players, reports) {
  const raw = []

  players.forEach((player) => {
    const report = reports[player.id]

    if (report.outcome === 'jiepao') {
      raw.push({ from: report.opponentId, to: player.id })
    }

    if (report.outcome === 'fangpao') {
      raw.push({ from: player.id, to: report.opponentId })
    }
  })

  const seen = new Set()
  const edges = []

  raw.forEach((edge) => {
    const key = `${edge.from}>${edge.to}`

    if (seen.has(key)) {
      return
    }

    seen.add(key)
    edges.push(edge)
  })

  const conflict = edges.some((edge) => seen.has(`${edge.to}>${edge.from}`))

  if (conflict) {
    return { error: '点炮方向冲突，请核对谁放炮、谁接炮' }
  }

  return {
    edges,
    deduped: raw.length > edges.length
  }
}

function collectDianDou(players, reports) {
  const combined = {}
  let deduped = false

  players.forEach((player) => {
    const local = {}

    reports[player.id].dianDou.forEach((item) => {
      const konger = item.direction === 'gang' ? player.id : item.opponentId
      const payer = item.direction === 'gang' ? item.opponentId : player.id

      if (!local[konger]) {
        local[konger] = {}
      }

      local[konger][payer] = (local[konger][payer] || 0) + 1
    })

    Object.keys(local).forEach((konger) => {
      if (!combined[konger]) {
        combined[konger] = {}
      }

      Object.keys(local[konger]).forEach((payer) => {
        const previous = combined[konger][payer] || 0
        const next = local[konger][payer]

        if (previous > 0 && next > 0) {
          deduped = true
        }

        combined[konger][payer] = Math.max(previous, next)
      })
    })
  })

  return { claims: combined, deduped }
}

function netDeltas(matrix, ids) {
  const deltas = {}

  ids.forEach((id) => {
    let income = 0
    let payout = 0

    ids.forEach((other) => {
      income += matrix[other][id]
      payout += matrix[id][other]
    })

    deltas[id] = income - payout
  })

  return deltas
}

function formatDelta(name, delta) {
  if (delta > 0) {
    return `${name}+${delta}`
  }

  return `${name}${delta}`
}

function playerName(players, id) {
  const player = players.find((item) => item.id === id)
  return player ? player.name : '未知'
}

function buildLines(players, reports, deltas, kind, douAllowed, deduped) {
  const lines = []

  players.forEach((player) => {
    const report = reports[player.id]
    const bits = []
    const outcome = OUTCOMES.find((item) => item.key === report.outcome)

    if (report.outcome !== 'zouju' && outcome) {
      if (report.outcome === 'jiepao') {
        bits.push(`接炮（${playerName(players, report.opponentId)}放炮）`)
      } else if (report.outcome === 'fangpao') {
        bits.push(`放炮（${playerName(players, report.opponentId)}胡）`)
      } else {
        bits.push(outcome.label)
      }
    }

    const voidDou = !douAllowed(player.id)
    const douBits = []

    if (report.menDou) {
      douBits.push(`闷豆×${report.menDou}`)
    }

    if (report.papoDou) {
      douBits.push(`爬坡豆×${report.papoDou}`)
    }

    report.dianDou.forEach((item) => {
      const name = playerName(players, item.opponentId)
      douBits.push(item.direction === 'gang' ? `点豆杠了${name}` : `被${name}点豆`)
    })

    if (douBits.length) {
      bits.push(douBits.join('、') + (voidDou ? '（不计）' : ''))
    }

    const chickenBits = []

    if (report.chongfeng) {
      chickenBits.push('冲锋鸡')
    }

    if (report.chickenCount) {
      chickenBits.push(`鸡${report.chickenCount}`)
    }

    if (chickenBits.length) {
      const chickenText = chickenBits.join('、') + (report.golden ? '（金鸡）' : '')
      bits.push(resolveHasJiao(report) ? chickenText : `${chickenText}（无叫不计）`)
    }

    if (bits.length) {
      lines.push(`${player.name}：${bits.join('，')}`)
    }
  })

  if (kind === 'huang') {
    const hasCaller = players.some((player) => resolveHasJiao(reports[player.id]))
    const hasMiss = players.some((player) => !resolveHasJiao(reports[player.id]))

    if (hasCaller && hasMiss) {
      lines.push(`查叫：无叫向有叫各赔${SCORE.chaJiao}`)
    }
  }

  if (deduped) {
    lines.push('双方重复申报的点炮或点豆已去重')
  }

  if (!lines.length) {
    lines.push('本局无分数变化')
  }

  lines.push(`结算：${players.map((player) => formatDelta(player.name, deltas[player.id])).join('  ')}`)

  return lines
}

function settleRound(players, rawReports) {
  if (!Array.isArray(players) || players.length < 2) {
    return { ok: false, message: '至少两人才能结算' }
  }

  const reports = {}

  for (let index = 0; index < players.length; index += 1) {
    const player = players[index]
    const message = validateReport(player, rawReports ? rawReports[player.id] : null, players)

    if (message) {
      return { ok: false, message }
    }

    reports[player.id] = normalizeReport(rawReports[player.id])
  }

  const kindResult = detectKind(players, reports)

  if (kindResult.error) {
    return { ok: false, message: kindResult.error }
  }

  const winResult = collectWinEdges(players, reports)

  if (winResult.error) {
    return { ok: false, message: winResult.error }
  }

  const ids = players.map((player) => player.id)
  const matrix = createMatrix(ids)
  const jiao = {}

  players.forEach((player) => {
    jiao[player.id] = resolveHasJiao(reports[player.id])
  })

  const douAllowed = (id) => !(kindResult.kind === 'huang' && !jiao[id])

  players.forEach((player) => {
    if (reports[player.id].outcome !== 'zimo') {
      return
    }

    players.forEach((other) => {
      addTransfer(matrix, other.id, player.id, SCORE.zimo)
    })
  })

  winResult.edges.forEach((edge) => {
    addTransfer(matrix, edge.from, edge.to, SCORE.dianpao)
  })

  players.forEach((player) => {
    if (!douAllowed(player.id)) {
      return
    }

    const report = reports[player.id]

    players.forEach((other) => {
      addTransfer(matrix, other.id, player.id, report.menDou * SCORE.menDou)
      addTransfer(matrix, other.id, player.id, report.papoDou * SCORE.papoDou)
    })
  })

  const dianResult = collectDianDou(players, reports)

  Object.keys(dianResult.claims).forEach((konger) => {
    if (!douAllowed(konger)) {
      return
    }

    Object.keys(dianResult.claims[konger]).forEach((payer) => {
      addTransfer(matrix, payer, konger, dianResult.claims[konger][payer] * SCORE.dianDou)
    })
  })

  for (let left = 0; left < players.length; left += 1) {
    for (let right = left + 1; right < players.length; right += 1) {
      const first = players[left]
      const second = players[right]
      const firstJiao = jiao[first.id]
      const secondJiao = jiao[second.id]
      const firstChicken = chickenValue(reports[first.id])
      const secondChicken = chickenValue(reports[second.id])

      if (!firstJiao && !secondJiao) {
        continue
      }

      if (firstJiao && !secondJiao) {
        addTransfer(matrix, second.id, first.id, firstChicken)
        continue
      }

      if (!firstJiao && secondJiao) {
        addTransfer(matrix, first.id, second.id, secondChicken)
        continue
      }

      const diff = firstChicken - secondChicken

      if (diff > 0) {
        addTransfer(matrix, second.id, first.id, diff)
      } else if (diff < 0) {
        addTransfer(matrix, first.id, second.id, -diff)
      }
    }
  }

  if (kindResult.kind === 'huang') {
    players.forEach((payer) => {
      if (jiao[payer.id]) {
        return
      }

      players.forEach((receiver) => {
        if (jiao[receiver.id]) {
          addTransfer(matrix, payer.id, receiver.id, SCORE.chaJiao)
        }
      })
    })
  }

  const deltas = netDeltas(matrix, ids)
  const sum = ids.reduce((total, id) => total + deltas[id], 0)

  if (sum !== 0) {
    return { ok: false, message: '结算不平衡，请重试' }
  }

  return {
    ok: true,
    deltas,
    kind: kindResult.kind,
    lines: buildLines(
      players,
      reports,
      deltas,
      kindResult.kind,
      douAllowed,
      winResult.deduped || dianResult.deduped
    )
  }
}

module.exports = {
  SCORE,
  LIMITS,
  SEATS,
  OUTCOMES,
  createSeats,
  createEmptyReport,
  normalizeReport,
  impliedJiao,
  jiaoMode,
  resolveHasJiao,
  chickenValue,
  validateReport,
  settleRound
}
