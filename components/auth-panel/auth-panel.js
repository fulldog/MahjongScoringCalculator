const auth = require('../../utils/auth.js')

Component({
  data: {
    nickname: '',
    avatarUrl: '',
    busy: false
  },

  methods: {
    onChooseAvatar(event) {
      this.setData({ avatarUrl: event.detail.avatarUrl || '' })
    },

    onName(event) {
      this.setData({ nickname: event.detail.value || '' })
    },

    submit() {
      if (this.data.busy) {
        return
      }
      const nickname = (this.data.nickname || '').trim()
      if (!nickname) {
        wx.showToast({ title: '请填写昵称', icon: 'none' })
        return
      }
      this.setData({ busy: true })
      auth.loginWithWeChat({
        nickname,
        avatarUrl: this.data.avatarUrl
      }).then((user) => {
        this.setData({ busy: false })
        this.triggerEvent('success', { user })
      }).catch((err) => {
        this.setData({ busy: false })
        wx.showToast({ title: err.message || '登录失败', icon: 'none' })
      })
    }
  }
})
