const { request } = require('./api.js')
const auth = require('./auth.js')

function report(record) {
  const send = (token) => request({
    url: '/api/v1/minigames',
    method: 'POST',
    token,
    data: {
      game: record.game,
      result: record.result,
      score: Number(record.score) || 0,
      levelNo: Number(record.levelNo) || 0,
      stars: Number(record.stars) || 0
    }
  }).catch(() => {})

  const user = auth.userToken()
  if (user) {
    return send(user)
  }
  return auth.ensureGuest().then(send).catch(() => {})
}

module.exports = { report }
