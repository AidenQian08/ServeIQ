import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import {
  Logo, Card, Btn, ToggleGroup, StatBox, Section,
  Empty, Spinner, showToast, ToastProvider
} from '../components/UI'

const LOCS = ['Wide', 'Body', 'T']

// ── Flow steps ────────────────────────────────────────────────────────────
const STEP = {
  IDLE:   'idle',
  S1_IN:  's1_in',
  S1_RES: 's1_res',
  S2_LOC: 's2_loc',
  S2_IN:  's2_in',
  S2_RES: 's2_res',
}

export default function SessionPage() {
  const { id: sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession]   = useState(null)
  const [stats, setStats]       = useState(null)
  const [points, setPoints]     = useState([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [savingPt, setSavingPt] = useState(false)

  // Current point state
  const [side, setSide]         = useState('deuce')
  const [step, setStep]         = useState(STEP.IDLE)
  const [s1loc, setS1loc]       = useState(null)
  const [s1in, setS1in]         = useState(null)
  const [s2loc, setS2loc]       = useState(null)

  useEffect(() => { init() }, [sessionId])

  const init = async () => {
    try {
      const [sRes, pRes, stRes] = await Promise.all([
        api.get(`/sessions/${sessionId}`),
        api.get(`/points/session/${sessionId}`),
        api.get(`/points/session/${sessionId}/stats`),
      ])
      setSession(sRes.data)
      setPoints(pRes.data)
      setStats(stRes.data)
    } catch {
      showToast('Failed to load session')
    } finally {
      setLoadingInit(false)
    }
  }

  const refreshStats = async () => {
    try {
      const r = await api.get(`/points/session/${sessionId}/stats`)
      setStats(r.data)
    } catch {}
  }

  // ── Point flow ────────────────────────────────────────────────────────
  const selectLoc = (loc) => {
    if (step !== STEP.IDLE) return
    setS1loc(loc)
    setStep(STEP.S1_IN)
  }

  const firstServeIn = async (isIn) => {
    setS1in(isIn)
    if (isIn) {
      setStep(STEP.S1_RES)
    } else {
      setStep(STEP.S2_LOC)
    }
  }

  const select2Loc = (loc) => {
    setS2loc(loc)
    setStep(STEP.S2_IN)
  }

  const secondServeIn = async (isIn) => {
    if (!isIn) {
      // Double fault
      await commitPoint({ s2loc, s2in: false, result: 'loss', serve_num: 2, is_df: true })
      showToast('Double fault')
    } else {
      setStep(STEP.S2_RES)
    }
  }

  const pointResult = async (serveNum, result) => {
    await commitPoint({
      s2loc: serveNum === 2 ? s2loc : null,
      s2in: serveNum === 2 ? true : null,
      result,
      serve_num: serveNum,
      is_df: false,
    })
    showToast(result === 'win' ? '✓ Point won' : '✗ Point lost')
  }

  const commitPoint = async (extra) => {
    setSavingPt(true)
    try {
      const body = {
        session_id: sessionId,
        side,
        s1_loc: s1loc,
        s1_in: s1in ?? false,
        s2_loc: extra.s2loc ?? null,
        s2_in: extra.s2in ?? null,
        result: extra.result,
        serve_num: extra.serve_num,
        is_df: extra.is_df,
      }
      const r = await api.post('/points', body)
      setPoints(prev => [r.data, ...prev])
      await refreshStats()
    } catch {
      showToast('Failed to save point')
    } finally {
      setSavingPt(false)
      resetPoint()
    }
  }

  const resetPoint = () => {
    setStep(STEP.IDLE)
    setS1loc(null); setS1in(null); setS2loc(null)
  }

  const undoLast = async () => {
    if (step !== STEP.IDLE) { resetPoint(); showToast('Point cancelled'); return }
    if (!points.length) { showToast('Nothing to undo'); return }
    try {
      await api.delete(`/points/${points[0].id}`)
      setPoints(prev => prev.slice(1))
      await refreshStats()
      showToast('Last point undone')
    } catch {
      showToast('Failed to undo')
    }
  }

  if (loadingInit) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <Spinner size={32} />
    </div>
  )

  const sideStats = stats?.[side] ?? null
  const rec = sideStats ? {
    best: sideStats.recommendation,
    conf: sideStats.confidence,
    streak: sideStats.streak,
    firstServe: sideStats.first_serve,
  } : null

  return (
    <ToastProvider>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 440, margin: '0 auto', minHeight: '100vh', paddingBottom: 90 }}>

        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', borderBottom: '1px solid var(--border)'
        }}>
          <button onClick={() => navigate('/')} style={{
            background: 'none', border: 'none', color: 'var(--muted)',
            fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0
          }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 1 }}>
              {session?.label}
            </div>
            {session?.opponent && (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>vs. {session.opponent}</div>
            )}
          </div>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '4px 12px',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)'
          }}>
            <strong style={{ color: 'var(--text)' }}>{points.length}</strong> pts
          </div>
        </header>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <StatBox label="1st In%" value={stats?.first_in_pct != null ? `${stats.first_in_pct}%` : '—'} />
          <StatBox label="2nd In%" value={stats?.second_in_pct != null ? `${stats.second_in_pct}%` : '—'} />
          <StatBox label="Pts Won" value={stats?.win_pct != null ? `${stats.win_pct}%` : '—'} highlight />
          <StatBox label="On 2nd"  value={stats?.second_serve_win_pct != null ? `${stats.second_serve_win_pct}%` : '—'} />
        </div>

        {/* Side selector */}
        <Section title="Court Side">
          <ToggleGroup
            options={[{ value: 'deuce', label: '← Deuce' }, { value: 'ad', label: 'Ad →' }]}
            value={side}
            onChange={v => { setSide(v); resetPoint() }}
          />
        </Section>

        {/* Location buttons */}
        <Section title={step === STEP.IDLE ? '1st Serve — Pick Location' : '1st Serve Selected'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {LOCS.map(loc => (
              <LocButton
                key={loc}
                loc={loc}
                selected={s1loc === loc}
                isRec={rec?.best === loc && rec?.conf !== 'Learning' && step === STEP.IDLE}
                isStreak={rec?.streak?.loc === loc && rec?.streak?.count >= 2 && step === STEP.IDLE}
                streakCount={rec?.streak?.count}
                stat={rec?.firstServe?.find(s => s.loc === loc)}
                onClick={() => selectLoc(loc)}
                disabled={step !== STEP.IDLE}
              />
            ))}
          </div>
        </Section>

        {/* Point flow card */}
        <div style={{ padding: '0 20px 14px' }}>
          <FlowCard
            step={step}
            s1loc={s1loc}
            s2loc={s2loc}
            saving={savingPt}
            onFirstServeIn={firstServeIn}
            onPointResult={pointResult}
            onSelect2Loc={select2Loc}
            onSecondServeIn={secondServeIn}
          />
        </div>

        {/* AI Recommendation */}
        <div style={{ padding: '0 20px 14px' }}>
          <AICard rec={rec} side={side} />
        </div>

        {/* Point log */}
        <Section title="Point Log">
          <PointLog points={points} />
        </Section>

        {/* Bottom bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 440, padding: '10px 20px',
          background: 'rgba(8,12,8,0.96)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)', display: 'flex', gap: 8, zIndex: 10
        }}>
          <button
            onClick={undoLast}
            style={{
              flex: 1.3, background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 11, padding: 11, color: 'var(--muted)',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
            ↩ Undo
          </button>
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1, background: 'var(--card)', border: '1px solid rgba(255,82,82,0.18)',
              borderRadius: 11, padding: 11, color: 'rgba(255,82,82,0.5)',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
            End Match
          </button>
        </div>
      </div>
    </ToastProvider>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function LocButton({ loc, selected, isRec, isStreak, streakCount, stat, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      style={{
        background: selected ? 'rgba(0,230,118,0.08)' : isRec ? 'rgba(255,215,64,0.05)' : 'var(--card)',
        border: `1.5px solid ${selected ? 'var(--green)' : isRec ? 'var(--yellow)' : isStreak ? 'rgba(255,82,82,0.35)' : 'var(--border)'}`,
        borderRadius: 12, padding: '13px 6px 10px',
        cursor: disabled && !selected ? 'default' : 'pointer',
        opacity: disabled && !selected ? 0.5 : 1,
        textAlign: 'center', position: 'relative', overflow: 'hidden',
        transition: 'all 0.14s',
      }}
    >
      {/* Bottom accent bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: selected ? 'var(--green)' : isRec ? 'var(--yellow)' : 'transparent',
      }} />

      {/* Badges */}
      {isRec && !isStreak && (
        <span style={{
          position: 'absolute', top: 5, right: 5, fontSize: 8, fontWeight: 700,
          padding: '2px 4px', borderRadius: 4, background: 'var(--yellow)', color: '#111'
        }}>AI ★</span>
      )}
      {isStreak && (
        <span style={{
          position: 'absolute', top: 5, right: 5, fontSize: 8, fontWeight: 700,
          padding: '2px 4px', borderRadius: 4,
          background: 'rgba(255,82,82,0.18)', color: 'var(--red)',
          border: '1px solid rgba(255,82,82,0.3)'
        }}>×{streakCount}</span>
      )}

      <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: 1, color: 'var(--text)', display: 'block' }}>
        {loc}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
        {stat?.win_att > 0 ? `${stat.wins}W/${stat.win_att} (${Math.round(stat.win_pct)}%)` : 'No data'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 1 }}>
        {stat?.in_att > 0 ? `In: ${stat.in_made}/${stat.in_att} (${Math.round(stat.in_pct)}%)` : 'In: —'}
      </span>
    </button>
  )
}

