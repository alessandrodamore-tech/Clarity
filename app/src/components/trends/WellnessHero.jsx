import { useState, useRef, useEffect } from 'react'
import { BarChart3, Flame } from 'lucide-react'

function buildHeatmapGrid(heatmapData) {
  const today = new Date()
  const todayDay = today.getDay() // 0=Sun
  // We want 7 rows (Mon=0..Sun=6) x ~16 weeks of columns
  // Go back 16 weeks from end of this week
  const numWeeks = 16
  const weeks = []
  const months = []

  // Find the most recent Sunday (end of current week row)
  // We lay out Mon(row0)..Sun(row6)
  // Current week ends on next Sunday or today if Sunday
  const endDate = new Date(today)
  // Move to end of this week (Sunday)
  endDate.setDate(endDate.getDate() + (7 - todayDay) % 7)

  // Start date is numWeeks weeks before the end date's Monday
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - (numWeeks * 7) + 1)
  // Adjust startDate to Monday
  const startDay = startDate.getDay()
  if (startDay !== 1) {
    const diff = startDay === 0 ? -6 : 1 - startDay
    startDate.setDate(startDate.getDate() + diff)
  }

  let currentDate = new Date(startDate)
  let currentWeek = []
  let lastMonth = -1

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay()
    // Convert to Mon=0..Sun=6
    const row = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const dateStr = currentDate.toISOString().slice(0, 10)
    const isFuture = currentDate > today

    if (row === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = []
    }

    // Track months for labels
    const month = currentDate.getMonth()
    if (month !== lastMonth) {
      months.push({ label: currentDate.toLocaleDateString('en', { month: 'short' }), weekIndex: weeks.length })
      lastMonth = month
    }

    currentWeek.push({
      date: dateStr,
      row,
      count: heatmapData[dateStr] || 0,
      isFuture,
      isToday: dateStr === today.toISOString().slice(0, 10),
    })

    currentDate.setDate(currentDate.getDate() + 1)
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)

  return { weeks, months }
}

function getHeatmapColor(count) {
  if (count === 0) return { bg: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }
  if (count === 1) return { bg: 'rgba(232,168,56,0.25)', border: 'none' }
  if (count === 2) return { bg: 'rgba(232,168,56,0.45)', border: 'none' }
  if (count === 3) return { bg: 'rgba(232,168,56,0.65)', border: 'none' }
  return { bg: 'rgba(232,168,56,0.9)', border: 'none' }
}

