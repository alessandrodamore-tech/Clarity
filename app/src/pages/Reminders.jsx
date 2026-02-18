import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { loadCachedSummaries, generateReminders } from '../lib/gemini'
import {
  Bell, Lightbulb, MessageCircle, AlertTriangle, CheckCircle2,
  RefreshCw, Search, ExternalLink, Square, CheckSquare,
  ChevronDown, ChevronRight, Archive, RotateCcw,
} from 'lucide-react'

const CACHE_KEY = 'clarity_reminders'
const SEEN_KEY = 'clarity_reminders_seen'
const HASH_KEY = 'clarity_reminders_hash'
const DONE_KEY = 'clarity_reminders_done'
const PROCESSED_IDS_KEY = 'clarity_reminders_processed_ids'
const NOTIF_KEY = 'clarity_notif_sent'

function hashEntries(entries) {
  return entries.map(e => e.id).sort().join('|')
}

function loadCachedReminders() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}

function saveCachedReminders(data, hash, userId) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    localStorage.setItem(HASH_KEY, hash)
    localStorage.setItem(SEEN_KEY, Date.now().toString())
  } catch {}
  if (userId) {
    supabase.from('user_reminders').upsert({
      user_id: userId,
      reminders_data: data,
      entries_hash: hash,
      processed_ids: [...(loadProcessedIds())],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.warn('Failed to save reminders to Supabase:', error)
    })
  }
}

function loadDoneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')) } catch { return new Set() }
}

function saveDoneSet(doneSet, userId) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...doneSet])) } catch {}
  if (userId) {
    supabase.from('user_reminders').upsert({
      user_id: userId,
      done_items: [...doneSet],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.warn('Failed to save done state to Supabase:', error)
    })
  }
}

function loadProcessedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(PROCESSED_IDS_KEY) || '[]')) } catch { return new Set() }
}

function saveProcessedIds(ids, userId) {
  try { localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify([...ids])) } catch {}
  if (userId) {
    supabase.from('user_reminders').upsert({
      user_id: userId,
      processed_ids: [...ids],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.warn('Failed to save processed IDs to Supabase:', error)
    })
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

function showDueNotifications(reminders, doneSet) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const today = new Date().toISOString().slice(0, 10)
  // Track which notifications were already sent today
  let sent
  try { sent = new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')) } catch { sent = new Set() }
  const newSent = [...sent]

  reminders
    .filter(r => r.due_date && r.due_date <= today && !doneSet.has(r._key) && !sent.has(r._key))
    .slice(0, 5)
    .forEach(r => {
      const isOverdue = r.due_date < today
      new Notification('Clarity' + (isOverdue ? ' — Scaduto' : ' — In scadenza oggi'), {
        body: r.text,
        tag: r._key,
        icon: '/clarity-icon.png',
      })
      newSent.push(r._key)
    })

  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(newSent)) } catch {}
}

// ─── HELPERS ──────────────────────────────────────────────
const suggestionTypeConfig = {
  positive: { color: '#3a8a6a', bg: 'rgba(58,138,106,0.10)', icon: CheckCircle2 },
  warning: { color: '#9a7030', bg: 'rgba(232,168,56,0.10)', icon: AlertTriangle },
  info: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.08)', icon: Lightbulb },
}

function formatDueDate(due) {
  if (!due) return null
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = due < today
  const isToday = due === today
  const d = new Date(due + 'T00:00:00')
  const label = isToday ? 'oggi' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  return { label, isOverdue, isToday }
}

