import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { loadCachedSummaries, generateAlerts } from '../lib/gemini'
import { stableKey } from '../lib/utils'
import {
  Bell, RefreshCw, RotateCcw, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, Heart, MessageCircle, Pill, Search, ExternalLink, X,
} from 'lucide-react'

const CACHE_KEY = 'clarity_alerts'
const SEEN_KEY = 'clarity_alerts_seen'
const HASH_KEY = 'clarity_alerts_hash'
const DISMISSED_KEY = 'clarity_alerts_dismissed'
const PROCESSED_IDS_KEY = 'clarity_alerts_processed_ids'
const NOTIF_KEY = 'clarity_notif_sent'

// Legacy keys for migration
const LEGACY_CACHE_KEY = 'clarity_reminders'
const LEGACY_HASH_KEY = 'clarity_reminders_hash'
const LEGACY_DONE_KEY = 'clarity_reminders_done'
const LEGACY_SEEN_KEY = 'clarity_reminders_seen'
const LEGACY_PROCESSED_KEY = 'clarity_reminders_processed_ids'

function hashEntries(entries) {
  return entries.map(e => e.id).sort().join('|')
}

function loadCachedAlerts() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null }
}

// Migrate old reminders data to alerts format
function migrateFromReminders() {
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_CACHE_KEY) || 'null')
    if (!old) return null

    const alerts = []

    // Convert suggestions → alerts (keep these, they're health-relevant)
    if (old.suggestions?.length) {
      for (const s of old.suggestions) {
        const typeMap = { positive: 'positive', warning: 'warning', info: 'pattern' }
        alerts.push({
          text: s.text,
          type: typeMap[s.type] || 'pattern',
          severity: s.type === 'warning' ? 'medium' : 'low',
          detail: s.based_on || '',
          source_dates: s.source_date ? [s.source_date] : [],
          source_excerpt: '',
        })
      }
    }

    // Convert answers → alerts
    if (old.answers?.length) {
      for (const a of old.answers) {
        alerts.push({
          text: a.question,
          type: 'answer',
          severity: 'low',
          detail: a.answer || '',
          source_dates: a.source_date ? [a.source_date] : [],
          source_excerpt: '',
          search_query: a.search_query,
        })
      }
    }

    // Skip reminders (to-do items) — intentionally dropped

    if (alerts.length > 0) {
      const data = { alerts }
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))

      // Migrate hash
      const hash = localStorage.getItem(LEGACY_HASH_KEY)
      if (hash) localStorage.setItem(HASH_KEY, hash)

      return data
    }
    return null
  } catch { return null }
}

// Atomic upsert to Supabase
function upsertAlertsToSupabase(userId) {
  if (!userId) return
  supabase.from('user_reminders').upsert({
    user_id: userId,
    reminders_data: loadCachedAlerts() || {},
    done_items: [...loadDismissedSet()],
    processed_ids: [...loadProcessedIds()],
    entries_hash: localStorage.getItem(HASH_KEY) || '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).then(({ error }) => {
    if (error) console.warn('Failed to save alerts to Supabase:', error)
  })
}

function saveCachedAlerts(data, hash, userId) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    localStorage.setItem(HASH_KEY, hash)
    localStorage.setItem(SEEN_KEY, Date.now().toString())
  } catch {}
  upsertAlertsToSupabase(userId)
}

function loadDismissedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')) } catch { return new Set() }
}

function saveDismissedSet(set, userId) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set])) } catch {}
  upsertAlertsToSupabase(userId)
}

function loadProcessedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(PROCESSED_IDS_KEY) || '[]')) } catch { return new Set() }
}

function saveProcessedIds(ids, userId) {
  try { localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify([...ids])) } catch {}
  upsertAlertsToSupabase(userId)
}

// ─── NOTIFICATIONS (only high severity warning/medication) ─
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