function FlowCard({ step, s1loc, s2loc, saving, onFirstServeIn, onPointResult, onSelect2Loc, onSecondServeIn }) {
  const cardStyle = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 14, overflow: 'hidden', position: 'relative',
  }
  const accentBar = (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--green), transparent)' }} />
  )
  const inner = { padding: '14px 16px' }
  const lbl = (txt) => (
    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: 'var(--green)', marginBottom: 9, fontWeight: 700 }}>{txt}</div>
  )
  const q = (txt) => (
    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: txt }} />
  )
  const row = { display: 'flex', gap: 7 }

  const flowBtn = (label, sub, onClick, variant) => {
    const colors = {
      in:   { bg: 'linear-gradient(135deg,#00e676,#00c853)', color: '#041408' },
      out:  { bg: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--muted)' },
      win:  { bg: 'linear-gradient(135deg,#00e676,#00c853)', color: '#041408' },
      loss: { bg: 'linear-gradient(135deg,#ff5252,#c62828)', color: '#fff' },
      neu:  { bg: 'var(--surface)', border: '1.5px solid var(--border)', color: 'var(--text)' },
    }
    const c = colors[variant]
    return (
      <button
        onClick={onClick}
        disabled={saving}
        style={{
          flex: 1, padding: '12px 8px', borderRadius: 11, border: c.border || 'none',
          fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: 1,
          background: c.bg, color: c.color,
          cursor: saving ? 'wait' : 'pointer', transition: 'all 0.12s',
        }}
      >
        {label}
        {sub && <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 9, opacity: 0.6, marginTop: 2 }}>{sub}</span>}
      </button>
    )
  }

  if (step === STEP.IDLE) return (
    <div style={cardStyle}>
      {accentBar}
      <div style={inner}>
        {lbl('Waiting')}
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Select a serve location above to start the point</div>
      </div>
    </div>
  )

  if (step === STEP.S1_IN) return (
    <div style={cardStyle}>
      {accentBar}
      <div style={inner}>
        {lbl(`1st Serve · ${s1loc}`)}
        {q('Did the 1st serve go <em style="color:var(--yellow);font-style:normal">IN</em>?')}
        <div style={row}>
          {flowBtn('IN', 'Play the point', () => onFirstServeIn(true), 'in')}
          {flowBtn('FAULT', 'Go to 2nd serve', () => onFirstServeIn(false), 'out')}
        </div>
      </div>
    </div>
  )

  if (step === STEP.S1_RES) return (
    <div style={cardStyle}>
      {accentBar}
      <div style={inner}>
        {lbl('1st Serve In · Result')}
        {q('Did you <em style="color:var(--yellow);font-style:normal">WIN</em> the point?')}
        <div style={row}>
          {flowBtn('WIN', null, () => onPointResult(1, 'win'), 'win')}
          {flowBtn('LOSS', null, () => onPointResult(1, 'loss'), 'loss')}
        </div>
      </div>
    </div>
  )

  if (step === STEP.S2_LOC) return (
    <div style={cardStyle}>
      {accentBar}
      <div style={inner}>
        {lbl('2nd Serve · Pick Location')}
        {q('Where for <em style="color:var(--yellow);font-style:normal">2nd serve</em>?')}
        <div style={row}>
          {['Wide','Body','T'].map(l => flowBtn(l, null, () => onSelect2Loc(l), 'neu'))}
        </div>
      </div>
    </div>
  )

  if (step === STEP.S2_IN) return (
    <div style={cardStyle}>
      {accentBar}
      <div style={inner}>
        {lbl(`2nd Serve · ${s2loc}`)}
        {q('Did the 2nd serve go <em style="color:var(--yellow);font-style:normal">IN</em>?')}
        <div style={row}>
          {flowBtn('IN', 'Play the point', () => onSecondServeIn(true), 'in')}
          {flowBtn('DOUBLE FAULT', 'Point lost', () => onSecondServeIn(false), 'out')}
        </div>
      </div>
    </div>
  )

  if (step === STEP.S2_RES) return (
    <div style={cardStyle}>
      {accentBar}
      <div style={inner}>
        {lbl('2nd Serve In · Result')}
        {q('Did you <em style="color:var(--yellow);font-style:normal">WIN</em> the point?')}
        <div style={row}>
          {flowBtn('WIN', null, () => onPointResult(2, 'win'), 'win')}
          {flowBtn('LOSS', null, () => onPointResult(2, 'loss'), 'loss')}
        </div>
      </div>
    </div>
  )

  return null
}

