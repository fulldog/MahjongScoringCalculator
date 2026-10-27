import axios from 'axios'

const http = axios.create({ baseURL: '/api/admin' })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin-token')
  if (token) {
    config.headers.Authorization = 'Bearer ' + token
  }
  return config
})

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response && error.response.data && error.response.data.message
    if (error.response && error.response.status === 401 && !String(error.config.url).endsWith('/login')) {
      localStorage.removeItem('admin-token')
      location.hash = '#/login'
    }
    return Promise.reject(new Error(message || '请求失败'))
  }
)

export default http
