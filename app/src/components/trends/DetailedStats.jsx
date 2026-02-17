import { useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const HOUR_BUCKETS = [
  { label: 'Night', range: '12am–6am', hours: [0,1,2,3,4,5], color: '#c4a7e7' },
  { label: 'Morning', range: '6am–12pm', hours: [6,7,8,9,10,11], color: '#f6c177' },
  { label: 'Afternoon', range: '12pm–6pm', hours: [12,13,14,15,16,17], color: '#9ccfd8' },
  { label: 'Evening', range: '6pm–12am', hours: [18,19,20,21,22,23], color: '#eb6f92' },
]

const fmtFull = d => new Date(d + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })

export default function DetailedStats({
  showStats, setShowStats, dailyData, entries, mounted,
  tooltip, setTooltip, scrollRef, wordScrollRef, styles,
}) {
  const timeDist = useMemo(() => {
    const counts = Array(24).fill(0)
    entries?.forEach(e => {
      if (e.entry_time) { const h = parseInt(e.entry_time.split(':')[0], 10); if (!isNaN(h)) counts[h]++ }
    })
    return HOUR_BUCKETS.map(b => ({ ...b, count: b.hours.reduce((s,h) => s+counts[h], 0) }))
  }, [entries])
  const barW = Math.max(18, Math.min(40, 600 / dailyData.length))
  const barGap = Math.max(2, barW * 0.15)
  const chartH = 160
  const yAxisW = 30
  const svgW = dailyData.length * (barW + barGap) + yAxisW
  const wordChartH = 120

  const maxCount = Math.max(1, ...dailyData.map(d => d.count))
  const maxWords = Math.max(1, ...dailyData.map(d => d.count ? d.totalWords / d.count : 0))
  const maxTimeDist = Math.max(1, ...timeDist.map(t => t.count))

  // Y-axis tick values for bar chart
  const barTicks = useMemo(() => {
    const mid = Math.round(maxCount / 2)
    return [0, mid, maxCount].filter((v, i, arr) => arr.indexOf(v) === i)
  }, [maxCount])

  // Y-axis tick values for word chart
  const wordTicks = useMemo(() => {
    const mid = Math.round(maxWords / 2)
    return [0, mid, Math.round(maxWords)].filter((v, i, arr) => arr.indexOf(v) === i)
  }, [maxWords])

  // Average words per entry
  const avgWords = useMemo(() => {
    if (!dailyData.length) return 0
    const vals = dailyData.filter(d => d.count > 0).map(d => d.totalWords / d.count)
    if (!vals.length) return 0
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }, [dailyData])

  return (
    <>
      <div
        className="stats-toggle"
        onClick={() => setShowStats(!showStats)}
        role="button"
        tabIndex={0}
      >
        {showStats ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
          {showStats ? 'Hide detailed stats' : 'Show detailed stats'}
        </span>
      </div>

      {showStats && (
        <div style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
          {/* Daily Activity Chart */}
          <div className="glass" style={styles.card}>
            <h3 style={styles.cardTitle}>
              <span style={{ fontSize: '1rem' }}>{'\uD83D\uDCCA'}</span>
              Daily Activity
            </h3>
            <div ref={scrollRef} style={styles.scrollWrap}>
              <svg
                viewBox={`0 0 ${Math.max(svgW, 330)} ${chartH + 30}`}
                width="100%"
                preserveAspectRatio="xMinYMid meet"
                style={{ display: 'block', minWidth: Math.max(svgW, 330) }}
              >
                <defs>
                  <linearGradient id="barGradHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#eb6f92" />
                    <stop offset="100%" stopColor="#eb6f92" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="barGradMed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f6c177" />
                    <stop offset="100%" stopColor="#f6c177" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="barGradLow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9ccfd8" />
                    <stop offset="100%" stopColor="#9ccfd8" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                {/* Y-axis grid lines and labels */}
                {barTicks.map(tick => {
                  const y = chartH - (tick / maxCount) * chartH
                  return (
                    <g key={`ytick-${tick}`}>
                      <line
                        x1={yAxisW} y1={y} x2={Math.max(svgW, 330)} y2={y}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={1}
                        strokeDasharray={tick === 0 ? 'none' : '4,4'}
                      />
                      <text
                        x={yAxisW - 4} y={y + 3}
                        textAnchor="end" fontSize={8} fill="var(--text-light)"
                      >
                        {tick}
                      </text>
                    </g>
                  )
                })}
                {dailyData.map((d, i) => {
                  const h = (d.count / maxCount) * chartH
                  const x = i * (barW + barGap) + yAxisW
                  const intensity = d.count / maxCount
                  const fill = intensity > 0.7 ? 'url(#barGradHigh)' : intensity > 0.4 ? 'url(#barGradMed)' : 'url(#barGradLow)'
                  return (
                    <g key={d.date}
                      onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, text: `${fmtFull(d.date)}: ${d.count} entries` })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'pointer' }}>
                      <rect x={x} y={chartH - (mounted ? h : 0)} width={barW} height={mounted ? h : 0} rx={barW / 4}
                        fill={fill}
                        style={{ transition: `height .6s ease ${i * 30}ms, y .6s ease ${i * 30}ms` }} />
                      {barW >= 24 && (
                        <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                          {fmt(d.date).replace(/\s/, '\n').split(' ')[0]}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>

          {/* Average Words per Entry */}
          <div className="glass" style={styles.card}>
            <h3 style={styles.cardTitle}>
              <span style={{ fontSize: '1rem' }}>{'\uD83D\uDCDD'}</span>
              Average Words per Entry
            </h3>
            <div ref={wordScrollRef} style={styles.scrollWrap}>
              <svg
                viewBox={`0 0 ${Math.max(svgW, 330)} ${wordChartH + 30}`}
                width="100%"
                preserveAspectRatio="xMinYMid meet"
                style={{ display: 'block', minWidth: Math.max(svgW, 330) }}
              >
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c4a7e7" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#c4a7e7" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                {/* Y-axis grid lines and labels */}
                {wordTicks.map(tick => {
                  const y = wordChartH - (tick / maxWords) * wordChartH
                  return (
                    <g key={`wtick-${tick}`}>
                      <line
                        x1={yAxisW} y1={y} x2={Math.max(svgW, 330)} y2={y}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={1}
                        strokeDasharray={tick === 0 ? 'none' : '4,4'}
                      />
                      <text
                        x={yAxisW - 4} y={y + 3}
                        textAnchor="end" fontSize={8} fill="var(--text-light)"
                      >
                        {tick}
                      </text>
                    </g>
                  )
                })}
                {(() => {
                  const pts = dailyData.map((d, i) => {
                    const avg = d.count ? d.totalWords / d.count : 0
                    const x = i * (barW + barGap) + barW / 2 + yAxisW
                    const y = wordChartH - (avg / maxWords) * wordChartH
                    return { x, y: mounted ? y : wordChartH, avg, date: d.date }
                  })
                  if (!pts.length) return null
                  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
                  const area = line + ` L${pts[pts.length - 1].x},${wordChartH} L${pts[0].x},${wordChartH} Z`

                  // Average reference line
                  const avgY = mounted ? wordChartH - (avgWords / maxWords) * wordChartH : wordChartH

                  return (
                    <>
                      <path d={area} fill="url(#areaGrad)" style={{ transition: 'd .6s ease' }} />
                      <path d={line} fill="none" stroke="#c4a7e7" strokeWidth={2} strokeLinecap="round"
                        style={{ transition: 'd .6s ease' }} />
                      {/* Average reference line */}
                      {avgWords > 0 && (
                        <>
                          <line
                            x1={yAxisW} y1={avgY}
                            x2={pts[pts.length - 1].x} y2={avgY}
                            stroke="#c4a7e7" strokeWidth={1}
                            strokeDasharray="6,4"
                            opacity={0.6}
                            style={{ transition: 'y1 .6s ease, y2 .6s ease' }}
                          />
                          <text
                            x={pts[pts.length - 1].x + 6} y={avgY + 3}
                            fontSize={8} fill="#c4a7e7" opacity={0.8}
                          >
                            avg {Math.round(avgWords)}
                          </text>
                        </>
                      )}
                      {pts.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#c4a7e7" stroke="var(--navy)" strokeWidth={1.5}
                          style={{ transition: 'cy .6s ease', cursor: 'pointer' }}
                          onMouseMove={e => setTooltip({ x: e.clientX, y: e.clientY, text: `${fmtFull(p.date)}: ${Math.round(p.avg)} words/entry` })}
                          onMouseLeave={() => setTooltip(null)} />
                      ))}
                    </>
                  )
                })()}
              </svg>
            </div>
          </div>

          {/* Time of Day Distribution */}
          <div className="glass" style={styles.card}>
            <h3 style={styles.cardTitle}>
              <span style={{ fontSize: '1rem' }}>{'\uD83D\uDD50'}</span>
              When You Write
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {timeDist.map((b, i) => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 80, fontSize: '.82rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {b.label}
                  </span>
                  <div style={{ flex: 1, height: 22, borderRadius: 11, background: 'rgba(255,255,255,.06)', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: mounted ? `${(b.count / maxTimeDist) * 100}%` : '0%',
                      height: '100%', borderRadius: 11, background: b.color, opacity: .8,
                      transition: `width .8s ease ${i * 150}ms`,
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8
                    }}>
                      {b.count > 0 && <span style={{ fontSize: '.7rem', color: 'var(--navy)', fontWeight: 600 }}>{b.count}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: '.7rem', color: 'var(--text-light)', width: 55, flexShrink: 0 }}>{b.range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