function showAlertNotifications(alerts, dismissedSet) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  let sent
  try { sent = new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')) } catch { sent = new Set() }
  const newSent = [...sent]

  alerts
    .filter(a => a.severity === 'high' && (a.type === 'warning' || a.type === 'medication'))
    .filter(a => !dismissedSet.has(a._key) && !sent.has(a._key))
    .slice(0, 3)
    .forEach(a => {
      new Notification('Clarity — Health Alert', {
        body: a.text,
        tag: a._key,
        icon: '/clarity-icon.png',
      })
      newSent.push(a._key)
    })

  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(newSent)) } catch {}
}

// ─── ALERT TYPE CONFIG ──────────────────────────────────
const alertTypeConfig = {
  warning:    { color: '#dc3c3c', bg: 'rgba(220,60,60,0.08)',   icon: AlertTriangle, label: 'Warning' },
  medication: { color: '#b37200', bg: 'rgba(232,168,56,0.08)',  icon: Pill,          label: 'Medication' },
  pattern:    { color: '#2a8a7a', bg: 'rgba(42,138,122,0.08)',  icon: TrendingUp,    label: 'Pattern' },
  positive:   { color: '#3a8a6a', bg: 'rgba(58,138,106,0.08)',  icon: Heart,         label: 'Positive' },
  answer:     { color: '#6a5aaa', bg: 'rgba(106,90,170,0.08)',  icon: MessageCircle, label: 'Answer' },
}

function addKeysToAlerts(alerts) {
  return (alerts || []).map(a => ({
    ...a,
    _key: stableKey(a.text, (a.source_dates || [])[0], 'alert'),
  }))
}

// Sort: high severity first, then medium, then low. Within same severity: warning > medication > pattern > answer > positive
function sortAlerts(alerts) {
  const sevRank = { high: 0, medium: 1, low: 2 }
  const typeRank = { warning: 0, medication: 1, pattern: 2, answer: 3, positive: 4 }
  return [...alerts].sort((a, b) => {
    const sa = sevRank[a.severity] ?? 2
    const sb = sevRank[b.severity] ?? 2
    if (sa !== sb) return sa - sb
    const ta = typeRank[a.type] ?? 5
    const tb = typeRank[b.type] ?? 5
    return ta - tb
  })
}

