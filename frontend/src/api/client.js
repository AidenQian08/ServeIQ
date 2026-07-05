import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    // Only auto-logout on 401 if we're NOT on the login/register pages
    if (err.response?.status === 401) {
      const path = window.location.pathname
      if (path !== '/login' && path !== '/register') {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api