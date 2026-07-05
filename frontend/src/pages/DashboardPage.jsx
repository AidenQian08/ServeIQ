import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  Logo, Btn, Card, Section, Modal, Input, ToggleGroup,
  Empty, Spinner, showToast, ToastProvider
} from '../components/UI'

const SURFACES = [
  { value: 'Hard', label: 'Hard' },
  { value: 'Clay', label: 'Clay' },
  { value: 'Grass', label: 'Grass' },
  { value: 'Indoor', label: 'Indoor' },
]

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)

  useEffect(() => { fetchSessions() }, [])

  const fetchSessions = async () => {
    try {
      const r = await api.get('/sessions')
      setSessions(r.data)
    } catch (e) {
      showToast('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  const deleteSession = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this match session?')) return
    try {
      await api.delete(`/sessions/${id}`)
      setSessions(s => s.filter(x => x.id !== id))
      showToast('Session deleted')
    } catch {
      showToast('Failed to delete')
    }
  }

  return (
    <ToastProvider>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto', minHeight: '100vh', paddingBottom: 80 }}>

        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid var(--border)'
        }}>
          <Logo />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Hi, {user?.name?.split(' ')[0]}</span>
            <button onClick={logout} style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, padding: '5px 10px', color: 'var(--muted)',
              fontSize: 12, cursor: 'pointer'
            }}>Logout</button>
          </div>
        </header>

        {/* Greeting + CTA */}
        <Section style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: 1, marginBottom: 4 }}>
                Match Sessions
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded
              </div>
            </div>
            <Btn onClick={() => setShowNew(true)}>+ New Match</Btn>
          </div>
        </Section>

        {/* Session list */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
          ) : sessions.length === 0 ? (
            <Empty icon="🎾" title="No sessions yet" sub="Start a new match to begin tracking your serves" />
          ) : (
            sessions.map(s => <SessionCard key={s.id} session={s} onOpen={() => navigate(`/session/${s.id}`)} onDelete={deleteSession} />)
          )}
        </div>

        {/* New session modal */}
        <NewSessionModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreate={(s) => {
            setSessions(prev => [s, ...prev])
            setShowNew(false)
            navigate(`/session/${s.id}`)
          }}
        />
      </div>
    </ToastProvider>
  )
}

function SessionCard({ session, onOpen, onDelete }) {
  const date = new Date(session.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
  return (
    <Card style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{session.label}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {session.opponent && `vs. ${session.opponent} · `}{date}
          </div>
        </div>
        <button
          onClick={(e) => onDelete(session.id, e)}
          style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            fontSize: 16, cursor: 'pointer', padding: '0 4px',
            lineHeight: 1,
          }}
        >✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          background: 'rgba(0,230,118,0.1)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '3px 8px',
          fontSize: 11, color: 'var(--green)', fontWeight: 600
        }}>
          {session.point_count} pts
        </div>
        {session.surface && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--muted)'
          }}>
            {session.surface}
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--green)' }}>Open →</div>
      </div>
    </Card>
  )
}

function NewSessionModal({ open, onClose, onCreate }) {
  const [label, setLabel]       = useState('')
  const [opponent, setOpponent] = useState('')
  const [surface, setSurface]   = useState('Hard')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    if (!label.trim()) { setError('Give this session a name'); return }
    setLoading(true)
    try {
      const r = await api.post('/sessions', {
        label: label.trim(),
        opponent: opponent.trim() || null,
        surface,
      })
      onCreate(r.data)
      setLabel(''); setOpponent(''); setSurface('Hard'); setError('')
    } catch {
      setError('Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Match">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          label="Session Name"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Tuesday practice"
          error={error}
        />
        <Input
          label="Opponent (optional)"
          value={opponent}
          onChange={e => setOpponent(e.target.value)}
          placeholder="e.g. John"
        />
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 8 }}>
            Surface
          </div>
          <ToggleGroup options={SURFACES} value={surface} onChange={setSurface} />
        </div>
        <Btn onClick={submit} disabled={loading} full>
          {loading ? 'Creating...' : 'Start Match'}
        </Btn>
      </div>
    </Modal>
  )
}
