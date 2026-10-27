const auth = require('../../utils/auth.js')
const { request } = require('../../utils/api.js')

function paint(id, draw) {
  wx.createSelectorQuery()
    .select('#' + id)
    .fields({ node: true, size: true })
    .exec((res) => {
      const found = res && res[0]
      if (!found || !found.node) {
        return
      }
      const canvas = found.node
      const ctx = canvas.getContext('2d')
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2) || 2
      canvas.width = found.width * dpr
      canvas.height = found.height * dpr
      ctx.scale(dpr, dpr)
      draw(ctx, found.width, found.height)
    })
}

function ring(ctx, width, height, rate) {
  const cx = width / 2
  const cy = height / 2 + 6
  const radius = Math.min(width, height) * 0.32
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 14
  ctx.strokeStyle = 'rgba(231,197,129,0.18)'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#e25b4b'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (rate / 100))
  ctx.stroke()
  ctx.fillStyle = '#efd7a4'
  ctx.font = '600 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(Math.round(rate) + '%', cx, cy - 8)
  ctx.fillStyle = 'rgba(232,211,171,0.6)'
  ctx.font = '12px sans-serif'
  ctx.fillText('胜率', cx, cy + 16)
}

function bars(ctx, width, height, rows, color) {
  ctx.clearRect(0, 0, width, height)
  const data = rows.length ? rows : [{ label: '暂无', value: 0 }]
  const max = Math.max(1, ...data.map((item) => item.value))
  const gap = 12
  const barWidth = Math.max(12, (width - gap * (data.length + 1)) / data.length)
  data.forEach((item, index) => {
    const h = (height - 36) * (item.value / max)
    const x = gap + index * (barWidth + gap)
    const y = height - 22 - h
    ctx.fillStyle = color
    ctx.fillRect(x, y, barWidth, Math.max(h, item.value ? 4 : 0))
    ctx.fillStyle = 'rgba(232,211,171,0.7)'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(item.label, x + barWidth / 2, height - 8)
  })
}

Page({
  data: {
    loggedIn: false,
    stats: null,
    resultText: { win: '胜', loss: '负', draw: '平' }
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      this.setData({ loggedIn: false, stats: null })
      return
    }
    this.setData({ loggedIn: true })
    this.load()
  },

  onLogin() {
    this.setData({ loggedIn: true })
    this.load()
  },

  load() {
    request({
      url: '/api/v1/me/stats',
      token: auth.userToken()
    }).then((stats) => {
      stats.matches = (stats.matches || []).map((item) => ({
        ...item,
        endedAt: String(item.endedAt || '').replace('T', ' ').slice(0, 16)
      }))
      this.setData({ stats }, () => this.draw(stats))
    }).catch((err) => {
      wx.showToast({ title: err.message || '统计失败', icon: 'none' })
    })
  },

  draw(stats) {
    paint('winRing', (ctx, width, height) => ring(ctx, width, height, stats.winRate || 0))
    paint('weekBars', (ctx, width, height) => {
      bars(ctx, width, height, (stats.weeks || []).map((item) => ({
        label: item.label,
        value: item.count
      })), '#e7c581')
    })
    paint('oppBars', (ctx, width, height) => {
      bars(ctx, width, height, (stats.opponents || []).map((item) => ({
        label: item.nickname || '牌友',
        value: item.count
      })), '#3dae6a')
    })
  }
})