export default function WellnessHero({ entries, consistency, mounted, styles, heatmapData }) {
  const [heatmapTooltip, setHeatmapTooltip] = useState(null)
  const grid = buildHeatmapGrid(heatmapData || {})
  const heatmapRef = useRef(null)
  const [cellSize, setCellSize] = useState(12)
  const cellGap = 3
  const dayLabelWidth = 20
  const numWeeks = grid.weeks.length

  // Auto-size cells to fit container
  useEffect(() => {
    if (!heatmapRef.current || numWeeks === 0) return
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width - dayLabelWidth
      const size = Math.floor((available - (numWeeks - 1) * cellGap) / numWeeks)
      setCellSize(Math.max(8, Math.min(14, size)))
    })
    observer.observe(heatmapRef.current)
    return () => observer.disconnect()
  }, [numWeeks])
  const dayLabels = ['M', '', 'W', '', 'F', '', '']

  return (
    <>
      <div className="glass" style={{
        ...styles.card,
        padding: '1.5rem',
        marginTop: 16,
      }}>
        {/* Label */}
        <div style={{ marginBottom: 14 }}>
          <div className="trend-badge" style={{ background: 'rgba(150,150,170,0.1)', border: '1px solid rgba(150,150,170,0.2)' }}>
            <BarChart3 size={14} style={{ color: 'var(--text-light)' }} />
            <span style={{ color: 'var(--text-light)', fontFamily: 'var(--font-display)' }}>Your wellness</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Flame size={16} style={{ color: 'var(--amber)' }} />
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-display)' }}>{consistency.current}</span>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>day streak</span>
          </div>
          <div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{consistency.totalDays}</span>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>days tracked</span>
          </div>
          <div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{entries.length}</span>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>entries</span>
          </div>
        </div>

        {/* GitHub-style Heatmap */}
        <div ref={heatmapRef} style={{ position: 'relative' }}>
          {/* Heatmap tooltip */}
          {heatmapTooltip && (
            <div style={{
              position: 'fixed',
              left: heatmapTooltip.x + 12,
              top: heatmapTooltip.y - 36,
              background: 'var(--navy)',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: 'var(--radius)',
              fontSize: '.75rem',
              pointerEvents: 'none',
              zIndex: 99,
              boxShadow: '0 4px 12px rgba(0,0,0,.3)',
              whiteSpace: 'nowrap',
            }}>
              {heatmapTooltip.text}
            </div>
          )}

          {/* Month labels */}
          <div style={{ display: 'flex', marginLeft: 20, marginBottom: 4 }}>
            {grid.months.map((m, i) => {
              const nextStart = grid.months[i + 1]?.weekIndex ?? grid.weeks.length
              const span = nextStart - m.weekIndex
              return (
                <div key={`${m.label}-${i}`} style={{
                  width: span * (cellSize + cellGap),
                  fontSize: '.6rem',
                  color: 'var(--text-light)',
                  flexShrink: 0,
                }}>
                  {span >= 2 ? m.label : ''}
                </div>
              )
            })}
          </div>

          {/* Heatmap grid */}
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Day-of-week labels */}
            <div style={{
              display: 'flex', flexDirection: 'column', marginRight: 5,
              width: 15, flexShrink: 0,
            }}>
              {dayLabels.map((label, i) => (
                <div key={i} style={{
                  height: cellSize + cellGap,
                  display: 'flex', alignItems: 'center',
                  fontSize: '.55rem', color: 'var(--text-light)',
                  lineHeight: 1,
                }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks (columns) */}
            <div style={{ display: 'flex', gap: cellGap }}>
              {grid.weeks.map((week, weekIdx) => (
                <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: cellGap }}>
                  {Array.from({ length: 7 }, (_, rowIdx) => {
                    const cell = week.find(c => c.row === rowIdx)
                    if (!cell) {
                      return <div key={rowIdx} style={{ width: cellSize, height: cellSize }} />
                    }
                    if (cell.isFuture) {
                      return <div key={rowIdx} style={{ width: cellSize, height: cellSize }} />
                    }
                    const color = getHeatmapColor(cell.count)
                    const totalCells = weekIdx * 7 + rowIdx
                    return (
                      <div
                        key={rowIdx}
                        style={{
                          width: cellSize,
                          height: cellSize,
                          borderRadius: 2,
                          background: color.bg,
                          border: color.border,
                          cursor: 'default',
                          opacity: mounted ? 1 : 0,
                          transform: mounted ? 'scale(1)' : 'scale(0)',
                          transition: `opacity 0.3s ease ${totalCells * 3}ms, transform 0.3s ease ${totalCells * 3}ms`,
                          outline: cell.isToday ? '2px solid var(--amber)' : 'none',
                          outlineOffset: 1,
                        }}
                        onMouseMove={e => {
                          const dateLabel = new Date(cell.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
                          setHeatmapTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            text: `${dateLabel}: ${cell.count} ${cell.count === 1 ? 'entry' : 'entries'}`,
                          })
                        }}
                        onMouseLeave={() => setHeatmapTooltip(null)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 8,
            justifyContent: 'flex-end',
          }}>
            <span style={{ fontSize: '.55rem', color: 'var(--text-light)', marginRight: 4 }}>Less</span>
            {[0, 1, 2, 3, 4].map(level => {
              const color = getHeatmapColor(level)
              return (
                <div key={level} style={{
                  width: cellSize - 2,
                  height: cellSize - 2,
                  borderRadius: 2,
                  background: color.bg,
                  border: color.border,
                }} />
              )
            })}
            <span style={{ fontSize: '.55rem', color: 'var(--text-light)', marginLeft: 4 }}>More</span>
          </div>
        </div>
      </div>
    </>
  )
}
