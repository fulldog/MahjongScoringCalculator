const {
  SCORE,
  LIMITS,
  OUTCOMES,
  createSeats,
  createEmptyReport,
  normalizeReport,
  jiaoMode,
  validateReport,
  settleRound
} = require('../../utils/mahjong-score.js')

const STORAGE_KEY = 'mahjong-multi-state-v1'

function toneOf(value) {
  if (value > 0) {
    return 'num-pos'
  }

  if (value < 0) {
    return 'num-neg'
  }

  return ''
}

function formatSigned(value) {
  if (value > 0) {
    return `+${value}`
  }

  return String(value)
}

function initialState() {
  return {
    phase: 'seat',
    seats: createSeats(),
    players: [],
    round: 1,
    reportIndex: 0,
    drafts: {},
    history: []
  }
}

function seatLabel(seats, key) {
  const seat = (seats || []).find((item) => item.key === key)
  return seat ? seat.label : ''
}

function restoreSeats(saved) {
  const defaults = createSeats()

  if (!Array.isArray(saved)) {
    return defaults
  }

  return defaults.map((seat) => {
    const found = saved.find((item) => item && item.key === seat.key)
    const name = found && found.name ? Array.from(String(found.name).trim()).slice(0, 8).join('') : ''

    return {
      key: seat.key,
      label: seat.label,
      name
    }
  })
}

function buildView(state) {
  const seats = state.seats || []
  const history = state.history || []
  let players = state.players || []
  const seatedCount = seats.filter((seat) => seat.name).length
  const seatCards = seats.map((seat) => ({
    key: seat.key,
    label: seat.label,
    name: seat.name || '',
    occupied: !!seat.name,
    initial: seat.name ? Array.from(seat.name)[0] : seat.label
  }))
  const reportIndex = players.length ? Math.min(Math.max(state.reportIndex || 0, 0), players.length - 1) : 0
  const currentPlayer = players[reportIndex] || null
  const draft = currentPlayer ? normalizeReport(state.drafts && state.drafts[currentPlayer.id]) : createEmptyReport()
  const opponents = currentPlayer
    ? players
        .filter((player) => player.id !== currentPlayer.id)
        .map((player) => ({
          id: player.id,
          name: player.name,
          title: `${seatLabel(seats, player.seat)} ${player.name}`
        }))
    : []
  const latest = state.phase === 'board' ? history[0] : null
  const deltaMap = {}

  if (latest && Array.isArray(latest.deltas)) {
    latest.deltas.forEach((item) => {
      deltaMap[item.id] = Number(item.delta) || 0
    })
  }

  const scoreRows = players.map((player) => {
    const score = Number(player.score) || 0
    const hasDelta = Object.prototype.hasOwnProperty.call(deltaMap, player.id)
    const delta = hasDelta ? deltaMap[player.id] : 0

    return {
      id: player.id,
      name: player.name,
      label: seatLabel(seats, player.seat),
      score,
      tone: toneOf(score),
      deltaText: hasDelta && latest ? `第${latest.round}局 ${formatSigned(delta)}` : '',
      deltaTone: hasDelta ? toneOf(delta) : ''
    }
  })
  const progress = players.map((player, index) => ({
    id: player.id,
    name: player.name,
    index,
    state: index === reportIndex ? 'current' : index < reportIndex ? 'done' : 'wait'
  }))
  const isLast = players.length > 0 && reportIndex === players.length - 1
  const nextPlayer = players[reportIndex + 1]
  let dianOpponentId = state.dianOpponentId

  if (!opponents.some((item) => item.id === dianOpponentId)) {
    dianOpponentId = opponents[0] ? opponents[0].id : ''
  }

  return {
    seatCards,
    seatedCount,
    canStart: seatedCount >= 2,
    currentPlayer,
    currentTitle: currentPlayer ? `${seatLabel(seats, currentPlayer.seat)} ${currentPlayer.name}` : '',
    draft,
    opponents,
    dianRows: (draft.dianDou || []).map((item, index) => {
      const opponent = players.find((player) => player.id === item.opponentId)
      const name = opponent ? opponent.name : '未知'

      return {
        index,
        text: item.direction === 'gang' ? `杠了${name}` : `被${name}杠`
      }
    }),
    dianOpponentId,
    needOpponent: draft.outcome === 'jiepao' || draft.outcome === 'fangpao',
    opponentTitle: draft.outcome === 'jiepao' ? '谁放的炮' : '谁接的炮',
    jiaoMode: jiaoMode(draft.outcome),
    isFirst: reportIndex === 0,
    isLast,
    nextButtonText: isLast ? '结算本局' : `下一位：${nextPlayer ? nextPlayer.name : ''}`,
    progressText: players.length ? `${reportIndex + 1}/${players.length}` : '',
    progress,
    scoreRows,
    reportIndex,
    historyView: history.map((item, index) => ({
      id: item.id || `history-${index}`,
      round: item.round || index + 1,
      lines: Array.isArray(item.lines) ? item.lines : []
    }))
  }
}

