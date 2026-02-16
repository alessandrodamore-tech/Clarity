import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../lib/store'
import { loadCachedSummaries } from '../lib/gemini'

const TYPE_COLORS = {
  medication: '#7c3aed',
  supplement: '#0d9668',
  caffeine: '#92600a',
  substance: '#c04040',
  exercise: '#2563eb',
  wellness: '#7c3aed',
  social: '#ea580c',
  therapy: '#0284c7',
  other: '#6b6b80',
}

const TYPE_META = {
  medication: { emoji: '💊', label: 'Medications' },
  supplement: { emoji: '🌿', label: 'Supplements' },
  caffeine: { emoji: '☕', label: 'Caffeine' },
  substance: { emoji: '🚬', label: 'Substances' },
  exercise: { emoji: '🏋️', label: 'Exercise' },
  wellness: { emoji: '🧘', label: 'Wellness' },
  social: { emoji: '👥', label: 'Social' },
  therapy: { emoji: '🧠', label: 'Therapy' },
  other: { emoji: '📌', label: 'Other' },
}

const TYPE_ORDER = ['medication', 'supplement', 'caffeine', 'substance', 'exercise', 'wellness', 'social', 'therapy', 'other']

export default function Factors() {
  const { user } = useApp()
  const [days, setDays] = useState({})
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (user?.id) loadCachedSummaries(user.id).then(setDays)
  }, [user?.id])

  const { groups, totalFactors, totalDays } = useMemo(() => {
    const map = {} // key -> { name, type, count, dates: [{ date, insight }] }
    const dayEntries = Object.entries(days).filter(([, v]) => v.summary)

    for (const [date, day] of dayEntries) {
      const actions = day.actions || day.substances || []
      for (const a of actions) {
        const type = a.type || 'other'
        const key = `${type}::${a.name}`
        if (!map[key]) map[key] = { name: a.name, type, count: 0, dates: [] }
        map[key].count++
        map[key].dates.push({ date, insight: day.insight })
      }
    }

    const all = Object.values(map)
    // Group by type
    const groups = {}
    for (const f of all) {
      if (!groups[f.type]) groups[f.type] = []
      groups[f.type].push(f)
    }
    // Sort each group by count desc
    for (const t in groups) groups[t].sort((a, b) => b.count - a.count)

    return { groups, totalFactors: all.length, totalDays: dayEntries.length }
  }, [days])

  const toggleExpand = (key) => setExpanded(prev => prev === key ? null : key)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.8rem', color: 'var(--text)', margin: 0 }}>
          Your Factors
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Clarity has detected {totalFactors} factors across {totalDays} days
        </p>
      </div>

      {/* Factor groups */}
      {TYPE_ORDER.filter(t => groups[t]?.length).map(type => {
        const meta = TYPE_META[type]
        const color = TYPE_COLORS[type]
        return (
          <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>{meta.emoji}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em', color }}>
                {meta.label}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>({groups[type].length})</span>
            </div>

            {groups[type].map(f => {
              const key = `${f.type}::${f.name}`
              const isOpen = expanded === key
              const sortedDates = [...f.dates].sort((a, b) => a.date.localeCompare(b.date))
              const first = sortedDates[0]?.date
              const last = sortedDates[sortedDates.length - 1]?.date

              return (
                <div key={key}>
                  <div
                    className="glass"
                    onClick={() => toggleExpand(key)}
                    style={{ padding: '14px 18px', cursor: 'pointer', transition: 'transform 0.15s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.92rem', color: 'var(--text)' }}>
                          {f.name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                          seen {f.count} of {totalDays} days
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.9rem', color: 'var(--text-light)',
                        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        transform: isOpen ? 'rotate(90deg)' : 'none',
                        display: 'inline-block',
                      }}>›</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.7rem', color: 'var(--text-light)' }}>
                      <span>First: {first}</span>
                      <span>Last: {last}</span>
                    </div>
                    {/* Frequency bar */}
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 8, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${(f.count / totalDays) * 100}%`, background: color, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{
                      padding: '12px 18px',
                      display: 'flex', flexDirection: 'column', gap: 8,
                      animation: 'slideUp 0.25s ease',
                    }}>
                      {sortedDates.map(d => (
                        <div key={d.date} style={{ paddingLeft: 10, borderLeft: `2px solid ${color}40` }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {d.date}
                          </span>
                          {d.insight && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
                              {d.insight.length > 200 ? d.insight.slice(0, 200) + '…' : d.insight}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {totalFactors === 0 && (
        <div className="glass" style={{ padding: 32, textAlign: 'center' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🔍</p>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)' }}>No factors detected yet</p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>Analyze your journal days to see what Clarity detects.</p>
        </div>
      )}
    </div>
  )
}
