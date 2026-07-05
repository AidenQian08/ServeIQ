import { useState } from 'react'
import styles from './UI.module.css'

/* ── Logo ── */
export function Logo({ size = 'md' }) {
  const fs = size === 'lg' ? 38 : size === 'sm' ? 20 : 28
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: fs, letterSpacing: 2, color: 'var(--green)' }}>
      Serve<span style={{ color: 'var(--text)' }}>IQ</span>
    </div>
  )
}

/* ── Card ── */
export function Card({ children, style, accent }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${accent ? 'rgba(0,230,118,0.25)' : 'var(--border)'}`,
      borderRadius: 14,
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      {accent && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, var(--green), transparent)',
        }} />
      )}
      {children}
    </div>
  )
}

/* ── Button ── */
export function Btn({ children, variant = 'primary', onClick, disabled, style, full }) {
  const base = {
    padding: '13px 20px',
    borderRadius: 12,
    border: 'none',
    fontFamily: 'var(--font-body)',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.14s',
    width: full ? '100%' : undefined,
    ...style,
  }
  const variants = {
    primary: { background: 'linear-gradient(135deg,#00e676,#00c853)', color: '#041408' },
    ghost:   { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' },
    danger:  { background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.2)', color: 'var(--red)' },
    yellow:  { background: 'var(--yellow)', color: '#111' },
  }
  return (
    <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ── Input ── */
export function Input({ label, type = 'text', value, onChange, placeholder, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--muted)' }}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          background: 'var(--card)',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 10,
          padding: '12px 14px',
          color: 'var(--text)',
          fontSize: 14,
          outline: 'none',
          width: '100%',
          transition: 'border-color 0.14s',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--green)'}
        onBlur={e => e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)'}
      />
      {error && <span style={{ fontSize: 11, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}

/* ── Toggle group ── */
export function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length},1fr)`, gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? 'rgba(0,230,118,0.1)' : 'var(--card)',
            border: `1.5px solid ${value === opt.value ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '11px 8px',
            color: value === opt.value ? 'var(--green)' : 'var(--muted)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 0.14s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ── Stat box ── */
export function StatBox({ label, value, highlight }) {
  return (
    <div style={{
      flex: 1,
      background: highlight ? 'rgba(0,230,118,0.04)' : 'var(--card)',
      border: `1px solid ${highlight ? 'rgba(0,230,118,0.28)' : 'var(--border)'}`,
      borderRadius: 10,
      padding: '8px 10px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--muted)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 20,
        lineHeight: 1,
        color: highlight ? 'var(--green)' : 'var(--text)',
      }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

/* ── Toast ── */
let _setToast = null
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  _setToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }
  return (
    <>
      {children}
      <div style={{
        position: 'fixed', top: 18, left: '50%',
        transform: `translateX(-50%) translateY(${toast ? 0 : -70}px)`,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 24, padding: '9px 20px',
        fontSize: 13, fontWeight: 500, color: 'var(--text)',
        zIndex: 1000, transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>
        {toast}
      </div>
    </>
  )
}
export const showToast = (msg) => _setToast?.(msg)

/* ── Page shell ── */
export function PageShell({ children }) {
  return (
    <div style={{
      position: 'relative', zIndex: 1,
      maxWidth: 440, margin: '0 auto',
      minHeight: '100vh',
    }}>
      {children}
    </div>
  )
}

/* ── Section ── */
export function Section({ title, children, style }) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', ...style }}>
      {title && (
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

/* ── Spinner ── */
export function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border)`,
      borderTopColor: 'var(--green)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

/* inject spin keyframe once */
if (typeof document !== 'undefined') {
  const s = document.createElement('style')
  s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(s)
}

/* ── Empty state ── */
export function Empty({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{sub}</div>
    </div>
  )
}

/* ── Modal ── */
export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          borderRadius: '16px 16px 0 0', padding: '20px',
          width: '100%', maxWidth: 440,
          animation: 'slideUp 0.22s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, letterSpacing: 1 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

if (typeof document !== 'undefined') {
  const s2 = document.createElement('style')
  s2.textContent = '@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'
  document.head.appendChild(s2)
}
