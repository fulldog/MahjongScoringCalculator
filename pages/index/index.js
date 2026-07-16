const STORAGE_KEY = 'mahjong-scoring-state-v2'

const initialPlayers = [
  { key: 'north', direction: '北', label: '上北', score: 0, input: '', avatar: '', isMe: false },
  { key: 'west', direction: '西', label: '左西', score: 0, input: '', avatar: '', isMe: false },
  { key: 'east', direction: '东', label: '右东', score: 0, input: '', avatar: '', isMe: false },
  { key: 'south', direction: '南', label: '下南', score: 0, input: '', avatar: '', isMe: true }
]

function cloneInitialPlayers() {
  return initialPlayers.map((player) => ({ ...player }))
}

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return 0
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

Page({
  data: {
    players: cloneInitialPlayers(),
    round: 1,
    history: [],
    totalScore: 0,
    myScore: 0
  },

  onLoad() {
    this.restoreState()
  },

  restoreState() {
    const savedState = wx.getStorageSync(STORAGE_KEY)

    if (!savedState) {
      return
    }

    const players = savedState.players || cloneInitialPlayers()

    this.setData({
      players,
      round: savedState.round || 1,
      history: savedState.history || [],
      totalScore: savedState.totalScore || 0,
      myScore: this.getMyScore(players)
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
    const value = event.detail.value
    const players = this.data.players.map((player) => {
      if (player.key !== key) {
        return player
      }

      return {
        ...player,
        input: value
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

  getMyScore(players = this.data.players) {
    return players.reduce((score, player) => {
      if (player.isMe) {
        return score + player.score
      }

      return score + player.score
    }, 0)
  },

  submitScores() {
    const currentRound = this.data.round
    const roundChanges = []

    const players = this.data.players.map((player) => {
      const delta = normalizeNumber(player.input)

      if (delta === 0) {
        return {
          ...player,
          input: ''
        }
      }

      roundChanges.push(`${player.direction}${delta > 0 ? '+' : ''}${delta}`)

      return {
        ...player,
        score: player.score + delta,
        input: ''
      }
    })

    const totalScore = players.reduce((sum, player) => sum + player.score, 0)
    const myScore = this.getMyScore(players)
    const historyText = roundChanges.length
      ? `第${currentRound}局：${roundChanges.join('  ')}`
      : `第${currentRound}局：本局无分数变化`
    const history = [
      {
        id: `${currentRound}-${Date.now()}`,
        text: historyText
      },
      ...this.data.history
    ]
    const round = currentRound + 1

    this.setData({
      players,
      history,
      round,
      totalScore,
      myScore
    })
    this.persistState({ players, history, round, totalScore })
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
          myScore: 0
        }

        this.setData(nextState)
        wx.removeStorageSync(STORAGE_KEY)
      }
    })
  }
})
