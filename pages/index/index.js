const STORAGE_KEY = 'mahjong-scoring-state-v2'

const initialPlayers = [
  { id: 'north', key: 'north', direction: '北', name: '北', displayName: '北', label: '上北', score: 0, input: '', avatar: '', isMe: false },
  { id: 'west', key: 'west', direction: '西', name: '西', displayName: '西', label: '左西', score: 0, input: '', avatar: '', isMe: false },
  { id: 'east', key: 'east', direction: '东', name: '东', displayName: '东', label: '右东', score: 0, input: '', avatar: '', isMe: false },
  { id: 'south', key: 'south', direction: '南', name: '我', displayName: '我', label: '下南', score: 0, input: '', avatar: '', isMe: true }
]

const SWAPPABLE_SEATS = ['north', 'west', 'east']

function cloneInitialPlayers() {
  return normalizePlayers(initialPlayers)
}

function getDisplayParts(name) {
  const chars = Array.from(name || '')

  return {
    displayName: chars.join(''),
    displayFirst: chars[0] || '',
    displayRest: chars.slice(1).join('')
  }
}

function normalizePlayers(players) {
  return players.map((player) => {
    let name = player.name || player.direction

    if (player.isMe && (!name || name === '南')) {
      name = '我'
    }

    const displayParts = getDisplayParts(name)
    const score = normalizeNumber(player.score)

    return {
      ...player,
      id: player.id || player.direction || player.key,
      name,
      score,
      scoreTone: numberTone(score),
      inputTone: getInputTone(player.input),
      ...getScoreInputParts(player.input),
      ...displayParts
    }
  })
}

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return 0
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function isValidScoreInput(value) {
  return /^-?\d+$/.test(String(value).trim())
}

function getScoreInputParts(input) {
  const raw = String(input || '').trim()
  const inputTone = getInputTone(raw)

  if (raw.startsWith('-')) {
    return {
      inputSign: '-',
      inputDigits: raw.slice(1).replace(/\D/g, ''),
      signClass: `is-neg ${inputTone}`.trim()
    }
  }

  return {
    inputSign: '+',
    inputDigits: raw.replace(/\D/g, ''),
    signClass: inputTone
  }
}

function composeScoreInput(sign, digits) {
  const cleaned = String(digits || '').replace(/\D/g, '')

  if (!cleaned) {
    return sign === '-' ? '-' : ''
  }

  return sign === '-' ? `-${cleaned}` : cleaned
}

function clearedScoreInput() {
  return {
    input: '',
    inputTone: '',
    inputSign: '+',
    inputDigits: '',
    signClass: ''
  }
}

function numberTone(value) {
  if (value > 0) {
    return 'num-pos'
  }

  if (value < 0) {
    return 'num-neg'
  }

  return ''
}

function getInputTone(input) {
  const trimmed = String(input || '').trim()

  if (!trimmed || !isValidScoreInput(trimmed)) {
    return ''
  }

  return numberTone(Number(trimmed))
}

function appendHistoryNumber(parts, value) {
  parts.push({
    text: value < 0 ? `(${value})` : String(value),
    tone: numberTone(value)
  })
}

function buildSeatHistoryParts(name, score, seatDelta, myDelta, nextScore) {
  const parts = [{ text: `${name}(`, tone: '' }]

  appendHistoryNumber(parts, myDelta)
  parts.push({ text: ' - ', tone: '' })
  appendHistoryNumber(parts, seatDelta)
  parts.push({ text: ' + ', tone: '' })
  appendHistoryNumber(parts, score)
  parts.push({ text: ' = ', tone: '' })
  appendHistoryNumber(parts, nextScore)
  parts.push({ text: ')', tone: '' })

  return parts
}

