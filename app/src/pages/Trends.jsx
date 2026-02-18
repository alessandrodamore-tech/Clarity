import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { loadCachedSummaries, generateGlobalInsights } from '../lib/gemini'
import WellnessHero from '../components/trends/WellnessHero'
import AnalysisReport from '../components/trends/AnalysisReport'
import DetailedStats from '../components/trends/DetailedStats'
import EmptyState from '../components/EmptyState'

const fmt = d => new Date(d+'T00:00:00').toLocaleDateString('en',{month:'short',day:'numeric'})

// ─── MAIN COMPONENT ───────────────────────────────────────
export default function Trends() {
  const navigate = useNavigate()
  const { user, entries } = useApp()
  const [tooltip, setTooltip] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const scrollRef = useRef(null)
  const wordScrollRef = useRef(null)

  // Analyzed days from Supabase cache
  const [daySummaries, setDaySummaries] = useState({})

  // AI Report — persisted in localStorage + Supabase
  const [report, setReport] = useState(() => {
    try { return JSON.parse(localStorage.getItem('clarity_global_report') || 'null') } catch { return null }
  })
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState(null)

  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  // Load day summaries from Supabase + localStorage
  useEffect(() => {
    if (!user?.id) return
    loadCachedSummaries(user.id).then(cache => setDaySummaries(cache))
  }, [user])

  // Load report from Supabase (wins over localStorage)
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('user_reports')
      .select('report_data')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.report_data) {
          setReport(data.report_data)
          try { localStorage.setItem('clarity_global_report', JSON.stringify(data.report_data)) } catch {}
        }
      })
  }, [user])

  // ─── CORE COMPUTATIONS ─────────────────────────────────
  const analyzedDays = useMemo(() =>
    Object.entries(daySummaries)
      .filter(([, data]) => data.entriesHash)
      .map(([date, data]) => ({
        date,
        summary: data.summary,
        insight: data.insight,
        substances: data.substances || [],
        factors: data.substances || data.actions || [],
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [daySummaries]
  )

  const analyzedCount = analyzedDays.length

  const handleGenerate = async () => {
    if (analyzedCount === 0 || reportLoading) return
    setReportLoading(true)
    setReportError(null)
    try {
      const result = await generateGlobalInsights(analyzedDays)
      setReport(result)
      try { localStorage.setItem('clarity_global_report', JSON.stringify(result)) } catch {}
      // Persist to Supabase
      if (user?.id) {
        supabase.from('user_reports').upsert({
          user_id: user.id,
          report_data: result,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }).then(({ error }) => {
          if (error) console.warn('Failed to save report to Supabase:', error)
        })
      }
    } catch (e) {
      setReportError(e.message || 'Failed to generate report')
    } finally {
      setReportLoading(false)
    }
  }

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

  const heatmapData = useMemo(() => {
    if (!entries?.length) return {}
    const map = {}
    entries.forEach(e => {
      const d = e.entry_date
      if (d) map[d] = (map[d] || 0) + 1
    })
    return map
  }, [entries])

  const dateRange = useMemo(() => {
    if (!dailyData.length) return ''
    return `${fmt(dailyData[0].date)} – ${fmt(dailyData[dailyData.length-1].date)}`
  }, [dailyData])

  const consistency = useMemo(() => {
    if (!dailyData.length) return { current: 0, longest: 0, last14: [], totalDays: 0 }
    const dateSet = new Set(dailyData.map(d => d.date))
    const today = new Date()
    const last14 = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      last14.push({ date: key, has: dateSet.has(key) })
    }
    let current = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (dateSet.has(d.toISOString().slice(0, 10))) current++
      else break
    }
    const sorted = [...dateSet].sort()
    let longest = 0, streak = 1
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i-1] + 'T00:00:00')
      const curr = new Date(sorted[i] + 'T00:00:00')
      if ((curr - prev) / 86400000 === 1) { streak++; longest = Math.max(longest, streak) }
      else streak = 1
    }
    longest = Math.max(longest, streak, current)
    return { current, longest, last14, totalDays: dateSet.size }
  }, [dailyData])

  // ─── STYLES ───────────────────────────────────────────
  const styles = {
    page: { padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)' },
    h1: { fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text)', margin: 0 },
    sub: { color: 'var(--text-muted)', fontSize: '.9rem', marginTop: 4 },
    card: { borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.25rem' },
    cardTitle: { fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--text)', marginBottom: 12, margin: 0, display: 'flex', alignItems: 'center', gap: 8 },
    scrollWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -0.5rem', padding: '0 0.5rem' },
    tooltip: {
      position:'fixed', background:'var(--navy)', color:'#fff', padding:'6px 10px',
      borderRadius:'var(--radius)', fontSize:'.8rem', pointerEvents:'none', zIndex:99,
      boxShadow:'0 4px 12px rgba(0,0,0,.3)', whiteSpace:'nowrap'
    },
  }

  // ─── EMPTY STATE ──────────────────────────────────────
  if (!entries?.length) return (
    <div style={styles.page}>
      <EmptyState
        icon="📊"
        title="Your trends are waiting"
        description="Write a few entries to start seeing patterns in your mood, energy, and habits."
        cta="Start writing"
        onAction={() => navigate('/app')}
      />
    </div>
  )

  return (
    <div style={styles.page}>
      {/* Tooltip */}
      {tooltip && <div style={{ ...styles.tooltip, left: tooltip.x+12, top: tooltip.y-30 }}>{tooltip.text}</div>}

      {/* Header */}
      <h1 style={styles.h1}>Trends</h1>
      <p style={styles.sub}>{entries.length} entries · {dateRange}</p>

      {/* Section 1: Wellness Snapshot (stats + heatmap only) */}
      <WellnessHero
        entries={entries} consistency={consistency}
        mounted={mounted} styles={styles}
        heatmapData={heatmapData}
      />

      {/* Section 2: AI Analysis Report */}
      <AnalysisReport
        report={report}
        loading={reportLoading}
        error={reportError}
        analyzedCount={analyzedCount}
        onGenerate={handleGenerate}
        mounted={mounted}
      />

      {/* Section 3: Detailed Stats */}
      <DetailedStats
        showStats={showStats} setShowStats={setShowStats}
        dailyData={dailyData} entries={entries}
        mounted={mounted} tooltip={tooltip} setTooltip={setTooltip}
        scrollRef={scrollRef} wordScrollRef={wordScrollRef} styles={styles}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