// ─── COMPONENT ────────────────────────────────────────────
export default function Alerts() {
  const { user, entries } = useApp()
  const [data, setData] = useState(() => {
    // Try new cache first, then migrate from old
    const cached = loadCachedAlerts()
    if (cached) return cached
    return migrateFromReminders()
  })
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [daySummaries, setDaySummaries] = useState({})
  const [dismissedSet, setDismissedSet] = useState(loadDismissedSet)
  const [supabaseLoaded, setSupabaseLoaded] = useState(false)
  const [processedIds, setProcessedIds] = useState(() => loadProcessedIds())
  const [expandedKey, setExpandedKey] = useState(null)

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

  // Load from Supabase
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
            // Handle both old format (reminders/answers/suggestions) and new (alerts)
            let alertData = row.reminders_data
            if (!alertData.alerts && (alertData.reminders || alertData.suggestions || alertData.answers)) {
              // Migrate old Supabase data
              const alerts = []
              if (alertData.suggestions?.length) {
                for (const s of alertData.suggestions) {
                  const typeMap = { positive: 'positive', warning: 'warning', info: 'pattern' }
                  alerts.push({
                    text: s.text, type: typeMap[s.type] || 'pattern',
                    severity: s.type === 'warning' ? 'medium' : 'low',
                    detail: s.based_on || '', source_dates: s.source_date ? [s.source_date] : [],
                    source_excerpt: '',
                  })
                }
              }
              if (alertData.answers?.length) {
                for (const a of alertData.answers) {
                  alerts.push({
                    text: a.question, type: 'answer', severity: 'low',
                    detail: a.answer || '', source_dates: a.source_date ? [a.source_date] : [],
                    source_excerpt: '', search_query: a.search_query,
                  })
                }
              }
              alertData = { alerts }
            }
            setData(alertData)
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(alertData)) } catch {}
          }
          if (row.done_items) {
            const set = new Set(row.done_items)
            setDismissedSet(set)
            try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(row.done_items)) } catch {}
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

  // Count new (unprocessed) entries
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
        const result = await generateAlerts(newEntries, daySummaries)
        const existing = dataRef.current || { alerts: [] }

        // Deduplicate
        const existingKeys = new Set(addKeysToAlerts(existing.alerts).map(a => a._key))
        const newAlerts = addKeysToAlerts(result.alerts || []).filter(a => !existingKeys.has(a._key))

        const merged = {
          alerts: [...(existing.alerts || []), ...newAlerts],
        }
        setData(merged)
        saveCachedAlerts(merged, recentHash, user?.id)
      } else {
        const result = await generateAlerts(entries, daySummaries)
        const alertData = { alerts: result.alerts || [] }
        setData(alertData)
        saveCachedAlerts(alertData, recentHash, user?.id)

        // Clean dismissed set: remove stale keys
        const newKeys = new Set(addKeysToAlerts(alertData.alerts).map(a => a._key))
        setDismissedSet(prev => {
          const next = new Set()
          for (const key of prev) {
            if (newKeys.has(key)) next.add(key)
          }
          saveDismissedSet(next, user?.id)
          return next
        })
      }
      const allIds = new Set(entries.map(e => e.id))
      saveProcessedIds(allIds, user?.id)
      setProcessedIds(allIds)
    } catch (e) {
      setError(e.message || 'Failed to generate alerts')
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
    const hasCache = !!loadCachedAlerts()
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

  // Notifications
  useEffect(() => {
    if (!data?.alerts?.length) return
    requestNotificationPermission().then(granted => {
      if (!granted) return
      const keyed = addKeysToAlerts(data.alerts)
      showAlertNotifications(keyed, dismissedSet)
    })
  }, [data])

  const dismiss = (key) => {
    setDismissedSet(prev => {
      const next = new Set(prev)
      next.add(key)
      saveDismissedSet(next, user?.id)
      return next
    })
  }

  // Active alerts (not dismissed), sorted
  const activeAlerts = useMemo(() => {
    if (!data?.alerts?.length) return []
    const keyed = addKeysToAlerts(data.alerts)
    const active = keyed.filter(a => !dismissedSet.has(a._key))
    return sortAlerts(active)
  }, [data?.alerts, dismissedSet])

  const dismissedAlerts = useMemo(() => {
    if (!data?.alerts?.length) return []
    const keyed = addKeysToAlerts(data.alerts)
    return keyed.filter(a => dismissedSet.has(a._key))
  }, [data?.alerts, dismissedSet])

  const [showDismissed, setShowDismissed] = useState(false)

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text)', margin: 0 }}>
            Alerts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: 4 }}>
            Health signals from your recent entries
          </p>
        </div>
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
          {(loading || updating) ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ShimmerCard height={80} />
          <ShimmerCard height={100} />
          <ShimmerCard height={80} />
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
            Write some entries first — Clarity will detect health patterns, medication effects, and wellness signals.
          </p>
        </div>
      )}

      {/* Updating indicator */}
      {updating && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '8px 14px', borderRadius: 100,
          background: 'rgba(232,168,56,0.08)', border: '1px solid rgba(232,168,56,0.15)',
          fontSize: '0.75rem', color: 'var(--amber)', fontWeight: 600,
        }}>
          <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
          Scanning new entries...
        </div>
      )}

      {/* Alert cards */}
      {!loading && entries?.length > 0 && activeAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeAlerts.map((alert) => {
            const config = alertTypeConfig[alert.type] || alertTypeConfig.pattern
            const Icon = config.icon
            const isExpanded = expandedKey === alert._key
            return (
              <div
                key={alert._key}
                className="alert-item glass"
                style={{ borderRadius: 'var(--radius)', padding: 0, overflow: 'hidden' }}
              >
                {/* Main row */}
                <div
                  onClick={() => setExpandedKey(isExpanded ? null : alert._key)}
                  style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                  }}
                >
                  {/* Severity dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 7,
                    background: alert.severity === 'high' ? '#dc3c3c' : alert.severity === 'medium' ? 'var(--amber)' : 'var(--text-light)',
                    boxShadow: alert.severity === 'high' ? '0 0 6px rgba(220,60,60,0.4)' : 'none',
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Type pill */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 100,
                        background: config.bg, color: config.color,
                        fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-display)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        <Icon size={10} />
                        {config.label}
                      </span>
                    </div>

                    {/* Headline */}
                    <p style={{
                      margin: 0, fontSize: '0.88rem', color: 'var(--text)',
                      lineHeight: 1.5, fontWeight: 500,
                    }}>
                      {alert.text}
                    </p>
                  </div>

                  {/* Expand/dismiss controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(alert._key) }}
                      title="Dismiss"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 4, color: 'var(--text-light)', opacity: 0.5,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <X size={14} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-light)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-light)' }} />}
                  </div>
                </div>

                {/* Expandable detail */}
                {isExpanded && alert.detail && (
                  <div style={{
                    padding: '0 16px 14px 36px',
                    animation: 'alertDetailIn 0.2s ease both',
                  }}>
                    <p style={{
                      margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)',
                      lineHeight: 1.8,
                    }}>
                      {alert.detail}
                    </p>

                    {/* Source excerpt */}
                    {alert.source_excerpt && (
                      <p style={{
                        margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-light)',
                        fontStyle: 'italic', lineHeight: 1.5,
                        borderLeft: '2px solid rgba(255,255,255,0.2)',
                        paddingLeft: 10,
                      }}>
                        "{alert.source_excerpt}"
                        {alert.source_dates?.length > 0 && (
                          <span style={{ fontStyle: 'normal' }}> — {alert.source_dates[0]}</span>
                        )}
                      </p>
                    )}

                    {/* Search query for answers */}
                    {alert.type === 'answer' && alert.search_query && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(alert.search_query)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          marginTop: 8, fontSize: '0.72rem', color: 'var(--amber)',
                          textDecoration: 'none', fontWeight: 600,
                        }}
                      >
                        <Search size={10} /> Learn more
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state (has entries but no alerts) */}
      {!loading && entries?.length > 0 && activeAlerts.length === 0 && data?.alerts && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center' }}>
          <Heart size={32} style={{ color: '#3a8a6a', opacity: 0.4, marginBottom: 10 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: 0 }}>
            No active alerts. Keep journaling — Clarity watches for health signals automatically.
          </p>
        </div>
      )}

      {/* Dismissed alerts */}
      {dismissedAlerts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'var(--text-light)', fontSize: '0.78rem',
              fontFamily: 'var(--font-display)', fontWeight: 600,
              padding: '8px 0', width: '100%',
            }}
          >
            {showDismissed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Dismissed ({dismissedAlerts.length})
          </button>
          {showDismissed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {dismissedAlerts.map((alert) => {
                const config = alertTypeConfig[alert.type] || alertTypeConfig.pattern
                return (
                  <div key={alert._key} style={{
                    padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', gap: 10, alignItems: 'center', opacity: 0.5,
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 100,
                      background: config.bg, color: config.color,
                      fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
                    }}>
                      {config.label}
                    </span>
                    <p style={{
                      margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)',
                      lineHeight: 1.5, flex: 1,
                    }}>{alert.text}</p>
                    <button
                      onClick={() => {
                        setDismissedSet(prev => {
                          const next = new Set(prev)
                          next.delete(alert._key)
                          saveDismissedSet(next, user?.id)
                          return next
                        })
                      }}
                      title="Restore"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-light)', fontSize: '0.68rem', fontWeight: 600,
                        fontFamily: 'var(--font-display)', padding: '2px 6px', flexShrink: 0,
                      }}
                    >
                      Restore
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes alertDetailIn {
          from { opacity: 0; max-height: 0; }
          to   { opacity: 1; max-height: 400px; }
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
