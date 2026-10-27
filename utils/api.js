const { API_BASE } = require('./config.js')

function request({ url, method, data, token }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE + url,
      method: method || 'GET',
      data: data || {},
      header: token ? { Authorization: 'Bearer ' + token } : {},
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {})
          return
        }
        const message = res.data && res.data.message ? res.data.message : '请求失败'
        reject(new Error(message))
      },
      fail() {
        reject(new Error('网络不可用'))
      }
    })
  })
}

module.exports = { request }
