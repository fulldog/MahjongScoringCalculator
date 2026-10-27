const { request } = require('./api.js')

const USER_TOKEN = 'mj-user-token'
const USER_PROFILE = 'mj-user-profile'
const GUEST_KEY = 'mj-guest-key'
const GUEST_TOKEN = 'mj-guest-token'

function read(key) {
  try {
    return wx.getStorageSync(key) || ''
  } catch (err) {
    return ''
  }
}

function write(key, value) {
  wx.setStorageSync(key, value)
}

function guestKey() {
  let key = read(GUEST_KEY)
  if (key) {
    return key
  }
  key = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  write(GUEST_KEY, key)
  return key
}

function profile() {
  const raw = read(USER_PROFILE)
  return raw && typeof raw === 'object' ? raw : null
}

function isLoggedIn() {
  return !!read(USER_TOKEN)
}

function userToken() {
  return read(USER_TOKEN)
}

function playerToken() {
  return read(USER_TOKEN) || read(GUEST_TOKEN)
}

function logout() {
  wx.removeStorageSync(USER_TOKEN)
  wx.removeStorageSync(USER_PROFILE)
}

function loginWithWeChat({ nickname, avatarUrl }) {
  const key = guestKey()
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        request({
          url: '/api/v1/auth/wechat',
          method: 'POST',
          data: {
            code: res.code || '',
            devOpenid: key,
            nickname: nickname || '',
            avatarUrl: avatarUrl || '',
            guestKey: key
          }
        }).then((body) => {
          write(USER_TOKEN, body.token)
          write(USER_PROFILE, body.user)
          resolve(body.user)
        }).catch(reject)
      },
      fail() {
        reject(new Error('微信登录失败'))
      }
    })
  })
}

function ensureGuest() {
  if (read(GUEST_TOKEN)) {
    return Promise.resolve(read(GUEST_TOKEN))
  }
  return request({
    url: '/api/v1/auth/guest',
    method: 'POST',
    data: { guestKey: guestKey() }
  }).then((body) => {
    write(GUEST_TOKEN, body.token)
    return body.token
  })
}

module.exports = {
  guestKey,
  profile,
  isLoggedIn,
  userToken,
  playerToken,
  logout,
  loginWithWeChat,
  ensureGuest
}