function AICard({ rec, side }) {
  if (!rec || !rec.firstServe) return (
    <Card accent style={{ padding: 14 }}>
      <AIDot /> 
      <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: 13 }}>
        Log a few points to activate AI
      </div>
    </Card>
  )

  const { best, conf, streak, firstServe } = rec
  const totalData = firstServe.reduce((s, l) => s + l.in_att, 0)

  if (totalData < 3) return (
    <Card accent style={{ padding: 14 }}>
      <AIDot />
      <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: 13 }}>
        Log {3 - totalData} more point{3 - totalData !== 1 ? 's' : ''} to activate AI
      </div>
    </Card>
  )

  const confColor = conf === 'High' ? 'var(--green)' : conf === 'Medium' ? 'var(--yellow)' : 'var(--muted)'
  const maxEff = Math.max(...firstServe.map(s => s.eff_pct ?? 0), 0.001)
  const sorted = [...firstServe].sort((a, b) => (b.eff_pct ?? 0) - (a.eff_pct ?? 0))

  return (
    <Card accent style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <AIDot />
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--green)', fontWeight: 700 }}>
          AI · 1st Serve
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {side === 'deuce' ? 'Deuce' : 'Ad'}
        </span>
      </div>

      {/* Streak warning */}
      {streak?.loc && streak.count >= 2 && streak.penalty > 0.1 && (
        <div style={{
          background: 'rgba(255,82,82,0.07)', border: '1px solid rgba(255,82,82,0.2)',
          borderRadius: 8, padding: '8px 10px', marginBottom: 10,
          fontSize: 11, color: 'rgba(255,130,130,0.9)', lineHeight: 1.5
        }}>
          ⚠ <strong>{streak.loc}</strong> hit {streak.count}x in a row — AI applying{' '}
          {Math.round(streak.penalty * 100)}% predictability penalty
        </div>
      )}

      {/* Main recommendation */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: 2, lineHeight: 1,
          color: streak?.loc === best && streak?.penalty > 0.35 ? 'var(--yellow)' : 'var(--text)'
        }}>
          {best}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Confidence</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500, color: confColor }}>{conf}</div>
        </div>
      </div>

      {/* Bars */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 34px 40px 36px', gap: 5, marginBottom: 4 }}>
          {['','','Win%','In%','Eff%'].map((h, i) => (
            <span key={i} style={{ fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {sorted.map(ls => {
          const isRec = ls.loc === best
          const isSk  = ls.loc === streak?.loc && streak?.count >= 2
          const bw    = ls.eff_pct != null ? Math.round(100 * ls.eff_pct / maxEff) : 0
          const barColor = isRec ? 'var(--green)' : isSk ? 'rgba(255,82,82,0.45)' : 'rgba(255,255,255,0.12)'
          return (
            <div key={ls.loc} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 34px 40px 36px', gap: 5, alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {ls.loc}{isRec ? ' ★' : ''}
              </span>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${bw}%`, background: barColor, borderRadius: 2, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text)', textAlign: 'right' }}>
                {ls.win_pct != null ? `${Math.round(ls.win_pct)}%` : '—'}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', textAlign: 'right' }}>
                {ls.in_pct != null ? `${Math.round(ls.in_pct)}%` : '—'}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: isRec ? 'var(--green)' : 'var(--text)', textAlign: 'right' }}>
                {ls.eff_pct != null ? `${Math.round(ls.eff_pct)}%` : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
        Eff% = Win% × In% · true value per location
      </div>
    </Card>
  )
}

function AIDot() {
  return (
    <div style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: 'var(--green)',
      animation: 'pulse 2s infinite',
    }} />
  )
}

function PointLog({ points }) {
  if (!points.length) return (
    <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '14px 0' }}>
      No points logged yet
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 240, overflowY: 'auto' }}>
      {points.map((p, i) => {
        const num = points.length - i
        const sideTag = p.side === 'deuce' ? 'D' : 'A'
        const isWin = p.result === 'win'
        const tag = p.is_df ? 'DF' : isWin ? 'WIN' : 'LOSS'
        return (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 9, fontSize: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 10, width: 22 }}>#{num}</span>
            <span style={{ background: 'rgba(0,230,118,0.1)', color: 'var(--green)', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>
              {sideTag}
            </span>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{p.s1_loc}</span>
            <span style={{
              fontSize: 10, padding: '2px 5px', borderRadius: 4,
              background: p.s1_in ? 'rgba(100,181,246,0.12)' : 'rgba(255,215,64,0.1)',
              color: p.s1_in ? 'var(--blue)' : 'var(--yellow)'
            }}>
              {p.s1_in ? 'IN' : 'F'}
            </span>
            {p.s2_loc && (
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                →{p.s2_loc} {p.s2_in ? 'IN' : 'DF'}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              padding: '2px 7px', borderRadius: 5,
              background: isWin ? 'rgba(0,230,118,0.14)' : 'rgba(255,82,82,0.14)',
              color: isWin ? 'var(--green)' : 'var(--red)',
            }}>
              {tag}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// inject pulse animation
if (typeof document !== 'undefined') {
  const s = document.createElement('style')
  s.textContent = '@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.75)}}'
  document.head.appendChild(s)
}