Page({
  data: {
    players: cloneInitialPlayers(),
    round: 1,
    history: [],
    totalScore: 0,
    myScore: 0,
    myScoreTone: '',
    draggingKey: '',
    dragStyle: '',
    dragTargetKey: '',
    showHelpModal: false,
    isLandscape: false,
    boardStyle: ''
  },

  onLoad() {
    this.restoreState()
    this.syncOrientation()
  },

  onShow() {
    this.syncOrientation()
  },

  onResize(res) {
    const size = res && res.size
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()

    if (size && size.windowWidth && size.windowHeight) {
      this.applyOrientation(size.windowWidth, size.windowHeight, info)
      return
    }

    this.applyOrientation(info.windowWidth, info.windowHeight, info)
  },

  syncOrientation() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.applyOrientation(info.windowWidth, info.windowHeight, info)
  },

  applyOrientation(width, height, info) {
    if (!width || !height) {
      return
    }

    const windowInfo = info || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync())
    const isLandscape = width > height
    const boardStyle = isLandscape ? this.buildLandscapeStyle(width, height, windowInfo) : ''

    if (isLandscape === this.data.isLandscape && boardStyle === this.data.boardStyle) {
      return
    }

    this.clearLongPressTimer()
    this.dragState = null

    this.setData({
      isLandscape,
      boardStyle,
      draggingKey: '',
      dragStyle: '',
      dragTargetKey: ''
    })
  },

  buildLandscapeStyle(width, height, info = {}) {
    const insets = info.safeAreaInsets || {}
    let padTop = Math.max(0, Number(insets.top) || 0)
    let padRight = Math.max(0, Number(insets.right) || 0)
    let padBottom = Math.max(0, Number(insets.bottom) || 0)
    let padLeft = Math.max(0, Number(insets.left) || 0)

    if (padTop + padBottom > height * 0.3) {
      padTop = 0
      padBottom = 0
    }

    if (padLeft + padRight > width * 0.3) {
      padLeft = 0
      padRight = 0
    }

    padTop += 6
    padRight += 6
    padBottom += 6
    padLeft += 6

    const gap = 8
    const contentW = Math.max(240, width - padLeft - padRight)
    const contentH = Math.max(160, height - padTop - padBottom)
    const square = Math.round(Math.min(contentH, contentW * 0.58))
    const avatar = Math.round(Math.max(34, Math.min(52, square * 0.13)))
    const center = Math.round(Math.max(60, Math.min(96, square * 0.24)))
    const card = Math.round(Math.max(56, avatar * 1.6))
    const inputH = Math.round(Math.max(22, avatar * 0.46))
    const sign = Math.round(Math.max(20, Math.min(26, inputH)))
    const scoreBadgeH = Math.round(Math.max(18, avatar * 0.38))
    const font = Math.round(Math.max(12, avatar * 0.38))
    const inset = Math.round(Math.max(20, square * 0.05))
    const btnH = Math.round(Math.max(28, avatar * 0.58))
    const centerValue = Math.round(font * 2.1)
    const nameRest = Math.round(Math.max(9, font * 0.7))
    const submitW = Math.round(btnH * 2.2)
    const orientW = Math.round(btnH * 2)
    const helpLeft = inset + orientW + 8
    const scoreWBadge = Math.round(card * 0.8)
    const inputW = Math.round(card * 0.92)
    const cardH = scoreBadgeH + 3 + avatar + 3 + inputH
    const radius = Math.round(Math.max(square * 0.3, (square - cardH) / 2 - inset))

    return [
      `--ls-page-h:${height}px`,
      `--ls-pad-top:${padTop}px`,
      `--ls-pad-right:${padRight}px`,
      `--ls-pad-bottom:${padBottom}px`,
      `--ls-pad-left:${padLeft}px`,
      `--ls-square:${square}px`,
      `--ls-avatar:${avatar}px`,
      `--ls-center:${center}px`,
      `--ls-card:${card}px`,
      `--ls-input-h:${inputH}px`,
      `--ls-input-w:${inputW}px`,
      `--ls-sign:${sign}px`,
      `--ls-score-h:${scoreBadgeH}px`,
      `--ls-score-w-badge:${scoreWBadge}px`,
      `--ls-font:${font}px`,
      `--ls-font-lg:${centerValue}px`,
      `--ls-font-sm:${nameRest}px`,
      `--ls-inset:${inset}px`,
      `--ls-btn-h:${btnH}px`,
      `--ls-orient-w:${orientW}px`,
      `--ls-help-left:${helpLeft}px`,
      `--ls-submit-w:${submitW}px`,
      `--ls-radius:${radius}px`,
      `--ls-radius-n:-${radius}px`
    ].join(';')
  },

  restoreState() {
    const savedState = wx.getStorageSync(STORAGE_KEY)

    if (!savedState) {
      return
    }

    const players = normalizePlayers(savedState.players || cloneInitialPlayers())
    const myScore = this.getMyScore(players)

    this.setData({
      players,
      round: savedState.round || 1,
      history: savedState.history || [],
      totalScore: savedState.totalScore || 0,
      myScore,
      myScoreTone: numberTone(myScore)
    })
  },

  persistState(nextState = {}) {
    const state = {
      players: nextState.players || this.data.players,
      round: nextState.round || this.data.round,
      history: nextState.history || this.data.history,
      totalScore:
        nextState.totalScore === undefined ? this.data.totalScore : nextState.totalScore
    }

    wx.setStorageSync(STORAGE_KEY, state)
  },

  onScoreInput(event) {
    const { key } = event.currentTarget.dataset
    const digits = String(event.detail.value || '').replace(/\D/g, '')
    const players = this.data.players.map((player) => {
      if (player.key !== key) {
        return player
      }

      const value = composeScoreInput(player.inputSign || '+', digits)

      return {
        ...player,
        input: value,
        inputTone: getInputTone(value),
        ...getScoreInputParts(value)
      }
    })

    this.setData({ players })
  },

  onToggleScoreSign(event) {
    const { key } = event.currentTarget.dataset
    const players = this.data.players.map((player) => {
      if (player.key !== key) {
        return player
      }

      const nextSign = player.inputSign === '-' ? '+' : '-'
      const value = composeScoreInput(nextSign, player.inputDigits)

      return {
        ...player,
        input: value,
        inputTone: getInputTone(value),
        ...getScoreInputParts(value)
      }
    })

    this.setData({ players })
  },

  onChooseAvatar(event) {
    const { avatarUrl } = event.detail
    const players = this.data.players.map((player) => {
      if (!player.isMe) {
        return player
      }

      return {
        ...player,
        avatar: avatarUrl
      }
    })

    this.setData({ players })
    this.persistState({ players })
  },

  onSeatTap(event) {
    const { key } = event.currentTarget.dataset

    if (!SWAPPABLE_SEATS.includes(key) || this.isSeatTapSuppressed()) {
      return
    }

    this.openSeatNameModal(key)
  },

  isSeatTapSuppressed() {
    return this.suppressSeatTapUntil && Date.now() < this.suppressSeatTapUntil
  },

  openSeatNameModal(key) {
    const player = this.data.players.find((item) => item.key === key)

    if (!player) {
      return
    }

    wx.showModal({
      title: '设置名称',
      content: player.name || player.direction,
      editable: true,
      placeholderText: '请输入名称',
      confirmText: '确认',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        const name = (res.content || '').trim()

        if (!name) {
          wx.showToast({
            title: '名称不能为空',
            icon: 'none'
          })
          this.openSeatNameModal(key)
          return
        }

        const players = this.data.players.map((item) => {
          if (item.key !== key) {
            return item
          }

          return {
            ...item,
            name,
            ...getDisplayParts(name)
          }
        })

        this.setData({ players })
        this.persistState({ players })
      }
    })
  },

  openHelpModal() {
    this.setData({ showHelpModal: true })
  },

  closeHelpModal() {
    this.setData({ showHelpModal: false })
  },

  preventHelpModalClose() {},

  toggleOrientation() {
    if (typeof wx.setPageOrientation !== 'function') {
      wx.showToast({
        title: '当前版本不支持切换',
        icon: 'none'
      })
      return
    }

    const orientation = this.data.isLandscape ? 'portrait' : 'landscape'

    wx.setPageOrientation({
      orientation,
      fail: () => {
        wx.showToast({
          title: '切换失败，请手动旋转',
          icon: 'none'
        })
      }
    })
  },

  onSeatTouchStart(event) {
    const { key } = event.currentTarget.dataset

    if (!SWAPPABLE_SEATS.includes(key)) {
      return
    }

    const touch =
      (event.touches && event.touches[0]) ||
      (event.changedTouches && event.changedTouches[0])

    if (!touch) {
      return
    }

    this.clearLongPressTimer()
    this.pendingLongPress = {
      key,
      startX: touch.clientX,
      startY: touch.clientY,
      touch
    }
    this.longPressTimer = setTimeout(() => {
      if (!this.pendingLongPress || this.pendingLongPress.key !== key) {
        return
      }

      this.suppressSeatTapUntil = Date.now() + 800
      this.startSeatDrag(key, this.pendingLongPress.touch)
    }, 3000)
  },

  startSeatDrag(key, touch) {
    this.suppressSeatTapUntil = Date.now() + 800
    const query = wx.createSelectorQuery().in(this)

    query.select('.score-panel').boundingClientRect()
    SWAPPABLE_SEATS.forEach((seatKey) => {
      query.select(`.player-card.${seatKey}`).boundingClientRect()
    })

    query.exec((rects) => {
      const [panelRect, ...seatRectList] = rects
      const draggedRect = seatRectList[SWAPPABLE_SEATS.indexOf(key)]

      if (!panelRect || !draggedRect) {
        return
      }

      const seatRects = SWAPPABLE_SEATS.reduce((result, seatKey, index) => {
        result[seatKey] = seatRectList[index]
        return result
      }, {})

      this.dragState = {
        key,
        panelRect,
        seatRects,
        width: draggedRect.width,
        height: draggedRect.height,
        offsetX: touch.clientX - draggedRect.left,
        offsetY: touch.clientY - draggedRect.top
      }

      wx.vibrateShort({ type: 'light' })
      this.updateDragStyle(touch)
    })
  },

  onSeatDragMove(event) {
    const touch = event.touches[0]

    if (this.pendingLongPress && !this.dragState) {
      const distanceX = touch.clientX - this.pendingLongPress.startX
      const distanceY = touch.clientY - this.pendingLongPress.startY
      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY)

      if (distance > 12) {
        this.clearLongPressTimer()
      } else {
        this.pendingLongPress.touch = touch
      }

      return
    }

    if (!this.dragState) {
      return
    }

    this.updateDragStyle(touch)
  },

  onSeatDragEnd(event) {
    this.clearLongPressTimer()

    if (!this.dragState) {
      this.clearDragState()
      return
    }

    this.suppressSeatTapUntil = Date.now() + 800
    const touch = event.changedTouches[0]
    const { left, top } = this.getDragPosition(touch)
    const targetKey = this.getCoveredTargetKey(left, top)
    const draggedKey = this.dragState.key

    if (targetKey && targetKey !== draggedKey) {
      this.swapSeats(draggedKey, targetKey)
      return
    }

    this.clearDragState()
  },

  onSeatDragCancel() {
    this.clearLongPressTimer()

    if (this.dragState) {
      this.suppressSeatTapUntil = Date.now() + 800
    }

    this.clearDragState()
  },

  updateDragStyle(touch) {
    const { key } = this.dragState
    const { left, top } = this.getDragPosition(touch)
    const dragTargetKey = this.getCoveredTargetKey(left, top)

    this.setData({
      draggingKey: key,
      dragStyle: `left: ${left}px; top: ${top}px; right: auto; bottom: auto; transform: scale(1.12) translateY(-10rpx);`,
      dragTargetKey
    })
  },

  getDragPosition(touch) {
    const { panelRect, offsetX, offsetY } = this.dragState

    return {
      left: touch.clientX - panelRect.left - offsetX,
      top: touch.clientY - panelRect.top - offsetY
    }
  },

  getCoveredTargetKey(left, top) {
    const { key, panelRect, seatRects, width, height } = this.dragState

    for (let index = 0; index < SWAPPABLE_SEATS.length; index += 1) {
      const seatKey = SWAPPABLE_SEATS[index]

      if (seatKey === key) {
        continue
      }

      const rect = seatRects[seatKey]
      const targetLeft = rect.left - panelRect.left
      const targetTop = rect.top - panelRect.top
      const overlapWidth = Math.max(
        0,
        Math.min(left + width, targetLeft + rect.width) - Math.max(left, targetLeft)
      )
      const overlapHeight = Math.max(
        0,
        Math.min(top + height, targetTop + rect.height) - Math.max(top, targetTop)
      )
      const overlapArea = overlapWidth * overlapHeight
      const targetArea = rect.width * rect.height

      if (overlapArea >= targetArea / 2) {
        return seatKey
      }
    }

    return ''
  },

  swapSeats(sourceKey, targetKey) {
    const players = this.data.players.map((player) => ({ ...player }))
    const sourceIndex = players.findIndex((player) => player.key === sourceKey)
    const targetIndex = players.findIndex((player) => player.key === targetKey)

    if (sourceIndex === -1 || targetIndex === -1) {
      this.clearDragState()
      return
    }

    const sourceSeat = {
      key: players[sourceIndex].key,
      label: players[sourceIndex].label
    }
    const targetSeat = {
      key: players[targetIndex].key,
      label: players[targetIndex].label
    }

    players[sourceIndex].key = targetSeat.key
    players[sourceIndex].label = targetSeat.label
    players[targetIndex].key = sourceSeat.key
    players[targetIndex].label = sourceSeat.label

    this.dragState = null
    this.setData(
      {
        players,
        draggingKey: '',
        dragStyle: '',
        dragTargetKey: ''
      },
      () => {
        this.persistState({ players })
      }
    )
  },

  clearDragState(callback) {
    this.dragState = null
    this.setData(
      {
        draggingKey: '',
        dragStyle: '',
        dragTargetKey: ''
      },
      callback
    )
  },

  clearLongPressTimer() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = null
    }

    this.pendingLongPress = null
  },

  getMyScore(players = this.data.players) {
    return players.reduce((score, player) => {
      if (player.isMe) {
        return score
      }

      return score + player.score
    }, 0)
  },

  submitScores() {
    const currentRound = this.data.round
    const roundChanges = []
    const changes = []
    const invalidPlayer = this.data.players.find((player) => {
      const input = String(player.input || '').trim()
      return input !== '' && input !== '-' && !isValidScoreInput(input)
    })

    if (invalidPlayer) {
      wx.showToast({
        title: '请输入整数或负整数',
        icon: 'none'
      })
      return
    }

    const hasAnyInput = this.data.players.some((player) => {
      const input = String(player.input || '').trim()
      return input !== '' && input !== '-'
    })
    const me = this.data.players.find((player) => player.isMe)
    const myDelta = normalizeNumber(me && me.input)

    const players = this.data.players.map((player) => {
      if (player.isMe) {
        return {
          ...player,
          ...clearedScoreInput()
        }
      }

      const seatDelta = normalizeNumber(player.input)
      const roundDelta = myDelta - seatDelta
      const nextScore = player.score + roundDelta

      if (hasAnyInput) {
        const parts = buildSeatHistoryParts(
          player.name || player.direction,
          player.score,
          seatDelta,
          myDelta,
          nextScore
        )
        roundChanges.push({
          parts,
          text: parts.map((part) => part.text).join('')
        })
        changes.push({
          id: player.id,
          delta: roundDelta
        })
      }

      return {
        ...player,
        score: nextScore,
        scoreTone: numberTone(nextScore),
        ...clearedScoreInput()
      }
    })

    const totalScore = players.reduce((sum, player) => sum + player.score, 0)
    const myScore = this.getMyScore(players)
    const historyParts = [{ text: `第${currentRound}局：`, tone: '' }]
    const historyText = roundChanges.length
      ? `第${currentRound}局：${roundChanges.map((item) => item.text).join('  ')}`
      : `第${currentRound}局：本局无分数变化`

    if (roundChanges.length) {
      roundChanges.forEach((item, index) => {
        if (index > 0) {
          historyParts.push({ text: '  ', tone: '' })
        }

        historyParts.push(...item.parts)
      })
    } else {
      historyParts.push({ text: '本局无分数变化', tone: '' })
    }

    const history = [
      {
        id: `${currentRound}-${Date.now()}`,
        text: historyText,
        parts: historyParts,
        changes
      },
      ...this.data.history
    ]
    const round = currentRound + 1

    this.setData({
      players,
      history,
      round,
      totalScore,
      myScore,
      myScoreTone: numberTone(myScore)
    })
    this.persistState({ players, history, round, totalScore })
  },

  undoLastRound() {
    const latestHistory = this.data.history[0]

    if (!latestHistory) {
      return
    }

    if (!Array.isArray(latestHistory.changes)) {
      wx.showToast({
        title: '旧记录不支持撤回',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '撤回上一局',
      content: '确定撤回上一局记账吗？',
      confirmText: '撤回',
      confirmColor: '#d64545',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        const players = this.data.players.map((player) => {
          const change = latestHistory.changes.find((item) => item.id === player.id)

          if (!change) {
            return player
          }

          const score = player.score - change.delta

          return {
            ...player,
            score,
            scoreTone: numberTone(score),
            ...clearedScoreInput()
          }
        })
        const history = this.data.history.slice(1)
        const round = Math.max(1, this.data.round - 1)
        const totalScore = players.reduce((sum, player) => sum + player.score, 0)
        const myScore = this.getMyScore(players)

        this.setData({
          players,
          history,
          round,
          totalScore,
          myScore,
          myScoreTone: numberTone(myScore)
        })
        this.persistState({ players, history, round, totalScore })
      }
    })
  },

  resetScores() {
    wx.showModal({
      title: '重新开局',
      content: '确定要清空当前分数和历史记录，重新开始第1局吗？',
      confirmText: '重新开局',
      confirmColor: '#d64545',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        const players = cloneInitialPlayers()
        const nextState = {
          players,
          round: 1,
          history: [],
          totalScore: 0,
          myScore: 0,
          myScoreTone: ''
        }

        this.setData(nextState)
        wx.removeStorageSync(STORAGE_KEY)
      }
    })
  }
})
