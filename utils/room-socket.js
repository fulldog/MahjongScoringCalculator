const { wsBase } = require('./config.js')

function connect(room, token, handlers) {
  const task = wx.connectSocket({
    url: wsBase() + '/api/v1/ws?room=' + encodeURIComponent(room) + '&token=' + encodeURIComponent(token)
  })
  task.onMessage((event) => {
    let message = null
    try {
      message = JSON.parse(event.data)
    } catch (err) {
      return
    }
    if (!message || !handlers) {
      return
    }
    if (message.type === 'state' && handlers.onState) {
      handlers.onState(message.room)
    } else if (message.type === 'danmaku' && handlers.onDanmaku) {
      handlers.onDanmaku(message)
    } else if (message.type === 'error' && handlers.onError) {
      handlers.onError(message.message || '操作失败')
    }
  })
  task.onClose(() => {
    if (handlers && handlers.onClose) {
      handlers.onClose()
    }
  })
  return {
    send(payload) {
      task.send({ data: JSON.stringify(payload) })
    },
    close() {
      task.close({})
    }
  }
}

module.exports = { connect }
