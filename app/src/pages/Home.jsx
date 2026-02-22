import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { useApp } from '../lib/store'
import { BarChart3, Bell, Sparkles, ChevronDown, SendHorizontal, RefreshCw } from 'lucide-react'
import EntryDetailModal from '../components/EntryDetailModal'
import { generatePlaceholderHints } from '../lib/gemini'

// Lazy-load VoiceChat to prevent @daily-co/daily-js from crashing on iOS Safari at startup
const VoiceChat = React.lazy(() =>
  import('../components/VoiceChat').catch(() => ({ default: () => null }))
)

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID
const USER_CONTEXT_KEY = 'clarity_user_context'

function nowDate() { return new Date().toISOString().slice(0, 10) }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

function useAlertsBadge(entries) {
  if (!entries?.length) return false
  try {
    const storedHash = localStorage.getItem('clarity_alerts_hash') || localStorage.getItem('clarity_reminders_hash')
    if (!storedHash) return false
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const recent = entries.filter(e => e.entry_date >= cutoffStr)
    const currentHash = recent.map(e => e.id).sort().join('|')
    return currentHash !== storedHash
  } catch { return false }
}

function formatTime(entry) {
  if (entry.entry_time) return entry.entry_time.slice(0, 5)
  return new Date(entry.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDatePill(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
}

export default function Home() {
  const navigate = useNavigate()
  const { user, entries, entriesLoading, addEntry, updateEntry, deleteEntry } = useApp()
  const showAlertsBadge = useAlertsBadge(entries)
  const [text, setText] = useState('')
  const [time, setTime] = useState(nowTime())
  const [saving, setSaving] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [hints, setHints] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('clarity_hints') || '[]')
      if (cached.length > 0 && typeof cached[0] === 'string') return []
      return cached
    } catch { return [] }
  })
  const [hintsVisible, setHintsVisible] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('clarity_hints') || '[]')
      return cached.length > 0 && typeof cached[0] !== 'string'
    } catch { return false }
  })
  const [hintsLoading, setHintsLoading] = useState(false)

  // Edit modal
  const [modal, setModal] = useState(null)
  const [editText, setEditText] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [modalOrigin, setModalOrigin] = useState(null)
  const [modalClosing, setModalClosing] = useState(false)

  // Staggered fade-in
  const [mounted, setMounted] = useState(false)
  const hasAnimated = useRef(false)

  const timerRef = React.useRef(null)
  useEffect(() => {
    const update = () => setTime(nowTime())
    const now = new Date()
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
    const timeout = setTimeout(() => {
      update()
      timerRef.current = setInterval(update, 60000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeout)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Trigger mount animation
  useEffect(() => {
    if (!entriesLoading && entries.length > 0 && !hasAnimated.current) {
      requestAnimationFrame(() => {
        setMounted(true)
        // Mark animation as done after all staggered entries finish
        setTimeout(() => { hasAnimated.current = true }, 800)
      })
    }
  }, [entriesLoading, entries.length])

  // Smart hints: show cached, regenerate if stale (>4h) or missing
  useEffect(() => {
    if (entriesLoading || entries.length === 0) return
    const hintsTs = parseInt(localStorage.getItem('clarity_hints_ts') || '0', 10)
    const isStale = Date.now() - hintsTs > 4 * 3600000
    if (hints.length > 0 && !isStale) {
      requestAnimationFrame(() => setHintsVisible(true))
      return
    }
    // Show cached while regenerating
    if (hints.length > 0) requestAnimationFrame(() => setHintsVisible(true))
    generatePlaceholderHints(entries).then(h => {
      if (h && h.length > 0) {
        setHints(h)
        try {
          localStorage.setItem('clarity_hints', JSON.stringify(h))
          localStorage.setItem('clarity_hints_ts', Date.now().toString())
        } catch {}
        requestAnimationFrame(() => setHintsVisible(true))
      }
    })
  }, [entriesLoading, entries.length])

  // All entries sorted oldest first (chat-style)
  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const da = a.entry_date || a.created_at?.slice(0, 10) || ''
      const db = b.entry_date || b.created_at?.slice(0, 10) || ''
      if (da !== db) return da.localeCompare(db)
      const ta = a.entry_time || a.created_at?.slice(11, 16) || ''
      const tb = b.entry_time || b.created_at?.slice(11, 16) || ''
      return ta.localeCompare(tb)
    })
  }, [entries])

  const handleSubmit = async () => {
    if (!text.trim() || saving) return
    const isFirst = entries.length === 0
    const newEntry = { text: text.trim(), entry_date: nowDate(), entry_time: nowTime() }
    setSaving(true)
    await addEntry({ text: newEntry.text, date: newEntry.entry_date, time: newEntry.entry_time })
    setText(''); setTime(nowTime()); setSaving(false)
    if (isFirst) {
      setShowCelebration(true)
      setTimeout(() => setShowCelebration(false), 5000)
    }
    // Refresh hints after new entry
    setHintsVisible(false)
    generatePlaceholderHints([...entries, newEntry]).then(h => {
      if (h && h.length > 0) {
        setHints(h)
        try {
          localStorage.setItem('clarity_hints', JSON.stringify(h))
          localStorage.setItem('clarity_hints_ts', Date.now().toString())
        } catch {}
        requestAnimationFrame(() => setHintsVisible(true))
      }
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const refreshHints = async () => {
    if (hintsLoading || entries.length === 0) return
    setHintsLoading(true)
    setHintsVisible(false)
    try {
      const h = await generatePlaceholderHints(entries)
      if (h && h.length > 0) {
        setHints(h)
        try {
          localStorage.setItem('clarity_hints', JSON.stringify(h))
          localStorage.setItem('clarity_hints_ts', Date.now().toString())
        } catch {}
        requestAnimationFrame(() => setHintsVisible(true))
      }
    } catch {}
    setHintsLoading(false)
  }

  const openModal = (entry, el) => {
    if (el) setModalOrigin(el.getBoundingClientRect()); else setModalOrigin(null)
    setModalClosing(false); setModal(entry)
    setEditText(entry.text); setEditDate(entry.entry_date || ''); setEditTime(entry.entry_time?.slice(0, 5) || '')
  }
  const closeModal = () => {
    if (modal) {
      const el = document.querySelector(`[data-entry-id="${modal.id}"]`)
      if (el) setModalOrigin(el.getBoundingClientRect())
    }
    setModalClosing(true)
    setTimeout(() => { setModal(null); setModalClosing(false) }, 400)
  }
  const handleSave = async () => {
    if (!modal) return
    await updateEntry(modal.id, { text: editText, entry_date: editDate, entry_time: editTime })
    closeModal()
  }
  const handleDelete = async () => {
    if (!modal) return
    await deleteEntry(modal.id)
    setModal(null); setModalClosing(false)
  }

  // Handle entry created by voice chat
  const handleVoiceEntry = async (voiceText) => {
    if (!voiceText?.trim()) return
    await addEntry({ text: voiceText.trim(), date: nowDate(), time: nowTime() })
    // Refresh hints after voice entry
    setHintsVisible(false)
    generatePlaceholderHints([...entries, { text: voiceText, entry_date: nowDate(), entry_time: nowTime() }]).then(h => {
      if (h && h.length > 0) {
        setHints(h)
        try {
          localStorage.setItem('clarity_hints', JSON.stringify(h))
          localStorage.setItem('clarity_hints_ts', Date.now().toString())
        } catch {}
        requestAnimationFrame(() => setHintsVisible(true))
      }
    })
  }

  // Auto-scroll to bottom on new entry
  const feedRef = React.useRef(null)
  const prevCount = React.useRef(entries.length)
  useEffect(() => {
    if (entries.length > prevCount.current) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }
    prevCount.current = entries.length
  }, [entries.length])

  // Scroll to bottom on first load
  useEffect(() => {
    if (!entriesLoading && entries.length > 0) {
      window.scrollTo(0, document.body.scrollHeight)
    }
  }, [entriesLoading])

  // Build entries with day separators
  const renderEntries = () => {
    const items = []
    let lastDate = null

    sorted.forEach((entry, idx) => {
      const entryDate = entry.entry_date || entry.created_at?.slice(0, 10) || ''

      // Day separator pill
      if (entryDate !== lastDate) {
        items.push(
          <div key={`sep-${entryDate}`} style={{
            background: 'rgba(255,255,255,0.35)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 100,
            padding: '6px 16px',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-display)',
            color: 'var(--text-light)',
            fontWeight: 600,
            textAlign: 'center',
            margin: '12px auto 8px',
            width: 'fit-content',
          }}>
            {formatDatePill(entryDate)}
          </div>
        )
        lastDate = entryDate
      }

      const isAnimated = mounted || hasAnimated.current
      items.push(
        <div
          key={entry.id}
          className="feed-card"
          data-entry-id={entry.id}
          onClick={(e) => openModal(entry, e.currentTarget)}
          style={{
            padding: '14px 20px',
            opacity: isAnimated ? 1 : 0,
            transform: isAnimated ? 'none' : 'translateY(8px)',
            transition: `opacity 0.4s ease ${Math.min(idx * 30, 600)}ms, transform 0.4s ease ${Math.min(idx * 30, 600)}ms`,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div className="feed-time-col">
            <span className="feed-time" style={{ fontSize: '0.78rem' }}>{formatTime(entry)}</span>
          </div>
          <p className="feed-text" style={{ fontSize: '0.9rem' }}>{entry.text}</p>
        </div>
      )
    })

    return items
  }

  return (
    <div className="home-feed" ref={feedRef} style={{ gap: '2px' }}>
      {/* Entries with day separators */}
      {renderEntries()}

      {/* Loading */}
      {entriesLoading && (
        <p className="feed-loading">Loading...</p>
      )}

      {/* Onboarding: Welcome */}
      {!entriesLoading && entries.length === 0 && (
        <div className="feed-empty">
          <Sparkles size={40} style={{ color: 'var(--amber)', marginBottom: 12 }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Welcome to Clarity</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.7, maxWidth: 320, margin: '0 auto 16px' }}>
            Write about your day — how you feel, what you did, what you took. Clarity finds patterns in your mood, energy, and habits.
          </p>
          <ChevronDown size={20} style={{ color: 'var(--amber)', animation: 'floatDown 1.5s ease-in-out infinite' }} />
        </div>
      )}

      {/* Onboarding: Celebration after first entry */}
      {showCelebration && entries.length === 1 && (
        <div style={{
          textAlign: 'center', padding: '16px 20px', margin: '0 16px',
          borderRadius: 'var(--radius-lg)', background: 'rgba(232,168,56,0.1)',
          border: '1px solid rgba(232,168,56,0.2)',
          animation: 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <p style={{ color: 'var(--amber)', fontWeight: 600, fontSize: '.9rem', margin: '0 0 4px' }}>
            Your first entry!
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: 0 }}>
            Keep writing throughout the day — the more you share, the better the insights.
          </p>
        </div>
      )}

      {/* Onboarding: Analysis hint after 3+ entries on same day */}
      {!entriesLoading && entries.length >= 3 && !localStorage.getItem('clarity_onboarding_analysis_hint_dismissed') && (() => {
        const today = nowDate()
        const todayCount = entries.filter(e => e.entry_date === today).length
        if (todayCount < 3) return null
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', margin: '0 16px',
            borderRadius: 'var(--radius-lg)', background: 'rgba(58,138,106,0.08)',
            border: '1px solid rgba(58,138,106,0.15)',
          }}>
            <p style={{ color: 'var(--text)', fontSize: '.85rem', margin: 0, flex: 1 }}>
              Ready for your first analysis?{' '}
              <span
                onClick={() => navigate(`/app/day/${today}`)}
                style={{ color: 'var(--amber)', fontWeight: 600, cursor: 'pointer' }}
              >
                See today's insights →
              </span>
            </p>
            <button
              onClick={() => { localStorage.setItem('clarity_onboarding_analysis_hint_dismissed', '1'); window.dispatchEvent(new Event('storage')) }}
              style={{ background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', padding: '2px 6px', fontSize: '.8rem' }}
            >✕</button>
          </div>
        )
      })()}

      {/* Input — fixed at bottom */}
      <div className="feed-input-bar">
        {/* Smart hints — right above input, always visible */}
        {(hints.length > 0 || hintsLoading) && (
          <div className="hint-tray">
            {/* Refresh button — always first, always visible */}
            <button
              className="hint-chip glass"
              onClick={refreshHints}
              disabled={hintsLoading}
              style={{
                opacity: hintsVisible || hintsLoading ? 0.7 : 0,
                transform: hintsVisible || hintsLoading ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                cursor: hintsLoading ? 'wait' : 'pointer',
                border: 'none', padding: '8px 10px',
                display: 'flex', alignItems: 'center',
              }}
              title="Refresh hints"
            >
              <RefreshCw size={13} style={hintsLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
            {!hintsLoading && hints.map((hint, i) => {
              const hasSource = hint.source_date && hint.source_time
              return (
                <div
                  key={i}
                  className={`hint-chip glass${hasSource ? ' hint-chip-link' : ''}`}
                  onClick={hasSource ? () => {
                    const el = sorted.find(e =>
                      e.entry_date === hint.source_date &&
                      e.entry_time?.slice(0, 5) === hint.source_time?.slice(0, 5)
                    )
                    if (el) {
                      const node = document.querySelector(`[data-entry-id="${el.id}"]`)
                      if (node) {
                        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        node.classList.add('feed-card-flash')
                        setTimeout(() => node.classList.remove('feed-card-flash'), 1500)
                      }
                    }
                  } : undefined}
                  style={{
                    opacity: hintsVisible ? 1 : 0,
                    transform: hintsVisible ? 'translateY(0)' : 'translateY(8px)',
                    transition: `opacity 0.4s ease ${i * 60}ms, transform 0.4s ease ${i * 60}ms`,
                  }}
                >
                  {hint.text || hint}
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom row: Trends — Input — Alerts */}
        <div className="bottom-bar-row">
          <NavLink to="/app/trends" className="bottom-nav-btn glass" title="Trends">
            <BarChart3 size={22} />
          </NavLink>

          <div className="feed-input-inner" style={{ opacity: saving ? 0.6 : 1, flex: 1 }}>
            <span className="feed-time" style={{ fontSize: '0.8rem', alignSelf: 'center', flexShrink: 0 }}>{time}</span>
            <div className="feed-card-body" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <textarea
                className="feed-input"
                placeholder="Write anything..."
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
                rows={1}
              />
              {/* Send button — appare quando c'è testo */}
              <button
                className="feed-send"
                onClick={handleSubmit}
                disabled={saving || !text.trim()}
                aria-label="Send"
                style={{
                  opacity: text.trim() ? 1 : 0,
                  pointerEvents: text.trim() ? 'auto' : 'none',
                  flexShrink: 0,
                }}
              >
                <SendHorizontal size={16} />
              </button>
              {/* Voice chat — lazy-loaded to prevent iOS Safari crash from @daily-co/daily-js */}
              <Suspense fallback={null}>
                <VoiceChat
                  vapiPublicKey={VAPI_PUBLIC_KEY}
                  assistantId={VAPI_ASSISTANT_ID}
                  onEntryCreated={handleVoiceEntry}
                  hints={hints}
                  userContext={(() => { try { return localStorage.getItem(USER_CONTEXT_KEY) || '' } catch { return '' } })()}
                  hideWhenText={Boolean(text.trim())}
                />
              </Suspense>
            </div>
          </div>

          <NavLink to="/app/alerts" className="bottom-nav-btn glass" title="Alerts" style={{ position: 'relative' }}>
            <Bell size={22} />
            {showAlertsBadge && (
              <span style={{
                position: 'absolute', top: 8, right: 8,
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--amber)',
                boxShadow: '0 0 6px rgba(232,168,56,0.6)',
              }} />
            )}
          </NavLink>
        </div>
      </div>

      {/* Edit modal */}
      <EntryDetailModal
        entry={modal}
        modalOrigin={modalOrigin}
        modalClosing={modalClosing}
        editText={editText} setEditText={setEditText}
        editDate={editDate} setEditDate={setEditDate}
        editTime={editTime} setEditTime={setEditTime}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
