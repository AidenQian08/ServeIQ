import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,   // send/receive the httponly session cookie
})

api.interceptors.response.use(
  r => r,
  err => {
    // Only auto-redirect on 401 if we're NOT on the login/register pages
    if (err.response?.status === 401) {
      const path = window.location.pathname
      if (path !== '/login' && path !== '/register') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
