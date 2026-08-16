import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', r.data.access_token)
    setUser({ id: r.data.user_id, name: r.data.name, email, is_guest: r.data.is_guest })
    return r.data
  }

  const register = async (email, name, password) => {
    const r = await api.post('/auth/register', { email, name, password })
    localStorage.setItem('token', r.data.access_token)
    setUser({ id: r.data.user_id, name: r.data.name, email, is_guest: r.data.is_guest })
    return r.data
  }

  const loginAsGuest = async () => {
    const r = await api.post('/auth/guest')
    localStorage.setItem('token', r.data.access_token)
    setUser({ id: r.data.user_id, name: r.data.name, is_guest: true })
    return r.data
  }

  const logout = async () => {
    // Best-effort — if this fails (e.g. token already expired), still clear
    // local state so the user isn't stuck. For guest accounts this call is
    // what actually deletes their match/point data server-side.
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore — token may already be invalid, nothing more to do server-side
    }
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)