// ─── COMPONENT ────────────────────────────────────────────
export default function Reminders() {
  const { user, entries } = useApp()
  const [data, setData] = useState(loadCachedReminders)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [daySummaries, setDaySummaries] = useState({})
  const [doneSet, setDoneSet] = useState(loadDoneSet)
  const [supabaseLoaded, setSupabaseLoaded] = useState(false)
  const [processedIds, setProcessedIds] = useState(() => loadProcessedIds())

  useEffect(() => {
    window.scrollTo(0, 0)
    requestAnimationFrame(() => setMounted(true))
  }, [])

  // Mark as seen
  useEffect(() => {
    try { localStorage.setItem(SEEN_KEY, Date.now().toString()) } catch {}
  }, [])

  // Load day summaries
  useEffect(() => {
    if (!user?.id) return
    loadCachedSummaries(user.id).then(cache => setDaySummaries(cache))
  }, [user])

  // Load reminders from Supabase
  useEffect(() => {
    if (!user?.id) { setSupabaseLoaded(true); return }
    supabase
      .from('user_reminders')
      .select('reminders_data, done_items, processed_ids, entries_hash')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          if (row.reminders_data) {
            setData(row.reminders_data)
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(row.reminders_data)) } catch {}
          }
          if (row.done_items) {
            const set = new Set(row.done_items)
            setDoneSet(set)
            try { localStorage.setItem(DONE_KEY, JSON.stringify(row.done_items)) } catch {}
          }
          if (row.processed_ids) {
            setProcessedIds(new Set(row.processed_ids))
            try { localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(row.processed_ids)) } catch {}
          }
          if (row.entries_hash) {
            try { localStorage.setItem(HASH_KEY, row.entries_hash) } catch {}
          }
        }
      })
      .finally(() => setSupabaseLoaded(true))
  }, [user])

  // Count new (unprocessed) entries — drives auto-update
  const newEntryCount = useMemo(() => {
    if (!entries?.length) return 0
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return entries.filter(e => e.entry_date >= cutoffStr && !processedIds.has(e.id)).length
  }, [entries, processedIds])

  // Compute entries hash (last 14 days)
  const recentHash = useMemo(() => {
    if (!entries?.length) return ''
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const recent = entries.filter(e => e.entry_date >= cutoffStr)
    return hashEntries(recent)
  }, [entries])

  // Use ref to access current data in generate without adding it as dependency
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])

  const generate = useCallback(async (incremental = false) => {
    if (!entries?.length || loading || updating) return
    if (incremental) setUpdating(true)
    else setLoading(true)
    setError(null)
    try {
      if (incremental) {
        const currentProcessedIds = loadProcessedIds()
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 14)
        const cutoffStr = cutoff.toISOString().slice(0, 10)
        const newEntries = entries.filter(e =>
          e.entry_date >= cutoffStr && !currentProcessedIds.has(e.id)
        )
        if (newEntries.length === 0) {
          localStorage.setItem(HASH_KEY, recentHash)
          return
        }
        const result = await generateReminders(newEntries, daySummaries)
        const existing = dataRef.current || { reminders: [], answers: [], suggestions: [], alerts: [] }
        const merged = {
          reminders: [...(existing.reminders || []), ...(result.reminders || [])],
          answers: [...(existing.answers || []), ...(result.answers || [])],
          suggestions: [...(existing.suggestions || []), ...(result.suggestions || [])],
          alerts: [...(existing.alerts || []), ...(result.alerts || [])],
        }
        setData(merged)
        saveCachedReminders(merged, recentHash, user?.id)
      } else {
        const result = await generateReminders(entries, daySummaries)
        setData(result)
        saveCachedReminders(result, recentHash, user?.id)
        setDoneSet(new Set())
        saveDoneSet(new Set(), user?.id)
      }
      const allIds = new Set(entries.map(e => e.id))
      saveProcessedIds(allIds, user?.id)
      setProcessedIds(allIds)
    } catch (e) {
      setError(e.message || 'Failed to generate reminders')
    } finally {
      setLoading(false)
      setUpdating(false)
    }
  }, [entries, daySummaries, recentHash, loading, updating])

  // First-ever visit: auto-generate if no cache
  const autoGenDone = useRef(false)
  useEffect(() => {
    if (autoGenDone.current || !supabaseLoaded || !entries?.length || loading || updating) return
    autoGenDone.current = true
    const hasCache = !!loadCachedReminders()
    if (!hasCache) generate(false)
  }, [supabaseLoaded, entries?.length])

  // Auto-incremental update when new entries arrive
  const lastAutoCount = useRef(0)
  useEffect(() => {
    if (!supabaseLoaded || !data || loading || updating) return
    if (newEntryCount <= 0 || newEntryCount === lastAutoCount.current) return
    lastAutoCount.current = newEntryCount
    generate(true)
  }, [newEntryCount, supabaseLoaded, data])

  // Notifications: request permission and notify due reminders
  useEffect(() => {
    if (!data?.reminders?.length) return
    requestNotificationPermission().then(granted => {
      if (!granted) return
      const keyed = data.reminders.map((r, i) => ({ ...r, _key: `rem-${i}` }))
      showDueNotifications(keyed, doneSet)
    })
  }, [data])

  const toggleDone = (key) => {
    setDoneSet(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveDoneSet(next, user?.id)
      return next
    })
  }

  const [showArchived, setShowArchived] = useState(false)

  // Split reminders into active/archived
  const { activeReminders, archivedReminders } = useMemo(() => {
    if (!data?.reminders?.length) return { activeReminders: [], archivedReminders: [] }
    const sorted = data.reminders
      .map((rem, i) => ({ ...rem, _key: `rem-${i}` }))
      .sort((a, b) => {
        // Sort by due_date first, then source_date
        const da = a.due_date || a.source_date || ''
        const db = b.due_date || b.source_date || ''
        return da.localeCompare(db)
      })
    return {
      activeReminders: sorted.filter(r => !doneSet.has(r._key)),
      archivedReminders: sorted.filter(r => doneSet.has(r._key)),
    }
  }, [data?.reminders, doneSet])

  // Active answers and suggestions (not done)
  const activeAnswers = useMemo(() =>
    (data?.answers || []).map((a, i) => ({ ...a, _key: `ans-${i}` })).filter(a => !doneSet.has(a._key)),
    [data?.answers, doneSet]
  )
  const activesuggestions = useMemo(() =>
    (data?.suggestions || []).map((s, i) => ({ ...s, _key: `sug-${i}` })).filter(s => !doneSet.has(s._key)),
    [data?.suggestions, doneSet]
  )

  // ── Tab navigation ──────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0)
  const [slideDir, setSlideDir] = useState(0) // 1 = from right, -1 = from left
  const touchStartX = useRef(null)

  const goToTab = (idx) => {
    if (idx === activeTab) return
    setSlideDir(idx > activeTab ? 1 : -1)
    setActiveTab(idx)
  }
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - e.changedTouches[0].clientX
    if (delta > 50 && activeTab < 2) goToTab(activeTab + 1)
    else if (delta < -50 && activeTab > 0) goToTab(activeTab - 1)
    touchStartX.current = null
  }

  const tabs = [
    { label: 'Reminders', count: activeReminders.length },
    { label: 'Answers',   count: activeAnswers.length },
    { label: 'Suggestions', count: activesuggestions.length },
  ]

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text)', margin: 0 }}>
            Reminders
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: 4 }}>
            Smart insights from your recent entries
          </p>
        </div>
        {/* Re-analyze button */}
        <button
          onClick={() => generate(false)}
          disabled={loading || updating || !entries?.length}
          title="Re-analyze all entries"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 100, flexShrink: 0,
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: (loading || updating) ? 'var(--amber)' : 'var(--text-muted)',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.75rem',
            cursor: (loading || updating || !entries?.length) ? 'default' : 'pointer',
            opacity: !entries?.length ? 0.4 : 1,
            transition: 'all 0.2s',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {(loading || updating) ? (
            <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <RotateCcw size={13} />
          )}
          {(loading || updating) ? 'Updating...' : 'Re-analyze'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ShimmerCard height={80} />
          <ShimmerCard height={120} />
          <ShimmerCard height={100} />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{
          padding: '12px 16px', borderRadius: 14, fontSize: '0.85rem', marginBottom: 16,
          background: 'rgba(255,80,80,0.12)', color: '#dc3c3c',
          border: '1px solid rgba(255,80,80,0.2)',
        }}>{error}</div>
      )}

      {/* No entries */}
      {!loading && !entries?.length && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center' }}>
          <Bell size={36} style={{ color: 'var(--text-light)', marginBottom: 14, opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: 0 }}>
            Write some entries first — Clarity will find reminders, answer your questions, and give you smart suggestions.
          </p>
        </div>
      )}

      {/* Tab bar + content — shown when data loaded and entries exist */}
      {!loading && entries?.length > 0 && (
        <>
          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: 3, marginBottom: 16,
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 100, padding: 3,
          }}>
            {tabs.map((tab, i) => (
              <button
                key={i}
                onClick={() => goToTab(i)}
                style={{
                  flex: 1, padding: '8px 8px', borderRadius: 100,
                  background: activeTab === i ? 'rgba(255,255,255,0.28)' : 'transparent',
                  border: activeTab === i ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                  color: activeTab === i ? 'var(--navy)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.73rem',
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  backdropFilter: activeTab === i ? 'blur(8px)' : 'none',
                  WebkitBackdropFilter: activeTab === i ? 'blur(8px)' : 'none',
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    padding: '1px 6px', borderRadius: 100, fontSize: '0.62rem', fontWeight: 700,
                    background: activeTab === i ? 'rgba(42,42,69,0.12)' : 'rgba(255,255,255,0.15)',
                    color: activeTab === i ? 'var(--navy)' : 'var(--text-light)',
                    minWidth: 16, textAlign: 'center',
                  }}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Swipeable content */}
          <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div
              key={activeTab}
              style={{
                animation: slideDir !== 0
                  ? `${slideDir > 0 ? 'tabFromRight' : 'tabFromLeft'} 0.28s cubic-bezier(0.16,1,0.3,1) both`
                  : undefined,
              }}
            >
              {/* ── REMINDERS panel ── */}
              {activeTab === 0 && (
                <>
                  {activeReminders.length > 0 ? (
                    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeReminders.map((rem) => {
                          const due = formatDueDate(rem.due_date)
                          return (
                            <div key={rem._key} style={{
                              padding: '12px 14px', borderRadius: 12,
                              background: due?.isOverdue ? 'rgba(220,60,60,0.04)' : 'rgba(255,255,255,0.06)',
                              borderLeft: `3px solid ${due?.isOverdue ? '#dc3c3c' : due?.isToday ? 'var(--amber)' : 'var(--text-light)'}`,
                              display: 'flex', gap: 10, alignItems: 'flex-start',
                            }}>
                              <button onClick={() => toggleDone(rem._key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 1, color: 'var(--text-light)' }}>
                                <Square size={18} />
                              </button>
                              <div style={{ flex: 1 }}>
                                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.6 }}>{rem.text}</p>
                                {due && (
                                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', fontWeight: 600, color: due.isOverdue ? '#dc3c3c' : due.isToday ? 'var(--amber)' : 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {due.isOverdue ? '⚠ scaduto · ' : '📅 '}{due.label}
                                  </p>
                                )}
                                {rem.action_hint && (
                                  <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: 'var(--amber)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ExternalLink size={10} style={{ flexShrink: 0 }} />{rem.action_hint}
                                  </p>
                                )}
                                {rem.source_excerpt && (
                                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-light)', fontStyle: 'italic', lineHeight: 1.5 }}>
                                    "{rem.source_excerpt}" — {rem.source_date}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', marginBottom: '1rem' }}>
                      <CheckCircle2 size={32} style={{ color: '#3a8a6a', opacity: 0.4, marginBottom: 10 }} />
                      <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: 0 }}>No reminders found in recent entries.</p>
                    </div>
                  )}

                  {/* Done / archived */}
                  {archivedReminders.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowArchived(!showArchived)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-light)', fontSize: '0.78rem', fontFamily: 'var(--font-display)', fontWeight: 600, padding: '8px 0', width: '100%' }}
                      >
                        {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Archive size={13} />
                        Done ({archivedReminders.length})
                      </button>
                      {showArchived && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                          {archivedReminders.map((rem) => (
                            <div key={rem._key} style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(58,138,106,0.04)', borderLeft: '3px solid rgba(58,138,106,0.3)', display: 'flex', gap: 10, alignItems: 'center', opacity: 0.5 }}>
                              <button onClick={() => toggleDone(rem._key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, color: '#3a8a6a' }}>
                                <CheckSquare size={16} />
                              </button>
                              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5, textDecoration: 'line-through', flex: 1 }}>{rem.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── ANSWERS panel ── */}
              {activeTab === 1 && (
                activeAnswers.length > 0 ? (
                  <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {activeAnswers.map((ans) => (
                        <div key={ans._key} style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', borderLeft: '3px solid var(--amber)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <button onClick={() => toggleDone(ans._key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginTop: 2, color: 'var(--text-light)' }}>
                            <Square size={18} />
                          </button>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600, lineHeight: 1.5 }}>{ans.question}</p>
                            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>{ans.answer}</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                              {ans.source_date && <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-light)' }}>From entry on {ans.source_date}</p>}
                              {ans.search_query && (
                                <a href={`https://www.google.com/search?q=${encodeURIComponent(ans.search_query)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--amber)', textDecoration: 'none', fontWeight: 600 }}>
                                  <Search size={10} /> Learn more
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center' }}>
                    <MessageCircle size={32} style={{ color: 'var(--text-light)', opacity: 0.3, marginBottom: 10 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: 0 }}>No questions found in recent entries.</p>
                  </div>
                )
              )}

              {/* ── SUGGESTIONS panel ── */}
              {activeTab === 2 && (
                activesuggestions.length > 0 ? (
                  <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {activesuggestions.map((sug) => {
                        const config = suggestionTypeConfig[sug.type] || suggestionTypeConfig.info
                        const Icon = config.icon
                        return (
                          <div key={sug._key} style={{ padding: '12px 14px', borderRadius: 12, background: config.bg, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <Icon size={16} style={{ color: config.color, flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.7 }}>{sug.text}</p>
                              {sug.based_on && <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-light)', lineHeight: 1.5 }}>{sug.based_on}</p>}
                            </div>
                            <button onClick={() => toggleDone(sug._key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, color: 'var(--text-light)' }}>
                              <Square size={16} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center' }}>
                    <Lightbulb size={32} style={{ color: 'var(--text-light)', opacity: 0.3, marginBottom: 10 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: 0 }}>No suggestions yet based on recent entries.</p>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes tabFromRight {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes tabFromLeft {
          from { opacity: 0; transform: translateX(-28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  )
}

function ShimmerCard({ height = 120 }) {
  return (
    <div className="glass" style={{
      borderRadius: 'var(--radius-lg)', padding: 24, minHeight: height,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 'var(--radius)',
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.8s ease-in-out infinite',
      }} />
    </div>
  )
}
