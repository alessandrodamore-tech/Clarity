import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Milestone definitions ─────────────────────────────
const MILESTONE_DEFS = {
  firstEntry: { threshold: 1, field: 'entries', title: 'First Entry', description: 'You wrote your first journal entry!' },
  tenEntries: { threshold: 10, field: 'entries', title: '10 Entries', description: 'You have 10 entries -- keep going!' },
  firstAnalysis: { threshold: 1, field: 'analyzed', title: 'First Analysis', description: 'You ran your first AI analysis!' },
  thirtyEntries: { threshold: 30, field: 'entries', title: '30 Entries', description: 'Thirty entries! You are building a real picture of your mind.' },
}

const MILESTONES_KEY = 'clarity_milestones'

function loadMilestones() {
  try { return JSON.parse(localStorage.getItem(MILESTONES_KEY) || '{}') } catch { return {} }
}
function saveMilestones(m) {
  try { localStorage.setItem(MILESTONES_KEY, JSON.stringify(m)) } catch {}
}

// ─── useMilestones hook ─────────────────────────────────
export function useMilestones(entries, analyzedCount) {
  const [milestones, setMilestones] = useState(() => loadMilestones())
  const [newMilestone, setNewMilestone] = useState(null)
  const prevRef = useRef(milestones)

  useEffect(() => {
    const current = loadMilestones()
    const entryCount = entries?.length || 0
    let updated = false
    let latest = null

    for (const [key, def] of Object.entries(MILESTONE_DEFS)) {
      if (current[key]) continue
      const value = def.field === 'entries' ? entryCount : (analyzedCount || 0)
      if (value >= def.threshold) {
        current[key] = { reached: true, date: new Date().toISOString() }
        updated = true
        latest = { key, ...def }
      }
    }

    if (updated) {
      saveMilestones(current)
      setMilestones(current)
      if (latest) {
        setNewMilestone(latest)
        setTimeout(() => setNewMilestone(null), 7000)
      }
    }
  }, [entries?.length, analyzedCount])

  return { milestones, newMilestone }
}

// ─── MilestoneToast ─────────────────────────────────────
const toastKeyframes = `
@keyframes milestoneSlideUp {
  from { transform: translateX(-50%) translateY(100%); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
@keyframes milestoneSlideDown {
  from { transform: translateX(-50%) translateY(0); opacity: 1; }
  to { transform: translateX(-50%) translateY(100%); opacity: 0; }
}
`

export function MilestoneToast({ milestone, onDismiss }) {
  const [dismissing, setDismissing] = useState(false)
  const timerRef = useRef(null)

  const handleDismiss = useCallback(() => {
    setDismissing(true)
    setTimeout(() => { if (onDismiss) onDismiss() }, 400)
  }, [onDismiss])

  useEffect(() => {
    timerRef.current = setTimeout(handleDismiss, 6000)
    return () => clearTimeout(timerRef.current)
  }, [handleDismiss])

  if (!milestone) return null

  return (
    <>
      <style>{toastKeyframes}</style>
      <div style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999, width: 'calc(100% - 48px)', maxWidth: 360,
        animation: dismissing
          ? 'milestoneSlideDown 0.4s ease forwards'
          : 'milestoneSlideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        <div className="glass" style={{
          padding: '16px 20px', borderRadius: 'var(--radius)',
          borderLeft: '4px solid var(--amber)',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>
          <span style={{
            fontSize: '1.5rem', flexShrink: 0,
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(232,168,56,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {'\u2728'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '0.92rem', color: 'var(--navy)', marginBottom: 2,
            }}>
              {milestone.title}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {milestone.description}
            </div>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-light)', fontSize: '1.1rem', padding: 4,
              lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            {'\u00D7'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── FeatureHint ────────────────────────────────────────
export function FeatureHint({ id, children }) {
  const storageKey = `clarity_hint_${id}`
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(storageKey, '1') } catch {}
  }

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 12,
      background: 'rgba(232,168,56,0.06)',
      borderLeft: '3px solid var(--amber)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5,
      marginTop: 10,
    }}>
      <span style={{ flex: 1 }}>{children}</span>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-light)', fontSize: '0.95rem', padding: '0 2px',
          lineHeight: 1, flexShrink: 0,
        }}
        aria-label="Dismiss hint"
      >
        {'\u00D7'}
      </button>
    </div>
  )
}
