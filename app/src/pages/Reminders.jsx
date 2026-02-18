import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { loadCachedSummaries, generateReminders, findMissedReminders } from '../lib/gemini'
import {
  Bell, Lightbulb, MessageCircle, AlertTriangle, CheckCircle2,
  RefreshCw, Search, ExternalLink, Square, CheckSquare,
  ChevronDown, ChevronRight, Archive,
} from 'lucide-react'

const CACHE_KEY = 'clarity_reminders'
const SEEN_KEY = 'clarity_reminders_seen'
const HASH_KEY = 'clarity_reminders_hash'
const DONE_KEY = 'clarity_reminders_done'
const PROCESSED_IDS_KEY = 'clarity_reminders_processed_ids'

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
  // Persist to Supabase (fire-and-forget)
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

const severityColors = {
  high: { color: '#dc3c3c', bg: 'rgba(220,60,60,0.10)', border: 'rgba(220,60,60,0.25)' },
  medium: { color: '#9a7030', bg: 'rgba(232,168,56,0.10)', border: 'rgba(232,168,56,0.25)' },
  low: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.08)', border: 'rgba(150,150,170,0.2)' },
}

const suggestionTypeConfig = {
  positive: { color: '#3a8a6a', bg: 'rgba(58,138,106,0.10)', icon: CheckCircle2 },
  warning: { color: '#9a7030', bg: 'rgba(232,168,56,0.10)', icon: AlertTriangle },
  info: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.08)', icon: Lightbulb },
}

const priorityOrder = { high: 0, medium: 1, low: 2 }

