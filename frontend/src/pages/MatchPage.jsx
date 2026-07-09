import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import {
  Card, Section, Tag,
  Spinner, showToast, ToastProvider
} from '../components/UI'

const LOCS = ['Wide', 'Body', 'T']

// ── Point-entry flow steps ───────────────────────────────────────────────
const STEP = {
  IDLE:          'idle',           // pick 1st serve location
  S1_IN:         's1_in',          // did the 1st serve land in?
  ACE_OR_PLAY:   'ace_or_play',    // serve landed in — ace, or did the point continue?
  S2_LOC:        's2_loc',         // pick 2nd serve location
  S2_IN:         's2_in',          // did the 2nd serve land in?
  WINNER_SELECT: 'winner_select',  // who won the point?
  HOW_SELECT:    'how_select',     // how did they win it?
}

const other = (p) => (p === 'player1' ? 'player2' : 'player1')

export default function MatchPage() {
  const { id: matchId } = useParams()
  const navigate = useNavigate()

  const [match, setMatch]   = useState(null)
  const [stats, setStats]   = useState(null)
  const [points, setPoints] = useState([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [loadError, setLoadError]     = useState(null)
  const [savingPt, setSavingPt]       = useState(false)

  // current point being built
  const [step, setStep]     = useState(STEP.IDLE)
  const [s1loc, setS1loc]   = useState(null)
  const [s1in, setS1in]     = useState(null)
  const [s2loc, setS2loc]   = useState(null)
  const [s2in, setS2in]     = useState(null)
  const [pointWinner, setPointWinner] = useState(null)

  useEffect(() => { init() }, [matchId])

  const init = async () => {
    try {
      const [mRes, pRes, stRes] = await Promise.all([
        api.get(`/matches/${matchId}`),
        api.get(`/points/match/${matchId}`),
        api.get(`/points/match/${matchId}/stats`),
      ])
      setMatch(mRes.data)
      setPoints(pRes.data)
      setStats(stRes.data)
    } catch (e) {
      const status = e?.response?.status
      const detail = e?.response?.data?.detail
      console.error('Failed to load match:', status, detail, e)
      setLoadError(detail || `${status ? `HTTP ${status}` : e.message} — check the console/network tab for details`)
      showToast('Failed to load match')
    } finally {
      setLoadingInit(false)
    }
  }

  const refreshStats = async () => {
    try {
      const r = await api.get(`/points/match/${matchId}/stats`)
      setStats(r.data)
    } catch {}
  }

  // ── point flow ──────────────────────────────────────────────────────────
  const selectLoc = (loc) => {
    if (step !== STEP.IDLE || match.is_complete) return
    setS1loc(loc)
    setStep(STEP.S1_IN)
  }

  const firstServeIn = (isIn) => {
    setS1in(isIn)
    setStep(isIn ? STEP.ACE_OR_PLAY : STEP.S2_LOC)
  }

  const select2Loc = (loc) => {
    setS2loc(loc)
    setStep(STEP.S2_IN)
  }

  const secondServeIn = (isIn) => {
    if (!isIn) {
      setS2in(false)
      commitPoint({ outcome: 'double_fault', winner: other(match.server), s2locOverride: s2loc, s2inOverride: false })
    } else {
      setS2in(true)
      setStep(STEP.ACE_OR_PLAY)
    }
  }

  const aceOrPlay = (isAce) => {
    if (isAce) {
      commitPoint({ outcome: 'ace', winner: match.server })
    } else {
      setStep(STEP.WINNER_SELECT)
    }
  }

  const selectWinner = (player) => {
    setPointWinner(player)
    setStep(STEP.HOW_SELECT)
  }

  const selectHow = (outcome) => {
    commitPoint({ outcome, winner: pointWinner })
  }

  const commitPoint = async ({ outcome, winner, s2locOverride, s2inOverride }) => {
    setSavingPt(true)
    try {
      const body = {
        match_id: matchId,
        s1_loc: s1loc,
        s1_in: !!s1in,
        s2_loc: s1in ? null : (s2locOverride ?? s2loc),
        s2_in: s1in ? null : (s2inOverride ?? s2in),
        outcome,
        winner,
      }
      const r = await api.post('/points', body)
      setPoints(prev => [...prev, r.data.point])
      setMatch(r.data.match)
      await refreshStats()
      showToast(pointToast(outcome, winner, r.data.match))
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Failed to save point')
    } finally {
      setSavingPt(false)
      resetPoint()
    }
  }

  const pointToast = (outcome, winner, m) => {
    if (m.is_complete) return `🏆 ${winner === 'player1' ? m.player1_name : m.player2_name} wins the match!`
    if (outcome === 'ace') return 'Ace!'
    if (outcome === 'double_fault') return 'Double fault'
    return 'Point logged'
  }

  const resetPoint = () => {
    setStep(STEP.IDLE)
    setS1loc(null); setS1in(null); setS2loc(null); setS2in(null); setPointWinner(null)
  }

  const undoLast = async () => {
    if (step !== STEP.IDLE) { resetPoint(); showToast('Point cancelled'); return }
    if (!points.length) { showToast('Nothing to undo'); return }
    try {
      const last = points[points.length - 1]
      await api.delete(`/points/${last.id}`)
      const [mRes, pRes, stRes] = await Promise.all([
        api.get(`/matches/${matchId}`),
        api.get(`/points/match/${matchId}`),
        api.get(`/points/match/${matchId}/stats`),
      ])
      setMatch(mRes.data)
      setPoints(pRes.data)
      setStats(stRes.data)
      showToast('Last point undone')
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Failed to undo')
    }
  }

  if (loadingInit) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <Spinner size={32} />
    </div>
  )

  if (loadError || !match) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 30, gap: 14, textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--red)' }}>Couldn't load this match</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 320 }}>{loadError || 'Unknown error — check the browser console for details.'}</div>
      <button onClick={() => navigate('/')} style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 18px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', marginTop: 8,
      }}>← Back to Matches</button>
    </div>
  )

  const serverName = match.server === 'player1' ? match.player1_name : match.player2_name
  const serveStats = stats ? (match.server === 'player1' ? stats.p1_serve : stats.p2_serve) : null
  const sideStats = serveStats ? (match.next_side === 'deuce' ? serveStats.deuce : serveStats.ad) : null
  const rec = sideStats ? {
    best: sideStats.recommendation,
    conf: sideStats.confidence,
    streak: sideStats.streak,
    locations: sideStats.locations,
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
              {match.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {match.format === 'bo5' ? 'Best of 5' : 'Best of 3'}{match.surface ? ` · ${match.surface}` : ''}
            </div>
          </div>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '4px 12px',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)'
          }}>
            <strong style={{ color: 'var(--text)' }}>{points.length}</strong> pts
          </div>
        </header>

        {/* Scoreboard */}
        <div style={{ padding: '14px 20px 0' }}>
          <Scoreboard match={match} />
        </div>

        {!match.is_complete ? (
          <>
            {/* Serving indicator + location buttons */}
            <Section title={step === STEP.IDLE ? `${serverName} to serve — 1st Serve Location` : '1st Serve Selected'}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {LOCS.map(loc => (
                  <LocButton
                    key={loc}
                    loc={loc}
                    selected={s1loc === loc}
                    isRec={rec?.best === loc && rec?.conf !== 'Learning' && step === STEP.IDLE}
                    isStreak={rec?.streak?.loc === loc && rec?.streak?.count >= 2 && step === STEP.IDLE}
                    streakCount={rec?.streak?.count}
                    stat={rec?.locations?.find(l => l.loc === loc)}
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
                serverName={serverName}
                returnerName={match.server === 'player1' ? match.player2_name : match.player1_name}
                pointWinnerName={pointWinner === 'player1' ? match.player1_name : match.player2_name}
                opponentOfWinnerName={pointWinner ? (pointWinner === 'player1' ? match.player2_name : match.player1_name) : ''}
                p1Name={match.player1_name}
                p2Name={match.player2_name}
                saving={savingPt}
                onFirstServeIn={firstServeIn}
                onSelect2Loc={select2Loc}
                onSecondServeIn={secondServeIn}
                onAceOrPlay={aceOrPlay}
                onSelectWinner={selectWinner}
                onSelectHow={selectHow}
              />
            </div>

            {/* AI Recommendation */}
            <div style={{ padding: '0 20px 14px' }}>
              <AICard rec={rec} serverName={serverName} side={match.next_side} />
            </div>
          </>
        ) : (
          <div style={{ padding: '14px 20px' }}>
            <Card accent style={{ padding: 18, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 1, color: 'var(--green)', marginBottom: 4 }}>
                🏆 {match.winner === 'player1' ? match.player1_name : match.player2_name} Wins
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Final score: {match.sets_score_display} sets</div>
            </Card>
          </div>
        )}

        {/* Stats comparison */}
        <Section title="Match Stats">
          <StatsCompare stats={stats} match={match} />
        </Section>

        {/* Point log */}
        <Section title="Point Log">
          <PointLog points={points} match={match} />
        </Section>

        {/* Bottom bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 440, padding: '10px 20px',
          background: 'rgba(8,12,8,0.96)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)', display: 'flex', gap: 8, zIndex: 10
        }}>
          {!match.is_complete && (
            <button
              onClick={undoLast}
              style={{
                flex: 1.3, background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 11, padding: 11, color: 'var(--muted)',
                fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}>
              ↩ Undo
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1, background: 'var(--card)', border: '1px solid rgba(255,82,82,0.18)',
              borderRadius: 11, padding: 11, color: 'rgba(255,82,82,0.5)',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
            {match.is_complete ? 'Back to Matches' : 'Pause & Exit'}
          </button>
        </div>
      </div>
    </ToastProvider>
  )
}

// ── Scoreboard ────────────────────────────────────────────────────────────

function Scoreboard({ match }) {
  const history = match.sets_history || []
  const cols = history.map((s, i) => ({ label: `S${i + 1}`, p1: s.p1, p2: s.p2, live: false }))
  if (!match.is_complete) cols.push({ label: `S${history.length + 1}`, p1: match.cur_p1_games, p2: match.cur_p2_games, live: true })

  return (
    <Card accent style={{ padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${cols.length},34px)`, gap: 6, alignItems: 'center' }}>
        <div />
        {cols.map((c, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {c.label}
          </div>
        ))}

        <PlayerRow name={match.player1_name} serving={match.server === 'player1'} />
        {cols.map((c, i) => <ScoreCell key={i} value={c.p1} live={c.live} />)}

        <PlayerRow name={match.player2_name} serving={match.server === 'player2'} />
        {cols.map((c, i) => <ScoreCell key={i} value={c.p2} live={c.live} />)}
      </div>

      {!match.is_complete ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 1 }}>
            {match.game_score_display}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {match.is_tiebreak && <Tag color="var(--yellow)" bg="rgba(255,215,64,0.08)">Tiebreak</Tag>}
            <Tag color="var(--blue)" bg="rgba(100,181,246,0.08)">{match.next_side === 'deuce' ? 'Deuce Court' : 'Ad Court'}</Tag>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          Match complete
        </div>
      )}
    </Card>
  )
}

function PlayerRow({ name, serving }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: serving ? 700 : 500, color: serving ? 'var(--text)' : 'var(--muted)' }}>
      {serving && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  )
}

function ScoreCell({ value, live }) {
  return (
    <div style={{
      textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 15,
      fontWeight: live ? 700 : 500, color: live ? 'var(--green)' : 'var(--text)',
    }}>
      {value}
    </div>
  )
}

// ── Location button ──────────────────────────────────────────────────────

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
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: selected ? 'var(--green)' : isRec ? 'var(--yellow)' : 'transparent',
      }} />
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
        {stat?.first_in_att > 0 ? `In: ${Math.round(stat.first_in_pct)}%` : 'In: —'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 1 }}>
        {stat?.ev_pct != null ? `EV: ${Math.round(stat.ev_pct)}%` : 'EV: —'}
      </span>
    </button>
  )
}

// ── Point-entry flow card ────────────────────────────────────────────────

function FlowCard({
  step, s1loc, s2loc, serverName, returnerName,
  pointWinnerName, opponentOfWinnerName, p1Name, p2Name, saving,
  onFirstServeIn, onSelect2Loc, onSecondServeIn, onAceOrPlay, onSelectWinner, onSelectHow,
}) {
  const cardStyle = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', position: 'relative' }
  const accentBar = <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--green), transparent)' }} />
  const inner = { padding: '14px 16px' }
  const lbl = (txt) => <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.8, color: 'var(--green)', marginBottom: 9, fontWeight: 700 }}>{txt}</div>
  const q = (txt) => <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: txt }} />
  const row = { display: 'flex', gap: 7, flexWrap: 'wrap' }

  const flowBtn = (label, sub, onClick, variant, flexBasis) => {
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
        key={label}
        onClick={onClick}
        disabled={saving}
        style={{
          flex: flexBasis || 1, minWidth: 0, padding: '12px 8px', borderRadius: 11, border: c.border || 'none',
          fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 0.5,
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
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl('Waiting')}
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Select a serve location above to start the point</div>
    </div></div>
  )

  if (step === STEP.S1_IN) return (
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl(`1st Serve · ${s1loc}`)}
      {q('Did the 1st serve go <em style="color:var(--yellow);font-style:normal">IN</em>?')}
      <div style={row}>
        {flowBtn('IN', 'Play the point', () => onFirstServeIn(true), 'in')}
        {flowBtn('FAULT', 'Go to 2nd serve', () => onFirstServeIn(false), 'out')}
      </div>
    </div></div>
  )

  if (step === STEP.S2_LOC) return (
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl('2nd Serve · Pick Location')}
      {q('Where for <em style="color:var(--yellow);font-style:normal">2nd serve</em>?')}
      <div style={row}>
        {LOCS.map(l => flowBtn(l, null, () => onSelect2Loc(l), 'neu'))}
      </div>
    </div></div>
  )

  if (step === STEP.S2_IN) return (
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl(`2nd Serve · ${s2loc}`)}
      {q('Did the 2nd serve go <em style="color:var(--yellow);font-style:normal">IN</em>?')}
      <div style={row}>
        {flowBtn('IN', 'Play the point', () => onSecondServeIn(true), 'in')}
        {flowBtn('DOUBLE FAULT', 'Point over', () => onSecondServeIn(false), 'out')}
      </div>
    </div></div>
  )

  if (step === STEP.ACE_OR_PLAY) return (
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl('Serve In')}
      {q(`Did <em style="color:var(--yellow);font-style:normal">${serverName}</em> hit an ace?`)}
      <div style={row}>
        {flowBtn('ACE', 'Unreturned', () => onAceOrPlay(true), 'win')}
        {flowBtn('PLAYED OUT', 'Rally happened', () => onAceOrPlay(false), 'neu')}
      </div>
    </div></div>
  )

  if (step === STEP.WINNER_SELECT) return (
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl('Point Result')}
      {q('Who won the point?')}
      <div style={row}>
        {flowBtn(p1Name, null, () => onSelectWinner('player1'), 'neu')}
        {flowBtn(p2Name, null, () => onSelectWinner('player2'), 'neu')}
      </div>
    </div></div>
  )

  if (step === STEP.HOW_SELECT) return (
    <div style={cardStyle}>{accentBar}<div style={inner}>
      {lbl(`${pointWinnerName} Won`)}
      {q('How did it end?')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {flowBtn('Clean Winner', null, () => onSelectHow('winner'), 'win', 1)}
        {flowBtn(`${opponentOfWinnerName}'s Unforced Error`, null, () => onSelectHow('unforced_error'), 'neu', 1)}
        {flowBtn(`${opponentOfWinnerName}'s Forced Error`, null, () => onSelectHow('forced_error'), 'neu', 1)}
      </div>
    </div></div>
  )

  return null
}

// ── AI recommendation card ───────────────────────────────────────────────

function AICard({ rec, serverName, side }) {
  if (!rec || !rec.locations) return (
    <Card accent style={{ padding: 14 }}>
      <AIDot />
      <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: 13 }}>
        Log a few points to activate AI
      </div>
    </Card>
  )

  const { best, conf, streak, locations } = rec
  const totalData = locations.reduce((s, l) => s + l.first_in_att, 0)

  if (totalData < 3) return (
    <Card accent style={{ padding: 14 }}>
      <AIDot />
      <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: 13 }}>
        Log {3 - totalData} more point{3 - totalData !== 1 ? 's' : ''} to activate AI
      </div>
    </Card>
  )

  const confColor = conf === 'High' ? 'var(--green)' : conf === 'Medium' ? 'var(--yellow)' : 'var(--muted)'
  const maxEv = Math.max(...locations.map(l => l.ev_pct ?? 0), 0.001)
  const sorted = [...locations].sort((a, b) => (b.ev_pct ?? 0) - (a.ev_pct ?? 0))

  return (
    <Card accent style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <AIDot />
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--green)', fontWeight: 700 }}>
          AI · {serverName}'s Serve
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {side === 'deuce' ? 'Deuce' : 'Ad'}
        </span>
      </div>

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

      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 34px 34px 36px', gap: 5, marginBottom: 4 }}>
          {['', '', '1stIn%', '1stWin%', 'EV%'].map((h, i) => (
            <span key={i} style={{ fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {sorted.map(ls => {
          const isRec = ls.loc === best
          const isSk = ls.loc === streak?.loc && streak?.count >= 2
          const bw = ls.ev_pct != null ? Math.round(100 * ls.ev_pct / maxEv) : 0
          const barColor = isRec ? 'var(--green)' : isSk ? 'rgba(255,82,82,0.45)' : 'rgba(255,255,255,0.12)'
          return (
            <div key={ls.loc} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 34px 34px 36px', gap: 5, alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {ls.loc}{isRec ? ' ★' : ''}
              </span>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${bw}%`, background: barColor, borderRadius: 2, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text)', textAlign: 'right' }}>
                {ls.first_in_pct != null ? `${Math.round(ls.first_in_pct)}%` : '—'}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', textAlign: 'right' }}>
                {ls.first_win_pct != null ? `${Math.round(ls.first_win_pct)}%` : '—'}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: isRec ? 'var(--green)' : 'var(--text)', textAlign: 'right' }}>
                {ls.ev_pct != null ? `${Math.round(ls.ev_pct)}%` : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>
        EV% = 1st-in% × 1st-win% + 1st-miss% × 2nd-serve-win% · expected value of aiming here
      </div>
    </Card>
  )
}

function AIDot() {
  return <div style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s infinite' }} />
}

// ── Stats comparison ──────────────────────────────────────────────────────

function StatsCompare({ stats, match }) {
  if (!stats) return null
  const rows = [
    ['Points Won %', pct(stats.p1_overall.win_pct), pct(stats.p2_overall.win_pct)],
    ['1st Serve In %', pct(stats.p1_serve.first_in_pct), pct(stats.p2_serve.first_in_pct)],
    ['2nd Serve In %', pct(stats.p1_serve.second_in_pct), pct(stats.p2_serve.second_in_pct)],
    ['Aces', stats.p1_overall.aces, stats.p2_overall.aces],
    ['Double Faults', stats.p1_overall.double_faults, stats.p2_overall.double_faults],
    ['Winners', stats.p1_overall.winners, stats.p2_overall.winners],
    ['Unforced Errors', stats.p1_overall.unforced_errors, stats.p2_overall.unforced_errors],
  ]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', gap: 4, marginBottom: 8 }}>
        <div />
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.player1_name}</div>
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.player2_name}</div>
      </div>
      {rows.map(([label, v1, v2]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px', gap: 4, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{v1 ?? '—'}</div>
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{v2 ?? '—'}</div>
        </div>
      ))}
    </div>
  )
}

function pct(v) { return v != null ? `${v}%` : null }

// ── Point log ─────────────────────────────────────────────────────────────

const OUTCOME_LABEL = {
  ace: 'ACE', winner: 'WNR', unforced_error: 'UFE', forced_error: 'FE', double_fault: 'DF',
}

function PointLog({ points, match }) {
  if (!points.length) return (
    <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '14px 0' }}>
      No points logged yet
    </div>
  )

  const reversed = [...points].reverse()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 300, overflowY: 'auto' }}>
      {reversed.map((p) => {
        const sideTag = p.side === 'deuce' ? 'D' : 'A'
        const serverInitial = p.server === 'player1' ? match.player1_name[0] : match.player2_name[0]
        const winnerName = p.winner === 'player1' ? match.player1_name : match.player2_name
        const badges = []
        if (p.match_won) badges.push('MATCH')
        else if (p.set_won) badges.push('SET')
        else if (p.game_won) badges.push('GAME')

        return (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 9, fontSize: 11, flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 10, width: 26 }}>#{p.seq}</span>
            <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>S{p.set_num}·G{p.game_num}</span>
            <span style={{ background: 'rgba(0,230,118,0.1)', color: 'var(--green)', padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>
              {sideTag}
            </span>
            <span style={{ fontSize: 9, color: 'var(--muted)' }}>{serverInitial} serve</span>
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
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
              background: 'rgba(255,255,255,0.06)', color: 'var(--muted)',
            }}>
              {OUTCOME_LABEL[p.outcome]}
            </span>
            {badges.map(b => (
              <span key={b} style={{
                fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                background: 'var(--yellow)', color: '#111',
              }}>{b}</span>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              padding: '2px 7px', borderRadius: 5,
              background: 'rgba(0,230,118,0.14)',
              color: 'var(--green)',
            }}>
              {winnerName}
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