Page({
  data: {
    outcomes: OUTCOMES,
    scoreRule: SCORE,
    ...initialState(),
    ...buildView(initialState())
  },

  onLoad() {
    this.ready = false

    try {
      this.restore()
    } catch (error) {
      this.ready = true
    }
  },

  onHide() {
    this.persist()
  },

  onUnload() {
    this.persist()
  },

  current() {
    if (!this.snapshot) {
      return this.data
    }

    return {
      ...this.data,
      phase: this.snapshot.phase,
      seats: this.snapshot.seats,
      players: this.snapshot.players,
      round: this.snapshot.round,
      reportIndex: this.snapshot.reportIndex,
      drafts: this.snapshot.drafts,
      history: this.snapshot.history
    }
  },

  commit(partial, callback) {
    const base = this.current()
    const next = {
      phase: base.phase,
      seats: base.seats,
      players: base.players,
      round: base.round,
      reportIndex: base.reportIndex,
      drafts: base.drafts,
      history: base.history,
      dianOpponentId: this.data.dianOpponentId,
      ...partial
    }
    const view = buildView(next)

    this.remember(next, view)
    this.setData(
      {
        ...partial,
        ...view
      },
      callback
    )
  },

  remember(state, view) {
    this.snapshot = {
      phase: state.phase,
      seats: state.seats,
      players: state.players,
      round: state.round,
      reportIndex: view && view.reportIndex !== undefined ? view.reportIndex : state.reportIndex,
      drafts: state.drafts,
      history: state.history
    }
  },

  persist() {
    if (!this.ready) {
      return
    }

    const source = this.snapshot || this.data

    wx.setStorageSync(STORAGE_KEY, {
      phase: source.phase,
      seats: source.seats,
      players: source.players,
      round: source.round,
      reportIndex: source.reportIndex,
      drafts: source.drafts,
      history: source.history
    })
  },

  restore() {
    const saved = wx.getStorageSync(STORAGE_KEY)

    if (!saved || typeof saved !== 'object') {
      this.ready = true
      return
    }

    const seats = restoreSeats(saved.seats)

    if (Array.isArray(saved.players)) {
      saved.players.forEach((player) => {
        const seat = player && seats.find((item) => item.key === player.id)

        if (seat && !seat.name && player.name) {
          seat.name = Array.from(String(player.name).trim()).slice(0, 8).join('')
        }
      })
    }

    let players = []

    if (Array.isArray(saved.players)) {
      players = seats
        .filter((seat) => saved.players.some((player) => player && player.id === seat.key))
        .map((seat) => {
          const found = saved.players.find((player) => player && player.id === seat.key)
          const score = Number(found.score)

          return {
            id: seat.key,
            seat: seat.key,
            name: seat.name || found.name || seat.label,
            score: Number.isFinite(score) ? score : 0
          }
        })
        .filter((player) => player.name)
    }

    let phase = saved.phase === 'report' || saved.phase === 'board' ? saved.phase : 'seat'

    if (players.length < 2) {
      phase = 'seat'
      players = []
    }

    if (phase === 'seat') {
      players = []
    }

    const drafts = {}

    if (phase === 'report') {
      players.forEach((player) => {
        drafts[player.id] = normalizeReport(saved.drafts && saved.drafts[player.id])
      })
    }

    let reportIndex = Number(saved.reportIndex) || 0

    if (reportIndex < 0 || reportIndex >= players.length) {
      reportIndex = 0
    }

    const partial = {
      phase,
      seats,
      players,
      round: Math.max(1, Number(saved.round) || 1),
      reportIndex,
      drafts,
      history: Array.isArray(saved.history) ? saved.history : []
    }
    const view = buildView({
      ...partial,
      dianOpponentId: this.data.dianOpponentId
    })

    this.remember(partial, view)
    this.ready = true
    this.setData({
      ...partial,
      ...view
    })
  },

  alert(message) {
    wx.showModal({
      title: '请核对',
      content: message,
      showCancel: false
    })
  },

  onSeatTap(event) {
    const { key } = event.currentTarget.dataset
    const seat = this.current().seats.find((item) => item.key === key)

    if (!seat || this.current().phase !== 'seat') {
      return
    }

    if (!seat.name) {
      this.promptName(key)
      return
    }

    wx.showActionSheet({
      itemList: ['改名', '离座'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.promptName(key)
        }

        if (res.tapIndex === 1) {
          this.clearSeat(key)
        }
      }
    })
  },

  promptName(key) {
    const seat = this.current().seats.find((item) => item.key === key)

    if (!seat) {
      return
    }

    wx.showModal({
      title: seat.name ? '修改名称' : '入座',
      editable: true,
      placeholderText: '请输入昵称',
      content: seat.name || '',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        const chars = Array.from((res.content || '').trim())

        if (!chars.length) {
          wx.showToast({ title: '名称不能为空', icon: 'none' })
          this.promptName(key)
          return
        }

        if (chars.length > 8) {
          wx.showToast({ title: '最多8个字', icon: 'none' })
          this.promptName(key)
          return
        }

        const name = chars.join('')
        const seats = this.current().seats.map((item) => (item.key === key ? { ...item, name } : item))
        const players = this.current().players.map((player) => (player.id === key ? { ...player, name } : player))

        this.commit({ seats, players }, () => this.persist())
      }
    })
  },

  clearSeat(key) {
    if (this.current().phase !== 'seat') {
      this.alert('对局中不能离座，请先重新开局')
      return
    }

    const seats = this.current().seats.map((item) => (item.key === key ? { ...item, name: '' } : item))
    this.commit({ seats }, () => this.persist())
  },

  renameCurrent() {
    const player = this.current().players[this.current().reportIndex]

    if (!player) {
      return
    }

    this.promptName(player.id)
  },

  startGame() {
    const seated = this.current().seats.filter((seat) => seat.name)

    if (seated.length < 2) {
      wx.showToast({ title: '至少两人入座', icon: 'none' })
      return
    }

    const players = seated.map((seat) => ({
      id: seat.key,
      seat: seat.key,
      name: seat.name,
      score: 0
    }))
    const drafts = {}

    players.forEach((player) => {
      drafts[player.id] = createEmptyReport()
    })

    this.commit(
      {
        phase: 'report',
        players,
        drafts,
        round: 1,
        reportIndex: 0,
        history: []
      },
      () => this.persist()
    )
  },

  patchDraft(mutator) {
    const player = this.current().players[this.current().reportIndex]

    if (!player) {
      return
    }

    const draft = normalizeReport(this.current().drafts[player.id])
    mutator(draft)

    this.commit(
      {
        drafts: {
          ...this.current().drafts,
          [player.id]: normalizeReport(draft)
        }
      },
      () => this.persist()
    )
  },

  onOutcome(event) {
    const { key } = event.currentTarget.dataset

    this.patchDraft((draft) => {
      draft.outcome = key

      if (key === 'fangpao') {
        draft.hasJiao = false
      }

      if (key === 'zouju') {
        draft.hasJiao = true
      }

      if (key !== 'jiepao' && key !== 'fangpao') {
        draft.opponentId = ''
      }
    })
  },

  onOpponent(event) {
    const { id } = event.currentTarget.dataset

    this.patchDraft((draft) => {
      draft.opponentId = id
    })
  },

  onToggleJiao() {
    if (this.data.jiaoMode !== 'toggle') {
      return
    }

    this.patchDraft((draft) => {
      draft.hasJiao = !draft.hasJiao
    })
  },

  onStep(event) {
    const { field, delta } = event.currentTarget.dataset
    const max = LIMITS[field] || 0
    const step = Number(delta)

    this.patchDraft((draft) => {
      draft[field] = Math.max(0, Math.min(max, (Number(draft[field]) || 0) + step))
    })
  },

  onFlag(event) {
    const { field } = event.currentTarget.dataset

    this.patchDraft((draft) => {
      draft[field] = !draft[field]
    })
  },

  onPickDian(event) {
    this.commit({ dianOpponentId: event.currentTarget.dataset.id })
  },

  onAddDian(event) {
    const direction = event.currentTarget.dataset.direction
    const opponentId = this.data.dianOpponentId

    if (!opponentId) {
      wx.showToast({ title: '请选择对象', icon: 'none' })
      return
    }

    if ((this.data.draft.dianDou || []).length >= LIMITS.dianDou) {
      wx.showToast({ title: '点豆已达上限', icon: 'none' })
      return
    }

    this.patchDraft((draft) => {
      draft.dianDou.push({ opponentId, direction })
    })
  },

  onRemoveDian(event) {
    const index = Number(event.currentTarget.dataset.index)

    this.patchDraft((draft) => {
      draft.dianDou = draft.dianDou.filter((_, itemIndex) => itemIndex !== index)
    })
  },

  onProgressTap(event) {
    const index = Number(event.currentTarget.dataset.index)

    if (index > this.current().reportIndex) {
      wx.showToast({ title: '请按顺序填写', icon: 'none' })
      return
    }

    this.commit({ reportIndex: index }, () => this.persist())
  },

  onPrev() {
    if (this.current().reportIndex <= 0) {
      wx.showToast({ title: '已经是第一位', icon: 'none' })
      return
    }

    this.commit({ reportIndex: this.current().reportIndex - 1 }, () => this.persist())
  },

  onNext() {
    const player = this.current().players[this.current().reportIndex]
    const message = validateReport(player, this.current().drafts[player.id], this.current().players)

    if (message) {
      this.alert(message)
      return
    }

    if (this.current().reportIndex < this.current().players.length - 1) {
      this.commit({ reportIndex: this.current().reportIndex + 1 }, () => this.persist())
      return
    }

    this.settle()
  },

  settle() {
    if (this.settling) {
      return
    }

    this.settling = true
    const result = settleRound(this.current().players, this.current().drafts)

    if (!result.ok) {
      this.settling = false
      this.alert(result.message)
      return
    }

    const currentRound = this.current().round
    const players = this.current().players.map((player) => ({
      ...player,
      score: player.score + result.deltas[player.id]
    }))
    const history = [
      {
        id: `${currentRound}-${Date.now()}`,
        round: currentRound,
        lines: result.lines,
        deltas: this.current().players.map((player) => ({
          id: player.id,
          delta: result.deltas[player.id]
        }))
      },
      ...this.current().history
    ]

    this.commit(
      {
        phase: 'board',
        players,
        history,
        round: currentRound + 1,
        drafts: {}
      },
      () => {
        this.settling = false
        this.persist()
      }
    )
  },

  nextRound() {
    const drafts = {}

    this.current().players.forEach((player) => {
      drafts[player.id] = createEmptyReport()
    })

    this.commit(
      {
        phase: 'report',
        reportIndex: 0,
        drafts
      },
      () => this.persist()
    )
  },

  undoLast() {
    const latest = this.current().history[0]

    if (!latest) {
      return
    }

    wx.showModal({
      title: '撤回上一局',
      content: '确定撤回上一局结算吗？',
      confirmText: '撤回',
      confirmColor: '#d64545',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        const players = this.current().players.map((player) => {
          const change = (latest.deltas || []).find((item) => item.id === player.id)

          return {
            ...player,
            score: player.score - (change ? Number(change.delta) || 0 : 0)
          }
        })

        this.commit(
          {
            players,
            history: this.current().history.slice(1),
            round: Math.max(1, this.current().round - 1),
            phase: 'board'
          },
          () => this.persist()
        )
      }
    })
  },

  resetGame() {
    wx.showModal({
      title: '重新开局',
      content: '确定清空分数和历史，保留当前座位昵称吗？',
      confirmText: '重新开局',
      confirmColor: '#d64545',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.commit(
          {
            phase: 'seat',
            players: [],
            round: 1,
            reportIndex: 0,
            drafts: {},
            history: []
          },
          () => this.persist()
        )
      }
    })
  }
})
