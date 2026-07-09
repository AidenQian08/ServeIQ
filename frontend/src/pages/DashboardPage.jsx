import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  Logo, Btn, Card, Section, Modal, Input, ToggleGroup,
  Empty, Spinner, showToast, ToastProvider, Tag
} from '../components/UI'

const SURFACES = [
  { value: 'Hard', label: 'Hard' },
  { value: 'Clay', label: 'Clay' },
  { value: 'Grass', label: 'Grass' },
  { value: 'Indoor', label: 'Indoor' },
]

const FORMATS = [
  { value: 'bo3', label: 'Best of 3' },
  { value: 'bo5', label: 'Best of 5' },
]

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { fetchMatches() }, [])

  const fetchMatches = async () => {
    try {
      const r = await api.get('/matches')
      setMatches(r.data)
    } catch (e) {
      showToast('Failed to load matches')
    } finally {
      setLoading(false)
    }
  }

  const deleteMatch = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this match? This removes every point logged for it.')) return
    try {
      await api.delete(`/matches/${id}`)
      setMatches(m => m.filter(x => x.id !== id))
      showToast('Match deleted')
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
                Matches
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {matches.length} match{matches.length !== 1 ? 'es' : ''} recorded
              </div>
            </div>
            <Btn onClick={() => setShowNew(true)}>+ New Match</Btn>
          </div>
        </Section>

        {/* Match list */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
          ) : matches.length === 0 ? (
            <Empty icon="🎾" title="No matches yet" sub="Start a new match to begin tracking points" />
          ) : (
            matches.map(m => (
              <MatchCard 
                key={m.id}
                match={m}
                onOpen={() => {
                  console.log("Opening match", m.id)
                  navigate(`/match/${m.id}`)
                }}
                onDelete={deleteMatch} 
              />
            ))
          )}
        </div>

        {/* New match modal */}
        <NewMatchModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreate={(m) => {
            setMatches(prev => [m, ...prev])
            setShowNew(false)
            navigate(`/match/${m.id}`)
          }}
        />
      </div>
    </ToastProvider>
  )
}

function MatchCard({ match, onOpen, onDelete }) {
  const date = new Date(match.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
  const p1Won = match.winner === 'player1'
  const p2Won = match.winner === 'player2'

  return (
    <Card style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{match.label}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{date}</div>
        </div>
        <button
          onClick={(e) => onDelete(match.id, e)}
          style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* Players + score */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '8px 12px', marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: p1Won ? 700 : 500, color: p1Won ? 'var(--green)' : 'var(--text)' }}>
          {match.player1_name}{p1Won && ' 🏆'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {match.sets_score_display}
        </div>
        <div style={{ fontSize: 13, fontWeight: p2Won ? 700 : 500, color: p2Won ? 'var(--green)' : 'var(--text)' }}>
          {match.player2_name}{p2Won && ' 🏆'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Tag color={match.is_complete ? 'var(--muted)' : 'var(--green)'} bg={match.is_complete ? 'var(--surface)' : 'rgba(0,230,118,0.1)'}>
          {match.is_complete ? 'Complete' : 'In Progress'}
        </Tag>
        <Tag>{match.format === 'bo5' ? 'Best of 5' : 'Best of 3'}</Tag>
        {match.surface && <Tag>{match.surface}</Tag>}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--green)' }}>Open →</div>
      </div>
    </Card>
  )
}

function NewMatchModal({ open, onClose, onCreate }) {
  const [label, setLabel] = useState('')
  const [p1, setP1] = useState('Me')
  const [p2, setP2] = useState('Opponent')
  const [surface, setSurface] = useState('Hard')
  const [format, setFormat] = useState('bo3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!label.trim()) { setError('Give this match a name'); return }
    if (!p1.trim() || !p2.trim()) { setError('Both player names are required'); return }
    setLoading(true)
    try {
      const r = await api.post('/matches', {
        label: label.trim(),
        surface,
        player1_name: p1.trim(),
        player2_name: p2.trim(),
        format,
      })
      onCreate(r.data)
      setLabel(''); setP1('Me'); setP2('Opponent'); setSurface('Hard'); setFormat('bo3'); setError('')
    } catch {
      setError('Failed to create match')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Match">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          label="Match Name"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Tuesday practice"
          error={error}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Input label="Player 1" value={p1} onChange={e => setP1(e.target.value)} placeholder="Me" />
          <Input label="Player 2" value={p2} onChange={e => setP2(e.target.value)} placeholder="Opponent" />
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 8 }}>
            Format
          </div>
          <ToggleGroup options={FORMATS} value={format} onChange={setFormat} />
        </div>
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
