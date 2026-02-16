import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../lib/store'
import { generateGlobalInsights, extractDayData, loadCachedSummaries } from '../lib/gemini'

const PASTEL = ['#f6c177','#eb6f92','#9ccfd8','#c4a7e7','#ebbcba','#f2cdcd','#a6d189','#e5c890']
const HOUR_BUCKETS = [
  { label: 'Night', range: '12am–6am', hours: [0,1,2,3,4,5], color: '#c4a7e7' },
  { label: 'Morning', range: '6am–12pm', hours: [6,7,8,9,10,11], color: '#f6c177' },
  { label: 'Afternoon', range: '12pm–6pm', hours: [12,13,14,15,16,17], color: '#9ccfd8' },
  { label: 'Evening', range: '6pm–12am', hours: [18,19,20,21,22,23], color: '#eb6f92' },
]

const fmt = d => new Date(d+'T00:00:00').toLocaleDateString('en',{month:'short',day:'numeric'})
const fmtFull = d => new Date(d+'T00:00:00').toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric',year:'numeric'})

export default function Trends() {
  const { user, entries } = useApp()
  const [tooltip, setTooltip] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [aiState, setAiState] = useState({ status:'idle', progress:0, total:0, error:null })
  const [insights, setInsights] = useState(() => {
    try { return JSON.parse(localStorage.getItem('clarity_global_insights')) } catch { return null }
  })
  const [analyzedDays, setAnalyzedDays] = useState(null)
  const scrollRef = useRef(null)
  const wordScrollRef = useRef(null)

  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  // === Data computations ===
  const dailyData = useMemo(() => {
    if (!entries?.length) return []
    const map = {}
    entries.forEach(e => {
      const d = e.entry_date
      if (!map[d]) map[d] = { date: d, count: 0, totalWords: 0 }
      map[d].count++
      map[d].totalWords += (e.text || '').split(/\s+/).filter(Boolean).length
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [entries])

  const dateRange = useMemo(() => {
    if (!dailyData.length) return ''
    return `${fmt(dailyData[0].date)} – ${fmt(dailyData[dailyData.length-1].date)}`
  }, [dailyData])

  const maxCount = useMemo(() => Math.max(1, ...dailyData.map(d => d.count)), [dailyData])
  const maxWords = useMemo(() => Math.max(1, ...dailyData.map(d => d.count ? d.totalWords/d.count : 0)), [dailyData])

  const timeDist = useMemo(() => {
    const counts = Array(24).fill(0)
    entries?.forEach(e => {
      if (e.entry_time) { const h = parseInt(e.entry_time.split(':')[0], 10); if (!isNaN(h)) counts[h]++ }
    })
    return HOUR_BUCKETS.map(b => ({ ...b, count: b.hours.reduce((s,h) => s+counts[h], 0) }))
  }, [entries])

  const maxTimeDist = useMemo(() => Math.max(1, ...timeDist.map(t => t.count)), [timeDist])

  const topDays = useMemo(() =>
    [...dailyData].sort((a,b) => b.count - a.count).slice(0, 5)
  , [dailyData])

  const factorFreq = useMemo(() => {
    if (!analyzedDays?.length) return []
    const freq = {}
    analyzedDays.forEach(day => {
      const factors = day.factors || day.detected_factors || []
      if (Array.isArray(factors)) factors.forEach(f => {
        const k = typeof f === 'string' ? f : f.name || f.factor || String(f)
        freq[k] = (freq[k]||0) + 1
      })
    })
    return Object.entries(freq).map(([name,count]) => ({name,count})).sort((a,b) => b.count - a.count).slice(0,12)
  }, [analyzedDays])

  const maxFactor = useMemo(() => Math.max(1, ...factorFreq.map(f => f.count)), [factorFreq])

  // === AI Analysis ===
  const runAnalysis = useCallback(async () => {
    if (!user?.id || !entries?.length) return
    setAiState({ status:'loading', progress:0, total:0, error:null })
    try {
      const cached = await loadCachedSummaries(user.id)
      const byDate = {}
      entries.forEach(e => { if (!byDate[e.entry_date]) byDate[e.entry_date] = []; byDate[e.entry_date].push(e) })
      const dates = Object.keys(byDate).sort()
      const needAnalysis = dates.filter(d => !cached[d])
      setAiState(s => ({ ...s, total: needAnalysis.length }))

      let allAnalyzed = Object.values(cached)
      const previousDays = [...allAnalyzed]

      for (let i = 0; i < needAnalysis.length; i++) {
        const d = needAnalysis[i]
        setAiState(s => ({ ...s, progress: i + 1 }))
        try {
          const result = await extractDayData(byDate[d], user.id, cached, previousDays)
          if (result) { allAnalyzed.push(result); previousDays.push(result); cached[d] = result }
        } catch {}
        if (i < needAnalysis.length - 1) await new Promise(r => setTimeout(r, 1500))
      }

      setAnalyzedDays(allAnalyzed)
      setAiState(s => ({ ...s, status:'generating' }))
      const result = await generateGlobalInsights(allAnalyzed)
      setInsights(result)
      localStorage.setItem('clarity_global_insights', JSON.stringify(result))
      setAiState({ status:'done', progress:0, total:0, error:null })
    } catch (err) {
      setAiState({ status:'error', progress:0, total:0, error: err.message || 'Analysis failed' })
    }
  }, [user, entries])

  // === Styles ===
  const styles = {
    page: { padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)' },
    h1: { fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text)', margin: 0 },
    sub: { color: 'var(--text-muted)', fontSize: '.9rem', marginTop: 4 },
    card: { borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' },
    cardTitle: { fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--text)', marginBottom: 12, margin: 0 },
    scrollWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' },
    tooltip: {
      position:'fixed', background:'var(--navy)', color:'var(--text)', padding:'6px 10px',
      borderRadius:'var(--radius)', fontSize:'.8rem', pointerEvents:'none', zIndex:99,
      boxShadow:'0 4px 12px rgba(0,0,0,.3)', whiteSpace:'nowrap'
    },
    btn: {
      background:'var(--amber)', color:'var(--navy)', border:'none', borderRadius:'var(--radius)',
      padding:'10px 24px', fontFamily:'var(--font-display)', fontSize:'.95rem', cursor:'pointer',
      fontWeight:600, transition:'transform .15s, opacity .15s'
    },
    progress: { width:'100%', height:6, borderRadius:3, background:'rgba(255,255,255,.1)', overflow:'hidden', marginTop:10 },
    progressBar: { height:'100%', borderRadius:3, background:'var(--amber)', transition:'width .3s' },
    statCard: {
      borderRadius:'var(--radius)', padding:'12px 16px', minWidth:120, textAlign:'center',
      flex:'0 0 auto'
    },
  }

  if (!entries?.length) return (
    <div style={styles.page}>
      <h1 style={styles.h1}>Insights</h1>
      <p style={{ ...styles.sub, marginTop: 20 }}>Start writing entries to see your trends here.</p>
    </div>
  )

  const barW = Math.max(18, Math.min(40, 600 / dailyData.length))
  const barGap = Math.max(2, barW * 0.15)
  const chartH = 160
  const svgW = dailyData.length * (barW + barGap)
  const wordChartH = 120

  return (
    <div style={styles.page}>
      {/* Tooltip */}
      {tooltip && <div style={{ ...styles.tooltip, left: tooltip.x+12, top: tooltip.y-30 }}>{tooltip.text}</div>}

      {/* Header */}
      <h1 style={styles.h1}>✨ Insights</h1>
      <p style={styles.sub}>{entries.length} entries · {dateRange}</p>

      {/* Activity Chart */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>📊 Daily Activity</h3>
        <div ref={scrollRef} style={styles.scrollWrap}>
          <svg width={Math.max(svgW, 300)} height={chartH + 30} style={{ display:'block' }}>
            {dailyData.map((d, i) => {
              const h = (d.count / maxCount) * chartH
              const x = i * (barW + barGap)
              const intensity = d.count / maxCount
              const color = intensity > 0.7 ? '#eb6f92' : intensity > 0.4 ? '#f6c177' : '#9ccfd8'
              return (
                <g key={d.date}
                  onMouseMove={e => setTooltip({ x:e.clientX, y:e.clientY, text:`${fmtFull(d.date)}: ${d.count} entries` })}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor:'pointer' }}>
                  <rect x={x} y={chartH - (mounted ? h : 0)} width={barW} height={mounted ? h : 0} rx={barW/4}
                    fill={color} opacity={0.85}
                    style={{ transition:`height .6s ease ${i*30}ms, y .6s ease ${i*30}ms` }}>
                  </rect>
                  {barW >= 24 && (
                    <text x={x+barW/2} y={chartH+16} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                      {fmt(d.date).replace(/\s/,'\n').split(' ')[0]}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Entry Length Chart */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>📝 Average Words per Entry</h3>
        <div ref={wordScrollRef} style={styles.scrollWrap}>
          <svg width={Math.max(svgW, 300)} height={wordChartH + 30} style={{ display:'block' }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c4a7e7" stopOpacity={0.5}/>
                <stop offset="100%" stopColor="#c4a7e7" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            {(() => {
              const pts = dailyData.map((d, i) => {
                const avg = d.count ? d.totalWords / d.count : 0
                const x = i * (barW + barGap) + barW/2
                const y = wordChartH - (avg / maxWords) * wordChartH
                return { x, y: mounted ? y : wordChartH, avg, date: d.date }
              })
              if (!pts.length) return null
              const line = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ')
              const area = line + ` L${pts[pts.length-1].x},${wordChartH} L${pts[0].x},${wordChartH} Z`
              return (
                <>
                  <path d={area} fill="url(#areaGrad)" style={{ transition:'d .6s ease' }}/>
                  <path d={line} fill="none" stroke="#c4a7e7" strokeWidth={2} strokeLinecap="round"
                    style={{ transition:'d .6s ease' }}/>
                  {pts.map((p,i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3} fill="#c4a7e7" stroke="var(--navy)" strokeWidth={1.5}
                      style={{ transition:'cy .6s ease', cursor:'pointer' }}
                      onMouseMove={e => setTooltip({ x:e.clientX, y:e.clientY, text:`${fmtFull(p.date)}: ${Math.round(p.avg)} words/entry` })}
                      onMouseLeave={() => setTooltip(null)}/>
                  ))}
                </>
              )
            })()}
          </svg>
        </div>
      </div>

      {/* Time of Day Distribution */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>🕐 When You Write</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {timeDist.map((b, i) => (
            <div key={b.label} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ width:80, fontSize:'.85rem', color:'var(--text-muted)', flexShrink:0 }}>
                {b.label}
              </span>
              <div style={{ flex:1, height:24, borderRadius:12, background:'rgba(255,255,255,.06)', overflow:'hidden', position:'relative' }}>
                <div style={{
                  width: mounted ? `${(b.count/maxTimeDist)*100}%` : '0%',
                  height:'100%', borderRadius:12, background:b.color, opacity:.8,
                  transition:`width .8s ease ${i*150}ms`,
                  display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:8
                }}>
                  {b.count > 0 && <span style={{ fontSize:'.75rem', color:'var(--navy)', fontWeight:600 }}>{b.count}</span>}
                </div>
              </div>
              <span style={{ fontSize:'.75rem', color:'var(--text-light)', width:60, flexShrink:0 }}>{b.range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Most Active Days */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>🔥 Most Active Days</h3>
        <div style={{ display:'flex', gap:10, overflowX:'auto', padding:'4px 0' }}>
          {topDays.map((d, i) => (
            <div key={d.date} className="glass" style={{ ...styles.statCard, background:`${PASTEL[i%PASTEL.length]}15` }}>
              <div style={{ fontSize:'1.4rem', fontWeight:700, color:PASTEL[i%PASTEL.length] }}>{d.count}</div>
              <div style={{ fontSize:'.78rem', color:'var(--text-muted)', marginTop:2 }}>{fmtFull(d.date)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Analysis */}
      <div className="glass" style={styles.card}>
        <h3 style={styles.cardTitle}>🧠 AI Analysis</h3>
        {aiState.status === 'idle' && !insights && (
          <button style={styles.btn} onClick={runAnalysis}
            onMouseDown={e => e.currentTarget.style.transform='scale(.97)'}
            onMouseUp={e => e.currentTarget.style.transform='scale(1)'}>
            Generate Insights
          </button>
        )}
        {aiState.status === 'idle' && insights && (
          <>
            <button style={{ ...styles.btn, marginBottom:16, fontSize:'.85rem', padding:'8px 16px', opacity:.8 }} onClick={runAnalysis}>
              Regenerate
            </button>
            <InsightDisplay insights={insights}/>
          </>
        )}
        {(aiState.status === 'loading' || aiState.status === 'generating') && (
          <div>
            <p style={{ color:'var(--text-muted)', fontSize:'.9rem', margin:'0 0 6px' }}>
              {aiState.status === 'generating' ? 'Generating insights…' : `Analyzing days… ${aiState.progress}/${aiState.total}`}
            </p>
            <div style={styles.progress}>
              <div style={{ ...styles.progressBar,
                width: aiState.status === 'generating' ? '90%' : aiState.total ? `${(aiState.progress/aiState.total)*80}%` : '5%'
              }}/>
            </div>
          </div>
        )}
        {aiState.status === 'done' && insights && <InsightDisplay insights={insights}/>}
        {aiState.status === 'error' && (
          <div>
            <p style={{ color:'#eb6f92', fontSize:'.9rem' }}>⚠️ {aiState.error}</p>
            <button style={{ ...styles.btn, marginTop:8 }} onClick={runAnalysis}>Retry</button>
          </div>
        )}
      </div>

      {/* Factor Frequency */}
      {factorFreq.length > 0 && (
        <div className="glass" style={styles.card}>
          <h3 style={styles.cardTitle}>💊 Detected Factors</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {factorFreq.map((f, i) => (
              <div key={f.name} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ width:100, fontSize:'.82rem', color:'var(--text-muted)', flexShrink:0, textTransform:'capitalize', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {f.name}
                </span>
                <div style={{ flex:1, height:20, borderRadius:10, background:'rgba(255,255,255,.06)', overflow:'hidden' }}>
                  <div style={{
                    width: mounted ? `${(f.count/maxFactor)*100}%` : '0%',
                    height:'100%', borderRadius:10, background:PASTEL[i%PASTEL.length], opacity:.75,
                    transition:`width .6s ease ${i*80}ms`
                  }}/>
                </div>
                <span style={{ fontSize:'.78rem', color:'var(--text-light)', width:24, textAlign:'right' }}>{f.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InsightDisplay({ insights }) {
  if (!insights) return null
  const sections = typeof insights === 'string'
    ? [{ title:'Insights', content: insights }]
    : [
        insights.correlations && { title:'🔗 Correlations', content: insights.correlations },
        insights.patterns && { title:'🔄 Patterns', content: insights.patterns },
        insights.mood_summary && { title:'😊 Mood Summary', content: insights.mood_summary },
        insights.moodSummary && { title:'😊 Mood Summary', content: insights.moodSummary },
        insights.recommendations && { title:'💡 Recommendations', content: insights.recommendations },
      ].filter(Boolean)

  if (!sections.length && typeof insights === 'object') {
    return <pre style={{ color:'var(--text)', fontSize:'.85rem', whiteSpace:'pre-wrap', margin:0 }}>{JSON.stringify(insights, null, 2)}</pre>
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {sections.map((s, i) => (
        <div key={i}>
          <h4 style={{ fontFamily:'var(--font-display)', color:'var(--text)', fontSize:'.95rem', margin:'0 0 6px' }}>{s.title}</h4>
          {typeof s.content === 'string'
            ? <p style={{ color:'var(--text-muted)', fontSize:'.88rem', margin:0, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{s.content}</p>
            : Array.isArray(s.content)
              ? <ul style={{ color:'var(--text-muted)', fontSize:'.88rem', margin:0, paddingLeft:18, lineHeight:1.6 }}>
                  {s.content.map((item, j) => <li key={j}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}
                </ul>
              : <p style={{ color:'var(--text-muted)', fontSize:'.88rem', margin:0 }}>{JSON.stringify(s.content)}</p>
          }
        </div>
      ))}
    </div>
  )
}
