const {
  SCORE,
  LIMITS,
  OUTCOMES,
  createEmptyReport,
  normalizeReport,
  jiaoMode
} = require('../../utils/mahjong-score.js')
const auth = require('../../utils/auth.js')
const { request } = require('../../utils/api.js')
const roomSocket = require('../../utils/room-socket.js')

function toneOf(value) {
  if (value > 0) {
    return 'pos'
  }
  if (value < 0) {
    return 'neg'
  }
  return ''
}

function signed(value) {
  if (value > 0) {
    return '+' + value
  }
  return String(value)
}

Page({
  data: {
    code: '',
    connected: false,
    needHostLogin: false,
    loggedIn: false,
    status: 'waiting',
    roundNo: 0,
    roundStatus: '',
    settleError: '',
    seats: [],
    online: [],
    onlineOpen: false,
    you: { guest: true, host: false, seat: '', submitted: false, userId: 0 },
    history: [],
    showForm: false,
    draft: createEmptyReport(),
    outcomes: OUTCOMES,
    opponents: [],
    dianOpponentId: '',
    dianRows: [],
    jiaoMode: 'toggle',
    needOpponent: false,
    opponentTitle: '对手',
    scoreRule: SCORE,
    flying: [],
    danmakuText: '',
    danmakuWait: 0
  },

  onLoad(options) {
    this.pendingRoom = options.room || ''
    this.roundKey = ''
    this.flyId = 0
    wx.showShareMenu({ menus: ['shareAppMessage'] })
    this.boot()
  },

  onShow() {
    if (this.data.code && !this.sock) {
      this.openSocket(this.data.code)
    }
  },

  onUnload() {
    this.closeSocket()
    if (this.danmakuTimer) {
      clearInterval(this.danmakuTimer)
    }
  },

  onShareAppMessage() {
    if (!this.data.code) {
      return { title: '捉鸡记账本', path: '/pages/home/home' }
    }
    return {
      title: '来一起捉鸡',
      path: '/pages/multi/multi?room=' + this.data.code
    }
  },

  boot() {
    const loggedIn = auth.isLoggedIn()
    this.setData({ loggedIn })
    const open = (code) => {
      auth.ensureGuest().catch(() => {}).finally(() => this.openSocket(code))
    }
    if (this.pendingRoom) {
      open(this.pendingRoom)
      return
    }
    if (!loggedIn) {
      this.setData({ needHostLogin: true })
      return
    }
    request({
      url: '/api/v1/rooms',
      method: 'POST',
      token: auth.userToken(),
      data: {}
    }).then((body) => {
      this.pendingRoom = body.code
      open(body.code)
    }).catch((err) => {
      wx.showToast({ title: err.message || '开房失败', icon: 'none' })
    })
  },

  openSocket(code) {
    this.closeSocket()
    const token = auth.playerToken()
    if (!token) {
      wx.showToast({ title: '网络不可用', icon: 'none' })
      return
    }
    const current = roomSocket.connect(code, token, {
      onState: (room) => this.applyRoom(room),
      onDanmaku: (message) => this.pushDanmaku(message),
      onError: (message) => wx.showToast({ title: message, icon: 'none' }),
      onClose: () => {
        if (this.sock === current) {
          this.sock = null
          this.setData({ connected: false })
        }
      }
    })
    this.sock = current
    this.setData({ code, connected: true, needHostLogin: false })
  },

  closeSocket() {
    if (this.sock) {
      this.sock.close()
      this.sock = null
    }
  },

  applyRoom(room) {
    const you = room.you || {}
    const roundKey = (room.roundNo || 0) + ':' + (room.roundStatus || '')
    const seats = (room.seats || []).map((seat) => {
      const score = Number(seat.score) || 0
      return {
        key: seat.key,
        label: seat.label,
        empty: !!seat.empty,
        userId: seat.userId ? String(seat.userId) : '',
        nickname: seat.nickname || '',
        avatarUrl: seat.avatarUrl || '',
        score,
        scoreText: seat.empty ? '' : signed(score),
        tone: seat.empty ? '' : toneOf(score),
        initial: seat.nickname ? Array.from(seat.nickname)[0] : seat.label,
        nameText: seat.empty ? (auth.isLoggedIn() && room.status === 'waiting' ? '入座' : '空位') : seat.nickname,
        mine: !seat.empty && String(seat.userId) === String(you.userId),
        submitted: !!seat.submitted
      }
    })
    const opponents = seats.filter((seat) => !seat.empty && !seat.mine).map((seat) => ({
      id: seat.userId,
      title: seat.label + ' ' + seat.nickname
    }))
    const showForm = room.status === 'playing' && room.roundStatus === 'reporting' && !!you.seat && !you.guest
    const patch = {
      code: room.code,
      status: room.status,
      roundNo: room.roundNo || 0,
      roundStatus: room.roundStatus || '',
      settleError: room.settleError || '',
      seats,
      online: room.online || [],
      you,
      history: (room.history || []).slice().reverse(),
      opponents,
      showForm,
      loggedIn: auth.isLoggedIn(),
      connected: true
    }
    if (roundKey !== this.roundKey) {
      this.roundKey = roundKey
      patch.draft = createEmptyReport()
      patch.dianOpponentId = ''
      patch.dianRows = []
      patch.jiaoMode = 'toggle'
      patch.needOpponent = false
      patch.opponentTitle = '对手'
    }
    this.setData(patch)
  },

  send(payload) {
    if (!this.sock) {
      wx.showToast({ title: '还没连上房间', icon: 'none' })
      return false
    }
    this.sock.send(payload)
    return true
  },

  onSeatTap(event) {
    const key = event.currentTarget.dataset.key
    const seat = (this.data.seats || []).find((item) => item.key === key)
    if (!seat) {
      return
    }
    if (this.data.status !== 'waiting') {
      return
    }
    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '登录后才能入座', icon: 'none' })
      return
    }
    if (seat.mine) {
      wx.showModal({
        title: '离开座位',
        content: '确定离开' + seat.label + '家吗？',
        success: (res) => {
          if (res.confirm) {
            this.send({ type: 'unsit' })
          }
        }
      })
      return
    }
    if (!seat.empty) {
      wx.showToast({ title: '这个位子有人了', icon: 'none' })
      return
    }
    this.send({ type: 'sit', seat: key })
  },

  startGame() {
    this.send({ type: 'start' })
  },

  nextRound() {
    this.send({ type: 'next' })
  },

  endMatch() {
    wx.showModal({
      title: '结束牌局',
      content: '结束后会计入统计，不能再申报。',
      confirmText: '结束',
      confirmColor: '#d64545',
      success: (res) => {
        if (res.confirm) {
          this.send({ type: 'end' })
        }
      }
    })
  },

  goLogin() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  toggleOnline() {
    this.setData({ onlineOpen: !this.data.onlineOpen })
  },

  patchDraft(mutator) {
    const draft = normalizeReport(this.data.draft)
    mutator(draft)
    const next = normalizeReport(draft)
    const rows = (next.dianDou || []).map((item, index) => {
      const opponent = (this.data.opponents || []).find((seat) => seat.id === String(item.opponentId))
      const name = opponent ? opponent.title : '对手'
      return {
        index,
        text: item.direction === 'gang' ? '杠了 ' + name : '被 ' + name + ' 杠'
      }
    })
    this.setData({
      draft: next,
      dianRows: rows,
      jiaoMode: jiaoMode(next.outcome),
      needOpponent: next.outcome === 'jiepao' || next.outcome === 'fangpao',
      opponentTitle: next.outcome === 'jiepao' ? '谁放的炮' : '谁接的炮'
    })
  },

  onOutcome(event) {
    const key = event.currentTarget.dataset.key
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
    const id = String(event.currentTarget.dataset.id)
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
    const field = event.currentTarget.dataset.field
    const delta = Number(event.currentTarget.dataset.delta)
    const max = LIMITS[field] || 0
    this.patchDraft((draft) => {
      draft[field] = Math.max(0, Math.min(max, (Number(draft[field]) || 0) + delta))
    })
  },

  onFlag(event) {
    const field = event.currentTarget.dataset.field
    this.patchDraft((draft) => {
      draft[field] = !draft[field]
    })
  },

  onPickDian(event) {
    this.setData({ dianOpponentId: String(event.currentTarget.dataset.id) })
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

  submitReport() {
    const draft = normalizeReport(this.data.draft)
    if ((draft.outcome === 'jiepao' || draft.outcome === 'fangpao') && !draft.opponentId) {
      wx.showToast({ title: '请选择对手', icon: 'none' })
      return
    }
    this.send({ type: 'report', report: draft })
  },

  onDanmakuInput(event) {
    this.setData({ danmakuText: event.detail.value })
  },

  sendDanmaku() {
    if (this.data.danmakuWait > 0) {
      wx.showToast({ title: this.data.danmakuWait + ' 秒后可再发', icon: 'none' })
      return
    }
    const text = (this.data.danmakuText || '').trim()
    if (!text) {
      return
    }
    if (!this.send({ type: 'danmaku', text })) {
      return
    }
    this.setData({ danmakuText: '', danmakuWait: 10 })
    if (this.danmakuTimer) {
      clearInterval(this.danmakuTimer)
    }
    this.danmakuTimer = setInterval(() => {
      const next = this.data.danmakuWait - 1
      this.setData({ danmakuWait: next })
      if (next <= 0) {
        clearInterval(this.danmakuTimer)
      }
    }, 1000)
  },

  pushDanmaku(message) {
    const id = ++this.flyId
    const item = {
      id,
      top: 16 + (id % 4) * 36,
      text: (message.nickname || '游客') + '：' + message.content
    }
    this.setData({ flying: this.data.flying.concat(item) })
    setTimeout(() => {
      this.setData({ flying: (this.data.flying || []).filter((fly) => fly.id !== id) })
    }, 6000)
  }
})
