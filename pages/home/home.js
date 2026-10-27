Page({
  data: {
    statusPad: 24
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const statusBarHeight = Number(info.statusBarHeight) || 20

    this.setData({
      statusPad: statusBarHeight + 8
    })
  },

  openSolo() {
    wx.navigateTo({
      url: '/pages/index/index'
    })
  },

  openMulti() {
    wx.navigateTo({
      url: '/pages/multi/multi'
    })
  },

  openZuma() {
    wx.navigateTo({
      url: '/pages/zuma/zuma'
    })
  },

  openCutrope() {
    wx.navigateTo({
      url: '/pages/cutrope/cutrope'
    })
  },

  openKingdomrush() {
    wx.navigateTo({
      url: '/pages/kingdomrush/kingdomrush'
    })
  }
})
