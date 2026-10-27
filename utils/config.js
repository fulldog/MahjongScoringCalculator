// 开发者工具指向本机。真机调试改成电脑局域网地址，并配置微信 request / socket 合法域名。
const API_BASE = 'http://127.0.0.1:8080'

function wsBase() {
  if (API_BASE.indexOf('https://') === 0) {
    return 'wss://' + API_BASE.slice('https://'.length)
  }
  if (API_BASE.indexOf('http://') === 0) {
    return 'ws://' + API_BASE.slice('http://'.length)
  }
  return API_BASE
}

module.exports = {
  API_BASE,
  wsBase
}
