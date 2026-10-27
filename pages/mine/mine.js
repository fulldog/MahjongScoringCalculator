const auth = require('../../utils/auth.js')

Page({
  data: {
    loggedIn: false,
    user: null
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const user = auth.profile()
    if (user) {
      user.initial = Array.from(user.nickname || '我')[0]
    }
    this.setData({
      loggedIn: auth.isLoggedIn(),
      user
    })
  },

  onLogin() {
    this.refresh()
  },

  logout() {
    auth.logout()
    this.refresh()
  }
})