export default function Reminders() {
  const { user, entries } = useApp()
  const [data, setData] = useState(loadCachedReminders)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false) // incremental — keeps existing content visible
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [daySummaries, setDaySummaries] = useState({})
  const [doneSet, setDoneSet] = useState(loadDoneSet)
  const [supabaseLoaded, setSupabaseLoaded] = useState(false)

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

  // Load reminders from Supabase (wins over localStorage) — must complete before auto-generate
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
            try { localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(row.processed_ids)) } catch {}
          }
          if (row.entries_hash) {
            try { localStorage.setItem(HASH_KEY, row.entries_hash) } catch {}
          }
        }
      })
      .finally(() => setSupabaseLoaded(true))
  }, [user])

  // Sync processedIds with current entry IDs when reminders already exist
  // This prevents unnecessary regeneration when entry IDs changed (e.g. after Notion re-import)
  useEffect(() => {
    if (!supabaseLoaded || !data || !entries?.length) return
    const processedIds = loadProcessedIds()
    const currentIds = new Set(entries.map(e => e.id))
    // If most current entries are "unprocessed" but we already have data, re-sync IDs
    const unprocessedCount = entries.filter(e => !processedIds.has(e.id)).length
    if (unprocessedCount > entries.length * 0.5 && data.reminders?.length > 0) {
      saveProcessedIds(currentIds, user?.id)
    }
  }, [supabaseLoaded, data, entries?.length])

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
        // Find entries not yet processed
        const processedIds = loadProcessedIds()
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 14)
        const cutoffStr = cutoff.toISOString().slice(0, 10)
        const newEntries = entries.filter(e =>
          e.entry_date >= cutoffStr && !processedIds.has(e.id)
        )
        if (newEntries.length === 0) {
          // No new entries (e.g. deletion) — just update hash
          localStorage.setItem(HASH_KEY, recentHash)
          setLoading(false)
          return
        }
        const result = await generateReminders(newEntries, daySummaries)
        // Merge new results with existing data
        const existing = dataRef.current || { reminders: [], answers: [], suggestions: [], alerts: [] }
        const merged = {
          reminders: [...(existing.reminders || []), ...(result.reminders || [])],
          answers: [...(existing.answers || []), ...(result.answers || [])],
          suggestions: [...(existing.suggestions || []), ...(result.suggestions || [])],
          alerts: [...(existing.alerts || []), ...(result.alerts || [])],
        }
        setData(merged)
        saveCachedReminders(merged, recentHash, user?.id)
        // doneSet preserved — no clearing
      } else {
        // Full regeneration
        const result = await generateReminders(entries, daySummaries)
        setData(result)
        saveCachedReminders(result, recentHash, user?.id)
        setDoneSet(new Set())
        saveDoneSet(new Set(), user?.id)
      }
      // Update processed IDs to all current recent entry IDs
      const allIds = new Set(entries.map(e => e.id))
      saveProcessedIds(allIds, user?.id)
    } catch (e) {
      setError(e.message || 'Failed to generate reminders')
    } finally {
      setLoading(false)
      setUpdating(false)
    }
  }, [entries, daySummaries, recentHash, loading, updating])

  // Auto-generate: first visit = full, then only incremental for new entries
  // MUST wait for Supabase to load first to avoid regenerating cached data
  useEffect(() => {
    if (!supabaseLoaded || !recentHash || !entries?.length || loading) return
    const hasCache = !!loadCachedReminders()
    if (!hasCache) {
      generate(false) // first time ever — full generation
    } else {
      // Check if there are unprocessed entries → integrate incrementally
      const processedIds = loadProcessedIds()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 14)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      const hasNew = entries.some(e => e.entry_date >= cutoffStr && !processedIds.has(e.id))
      if (hasNew) generate(true) // incremental only — merge, never replace
    }
  }, [supabaseLoaded, recentHash, entries?.length]) // intentionally not including generate to avoid loops

  const scanMissed = useCallback(async () => {
    if (!entries?.length || scanning || loading) return
    setScanning(true)
    setError(null)
    try {
      const existing = dataRef.current || { reminders: [], answers: [], suggestions: [], alerts: [] }
      const result = await findMissedReminders(entries, existing)
      const hasNew = (result.reminders?.length || 0) + (result.answers?.length || 0) +
        (result.suggestions?.length || 0) + (result.alerts?.length || 0) > 0
      if (hasNew) {
        const merged = {
          reminders: [...(existing.reminders || []), ...(result.reminders || [])],
          answers: [...(existing.answers || []), ...(result.answers || [])],
          suggestions: [...(existing.suggestions || []), ...(result.suggestions || [])],
          alerts: [...(existing.alerts || []), ...(result.alerts || [])],
        }
        setData(merged)
        saveCachedReminders(merged, recentHash, user?.id)
      }
    } catch (e) {
      setError(e.message || 'Failed to scan for missed reminders')
    } finally {
      setScanning(false)
    }
  }, [entries, scanning, loading, recentHash, user])

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

  // Split reminders into active and archived, sorted by source_date (oldest first)
  const { activeReminders, archivedReminders } = useMemo(() => {
    if (!data?.reminders?.length) return { activeReminders: [], archivedReminders: [] }
    const sorted = data.reminders
      .map((rem, i) => ({ ...rem, _key: `rem-${i}` }))
      .sort((a, b) => (a.source_date || '').localeCompare(b.source_date || ''))
    return {
      activeReminders: sorted.filter(r => !doneSet.has(r._key)),
      archivedReminders: sorted.filter(r => doneSet.has(r._key)),
    }
  }, [data?.reminders, doneSet])

  const sectionAnim = (delay) => ({
    animation: mounted ? `slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both` : undefined,
  })

  const hasReminders = data?.reminders?.length > 0
  const hasAnswers = data?.answers?.length > 0
  const hasSuggestions = data?.suggestions?.length > 0
  const hasAlerts = data?.alerts?.length > 0
  const isEmpty = !hasReminders && !hasAnswers && !hasSuggestions && !hasAlerts

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text)', margin: 0 }}>
            Reminders
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: 4 }}>
            Smart insights from your recent entries
          </p>
        </div>
        {!loading && data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {updating && <RefreshCw size={13} style={{ color: 'var(--amber)', animation: 'spin 1s linear infinite' }} />}
            <button
              onClick={() => generate(false)}
              disabled={updating}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '.75rem', fontFamily: 'var(--font-display)', fontWeight: 600,
                opacity: updating ? 0.4 : 0.7, transition: 'opacity .2s',
              }}
              onMouseEnter={e => { if (!updating) e.currentTarget.style.opacity = 1 }}
              onMouseLeave={e => { if (!updating) e.currentTarget.style.opacity = 0.7 }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        )}
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

      {/* Empty results */}
      {!loading && data && isEmpty && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center' }}>
          <CheckCircle2 size={36} style={{ color: '#3a8a6a', marginBottom: 14, opacity: 0.5 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: 0 }}>
            Nothing actionable found in your recent entries. Keep writing and check back later!
          </p>
        </div>
      )}

      {/* ── REMINDERS (active) — first section ── */}
      {!loading && activeReminders.length > 0 && (
        <div className="glass" style={{
          borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem',
          ...sectionAnim(80),
        }}>
          <SectionHeader icon={Bell} title="Reminders" count={activeReminders.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeReminders.map((rem) => (
              <div key={rem._key} style={{
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                borderLeft: '3px solid var(--text-light)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <button
                  onClick={() => toggleDone(rem._key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, flexShrink: 0, marginTop: 1,
                    color: 'var(--text-light)', transition: 'color 0.2s',
                  }}
                >
                  <Square size={18} />
                </button>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.6 }}>
                    {rem.text}
                  </p>
                  {rem.action_hint && (
                    <p style={{
                      margin: '6px 0 0', fontSize: '0.76rem', color: 'var(--amber)',
                      lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <ExternalLink size={10} style={{ flexShrink: 0 }} />
                      {rem.action_hint}
                    </p>
                  )}
                  {rem.source_excerpt && (
                    <p style={{
                      margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-light)',
                      fontStyle: 'italic', lineHeight: 1.5,
                    }}>
                      "{rem.source_excerpt}" — {rem.source_date}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Find missed — inside card */}
          {!scanning ? (
            <button
              onClick={scanMissed}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', marginTop: 12, padding: '9px 0',
                background: 'none', border: '1px dashed rgba(150,150,170,0.25)',
                borderRadius: 10, cursor: 'pointer',
                color: 'var(--text-light)', fontSize: '0.75rem',
                fontFamily: 'var(--font-display)', fontWeight: 600,
                transition: 'color 0.2s, border-color 0.2s',
              }}
            >
              <Search size={12} />
              Find missed reminders
            </button>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="shimmer-pill" style={{ width: '100%', height: 12 }} />
              <div className="shimmer-pill" style={{ width: '75%', height: 12 }} />
            </div>
          )}
        </div>
      )}

      {/* ── ARCHIVED REMINDERS (collapsible) ── */}
      {!loading && archivedReminders.length > 0 && (
        <div style={{ marginBottom: '1.25rem', ...sectionAnim(100) }}>
          <button
            onClick={() => setShowArchived(!showArchived)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--text-light)', fontSize: '0.78rem',
              fontFamily: 'var(--font-display)', fontWeight: 600,
              padding: '8px 0', width: '100%',
              transition: 'color 0.2s',
            }}
          >
            {showArchived ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Archive size={13} />
            Archived ({archivedReminders.length})
          </button>
          {showArchived && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6,
              animation: 'slideUp 0.3s ease both',
            }}>
              {archivedReminders.map((rem) => (
                <div key={rem._key} style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(58,138,106,0.04)',
                  borderLeft: '3px solid rgba(58,138,106,0.3)',
                  display: 'flex', gap: 10, alignItems: 'center',
                  opacity: 0.5,
                }}>
                  <button
                    onClick={() => toggleDone(rem._key)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, flexShrink: 0, color: '#3a8a6a',
                    }}
                  >
                    <CheckSquare size={16} />
                  </button>
                  <p style={{
                    margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)',
                    lineHeight: 1.5, textDecoration: 'line-through', flex: 1,
                  }}>
                    {rem.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ALERTS ── */}
      {!loading && hasAlerts && (
        <div style={{ marginBottom: '1.25rem', ...sectionAnim(120) }}>
          {data.alerts
            .sort((a, b) => (priorityOrder[a.severity] || 2) - (priorityOrder[b.severity] || 2))
            .map((alert, i) => {
              const s = severityColors[alert.severity] || severityColors.medium
              return (
                <div key={i} style={{
                  padding: '14px 16px', borderRadius: 14, marginBottom: 10,
                  background: s.bg, border: `1px solid ${s.border}`,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                  <AlertTriangle size={18} style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <h4 style={{
                      fontFamily: 'var(--font-display)', fontWeight: 600,
                      fontSize: '0.88rem', color: s.color, margin: '0 0 4px',
                    }}>{alert.title}</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.7, margin: 0 }}>
                      {alert.detail}
                    </p>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ── ANSWERS (with search links) ── */}
      {!loading && hasAnswers && (
        <div className="glass" style={{
          borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem',
          ...sectionAnim(160),
        }}>
          <SectionHeader icon={MessageCircle} title="Answers" count={data.answers.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.answers.map((ans, i) => (
              <div key={i} style={{
                padding: '14px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                borderLeft: '3px solid var(--amber)',
              }}>
                <p style={{
                  margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text)',
                  fontWeight: 600, lineHeight: 1.5,
                }}>
                  {ans.question}
                </p>
                <p style={{
                  margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)',
                  lineHeight: 1.8,
                }}>
                  {ans.answer}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  {ans.source_date && (
                    <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-light)' }}>
                      From entry on {ans.source_date}
                    </p>
                  )}
                  {ans.search_query && (
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(ans.search_query)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.72rem', color: 'var(--amber)', textDecoration: 'none',
                        fontWeight: 600, opacity: 0.9,
                        transition: 'opacity 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0.9}
                    >
                      <Search size={10} /> Learn more
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUGGESTIONS ── */}
      {!loading && hasSuggestions && (
        <div className="glass" style={{
          borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem',
          ...sectionAnim(240),
        }}>
          <SectionHeader icon={Lightbulb} title="Suggestions" count={data.suggestions.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.suggestions.map((sug, i) => {
              const config = suggestionTypeConfig[sug.type] || suggestionTypeConfig.info
              const Icon = config.icon
              return (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 12,
                  background: config.bg,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <Icon size={16} style={{ color: config.color, flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.7 }}>
                      {sug.text}
                    </p>
                    {sug.based_on && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-light)', lineHeight: 1.5 }}>
                        {sug.based_on}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, count, extra }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Icon size={16} style={{ color: 'var(--text-muted)' }} />
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.05rem',
        color: 'var(--text)', margin: 0, fontWeight: 700, flex: 1,
      }}>{title}</h3>
      {extra && (
        <span style={{
          fontSize: '0.68rem', color: '#3a8a6a', fontWeight: 600,
          fontFamily: 'var(--font-display)',
        }}>{extra}</span>
      )}
      {count > 0 && (
        <span style={{
          padding: '2px 8px', borderRadius: 100, fontSize: '0.65rem',
          fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--text-light)',
        }}>{count}</span>
      )}
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
