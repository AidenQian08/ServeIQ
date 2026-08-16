import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Logo, Input, Btn } from '../components/UI'

export default function LoginPage() {
  const { login, loginAsGuest } = useAuth()
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        // FastAPI/Pydantic validation errors (422) come back as a list of
        // objects, e.g. [{ msg: "value is not a valid email address", ... }]
        setError(detail.map(d => d.msg || String(d)).join(', ') || 'Login failed')
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const continueAsGuest = async () => {
    setError('')
    setGuestLoading(true)
    try {
      await loginAsGuest()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Could not start a guest session')
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', position: 'relative', zIndex: 1,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <Logo size="lg" />
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
            Real-time tennis serve AI
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            error={error}
          />
          <Btn type="submit" disabled={loading} full>
            {loading ? 'Signing in…' : 'Sign In'}
          </Btn>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border, #333)' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border, #333)' }} />
        </div>

        <Btn type="button" onClick={continueAsGuest} disabled={guestLoading} full variant="ghost">
          {guestLoading ? 'Starting guest session…' : 'Continue as Guest'}
        </Btn>
        <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          Guest sessions are limited to 1 match and deleted when you log out
        </p>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--muted)' }}>
          No account?{' '}
          <Link to="/register" style={{ color: 'var(--green)', fontWeight: 600 }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}