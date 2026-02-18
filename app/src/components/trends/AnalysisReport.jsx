import { useState } from 'react'
import {
  Sparkles, Loader2, TrendingUp, TrendingDown, Minus, Activity,
  BarChart3, FlaskConical, Lightbulb, Clock, Beaker,
  ChevronDown, ChevronRight, Info,
} from 'lucide-react'

const trendConfig = {
  improving: { icon: TrendingUp, color: '#3a8a6a', bg: 'rgba(58,138,106,0.12)', label: 'Improving' },
  stable: { icon: Minus, color: 'var(--amber)', bg: 'rgba(232,168,56,0.12)', label: 'Stable' },
  declining: { icon: TrendingDown, color: '#dc3c3c', bg: 'rgba(220,60,60,0.12)', label: 'Declining' },
  fluctuating: { icon: Activity, color: '#6a5aaa', bg: 'rgba(106,90,170,0.12)', label: 'Fluctuating' },
}

const impactColors = {
  positive: { color: '#3a8a6a', bg: 'rgba(58,138,106,0.12)', border: 'rgba(58,138,106,0.25)' },
  negative: { color: '#dc3c3c', bg: 'rgba(220,60,60,0.12)', border: 'rgba(220,60,60,0.25)' },
  neutral: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.1)', border: 'rgba(150,150,170,0.2)' },
  mixed: { color: '#9a7030', bg: 'rgba(232,168,56,0.12)', border: 'rgba(232,168,56,0.25)' },
  unknown: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.1)', border: 'rgba(150,150,170,0.2)' },
}

const priorityColors = {
  high: { color: '#dc3c3c', bg: 'rgba(220,60,60,0.12)', border: 'rgba(220,60,60,0.25)' },
  medium: { color: '#9a7030', bg: 'rgba(232,168,56,0.12)', border: 'rgba(232,168,56,0.25)' },
  low: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.1)', border: 'rgba(150,150,170,0.2)' },
}

function ImpactPill({ value }) {
  const c = impactColors[value] || impactColors.neutral
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 100, fontSize: '0.6rem',
      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>{value}</span>
  )
}

function ConfidenceBar({ pct }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div style={{
        flex: 1, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 2,
          background: pct >= 70 ? '#3a8a6a' : pct >= 40 ? 'var(--amber)' : '#dc3c3c',
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, minWidth: 30 }}>
        {pct}%
      </span>
    </div>
  )
}

function SectionHeader({ number, title, icon: Icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 16, paddingBottom: 10,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{
        fontFamily: 'var(--font-display)', fontSize: '0.7rem',
        color: 'var(--amber)', fontWeight: 700, opacity: 0.6,
      }}>{number}</span>
      {Icon && <Icon size={16} style={{ color: 'var(--text-muted)' }} />}
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.05rem',
        color: 'var(--text)', margin: 0, fontWeight: 700,
      }}>{title}</h3>
    </div>
  )
}

function SubItem({ children, accentColor, style: extraStyle }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: 'rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${accentColor || 'rgba(255,255,255,0.15)'}`,
      ...extraStyle,
    }}>
      {children}
    </div>
  )
}

function CollapsibleList({ items, renderItem, initialCount = 3 }) {
  const [expanded, setExpanded] = useState(false)
  if (!items?.length) return null
  const visible = expanded ? items : items.slice(0, initialCount)
  const remaining = items.length - initialCount

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((item, i) => renderItem(item, i))}
      </div>
      {remaining > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '8px 16px', marginTop: 10,
            color: 'var(--text-muted)', fontSize: '.78rem', fontWeight: 600,
            fontFamily: 'var(--font-display)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            transition: 'background 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.target.style.background = 'none'; e.target.style.color = 'var(--text-muted)' }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Show less' : `Show ${remaining} more`}
        </button>
      )}
    </>
  )
}

export default function AnalysisReport({
  report, loading, error, analyzedCount, onGenerate, mounted,
}) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
        <ShimmerCard height={100} />
        <ShimmerCard height={200} />
        <ShimmerCard height={160} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '12px 16px', borderRadius: 14, fontSize: '0.85rem', marginBottom: 16,
        background: 'rgba(255,80,80,0.12)', color: '#dc3c3c',
        border: '1px solid rgba(255,80,80,0.2)',
      }}>{error}</div>
    )
  }

  // Generate CTA when no report
  if (!report) {
    if (analyzedCount === 0) {
      return (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-light)', fontSize: '.82rem', margin: 0 }}>
            Analyze some days first (tap a day in your feed → analyze) to generate your wellness report.
          </p>
        </div>
      )
    }

    return (
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem', marginBottom: '1.25rem', textAlign: 'center' }}>
        <Sparkles size={36} style={{ color: 'var(--amber)', marginBottom: 14, opacity: 0.6 }} />
        <h3 style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
          color: 'var(--text)', marginBottom: 8,
        }}>Generate your wellness report</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.7, maxWidth: 340, margin: '0 auto 16px' }}>
          A comprehensive AI analysis of your patterns, medications, and recommendations across {analyzedCount} analyzed days.
        </p>
        <button
          className="btn-amber"
          onClick={onGenerate}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.85rem', padding: '10px 20px' }}
        >
          <Sparkles size={14} /> Generate Report
        </button>
      </div>
    )
  }

  // ─── RENDER REPORT ─────────────────────────────────────
  const sectionAnim = (delay) => ({
    animation: mounted ? `slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both` : undefined,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Disclaimer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 12,
        background: 'rgba(150,150,170,0.06)',
        border: '1px solid rgba(150,150,170,0.12)',
      }}>
        <Info size={14} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-light)', lineHeight: 1.5 }}>
          This report is AI-generated and for informational purposes only. It is not medical advice. Always consult a qualified healthcare professional.
        </p>
      </div>

      {/* ── Executive Summary + Mood Trend ── */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(0) }}>
        {/* Mood badge + refresh */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          {report.mood_trend && report.mood_trend !== 'unknown' ? (() => {
            const t = trendConfig[report.mood_trend] || trendConfig.stable
            const Icon = t.icon
            return (
              <div className="trend-badge" style={{ background: t.bg, border: `1px solid ${t.color}22` }}>
                <Icon size={16} style={{ color: t.color }} />
                <span style={{ color: t.color, fontFamily: 'var(--font-display)' }}>{t.label}</span>
              </div>
            )
          })() : <div />}
          <button
            onClick={onGenerate}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '.75rem', fontFamily: 'var(--font-display)',
              fontWeight: 600, opacity: 0.7,
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'opacity .2s',
            }}
            onMouseEnter={e => e.target.style.opacity = 1}
            onMouseLeave={e => e.target.style.opacity = 0.7}
          >
            <Sparkles size={12} /> Refresh
          </button>
        </div>

        {report.executive_summary && (
          <p style={{
            color: 'var(--text)', fontSize: '0.88rem', lineHeight: 1.8,
            margin: 0, fontStyle: 'italic',
          }}>
            "{report.executive_summary}"
          </p>
        )}
      </div>

      {/* ── 01 Confirmed Observations ── */}
      {report.confirmed_observations?.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(80) }}>
          <SectionHeader number="01" title="Confirmed Observations" icon={BarChart3} />
          <CollapsibleList
            items={report.confirmed_observations}
            renderItem={(obs, i) => {
              const c = impactColors[obs.impact] || impactColors.neutral
              return (
                <SubItem key={i} accentColor={c.color}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                    <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', margin: 0 }}>
                      {obs.title}
                    </h4>
                    <ImpactPill value={obs.impact} />
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.8, margin: 0 }}>
                    {obs.detail}
                  </p>
                </SubItem>
              )
            }}
          />
        </div>
      )}

      {/* ── 02 Hypotheses ── */}
      {report.hypotheses?.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(160) }}>
          <SectionHeader number="02" title="Hypotheses" icon={FlaskConical} />
          <CollapsibleList
            items={report.hypotheses}
            renderItem={(h, i) => (
              <SubItem key={i} accentColor="var(--amber)">
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', margin: '0 0 6px' }}>
                  {h.title}
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.8, margin: '0 0 8px' }}>
                  {h.detail}
                </p>
                <ConfidenceBar pct={h.confidence_pct || 50} />
                {(h.evidence_for || h.evidence_against) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {h.evidence_for && (
                      <div style={{ fontSize: '0.78rem', color: '#3a8a6a', lineHeight: 1.6 }}>
                        <strong>+</strong> {h.evidence_for}
                      </div>
                    )}
                    {h.evidence_against && (
                      <div style={{ fontSize: '0.78rem', color: '#dc3c3c', lineHeight: 1.6 }}>
                        <strong>-</strong> {h.evidence_against}
                      </div>
                    )}
                  </div>
                )}
                {h.test_suggestion && (
                  <div style={{
                    marginTop: 10, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(232,168,56,0.06)', fontSize: '0.78rem',
                    color: 'var(--text)', lineHeight: 1.6,
                  }}>
                    <strong style={{ color: 'var(--amber)' }}>Test:</strong> {h.test_suggestion}
                  </div>
                )}
              </SubItem>
            )}
          />
        </div>
      )}

      {/* ── 03 Medication & Substance Analysis ── */}
      {report.medication_substance_analysis?.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(240) }}>
          <SectionHeader number="03" title="Medication & Substance Analysis" icon={Activity} />
          <CollapsibleList
            items={report.medication_substance_analysis}
            initialCount={4}
            renderItem={(med, i) => (
              <SubItem key={i} accentColor={med.type === 'medication' ? '#7c3aed' : med.type === 'caffeine' ? '#92600a' : '#6b6b80'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)', margin: 0 }}>
                    {med.name}
                  </h4>
                  {med.frequency && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 100, fontSize: '0.6rem',
                      fontWeight: 600, background: 'rgba(150,150,170,0.1)', color: 'var(--text-light)',
                      whiteSpace: 'nowrap',
                    }}>{med.frequency}</span>
                  )}
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.8, margin: '0 0 8px' }}>
                  {med.observed_effects}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {med.mood_impact && <ImpactPill value={`mood: ${med.mood_impact}`} />}
                  {med.energy_impact && <ImpactPill value={`energy: ${med.energy_impact}`} />}
                  {med.focus_impact && med.focus_impact !== 'unknown' && <ImpactPill value={`focus: ${med.focus_impact}`} />}
                </div>
                {med.timing_notes && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.6 }}>
                    <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {med.timing_notes}
                  </p>
                )}
                {med.interactions && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.6 }}>
                    {med.interactions}
                  </p>
                )}
                {med.concerns && (
                  <p style={{ fontSize: '0.78rem', color: '#dc3c3c', margin: '4px 0 0', lineHeight: 1.6, opacity: 0.85 }}>
                    {med.concerns}
                  </p>
                )}
              </SubItem>
            )}
          />
        </div>
      )}

      {/* ── 04 Recommendations ── */}
      {report.recommendations?.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(320) }}>
          <SectionHeader number="04" title="Recommendations" icon={Lightbulb} />
          <CollapsibleList
            items={report.recommendations}
            initialCount={4}
            renderItem={(rec, i) => {
              const p = priorityColors[rec.priority] || priorityColors.medium
              return (
                <SubItem key={i} accentColor={p.color}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.6, fontWeight: 600 }}>
                      {rec.action}
                    </p>
                    <span style={{
                      padding: '2px 8px', borderRadius: 100, fontSize: '0.58rem',
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      background: p.bg, color: p.color, border: `1px solid ${p.border}`,
                      whiteSpace: 'nowrap',
                    }}>{rec.priority}</span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.8, margin: '0 0 4px' }}>
                    {rec.rationale}
                  </p>
                  {rec.expected_impact && (
                    <p style={{ fontSize: '0.78rem', color: '#3a8a6a', margin: 0, lineHeight: 1.6 }}>
                      → {rec.expected_impact}
                    </p>
                  )}
                </SubItem>
              )
            }}
          />
        </div>
      )}

      {/* ── 05 Ideal Routine ── */}
      {report.ideal_routine && (report.ideal_routine.description || report.ideal_routine.schedule?.length > 0) && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(400) }}>
          <SectionHeader number="05" title="Ideal Routine" icon={Clock} />
          {report.ideal_routine.description && (
            <p style={{ color: 'var(--text)', fontSize: '0.88rem', lineHeight: 1.8, margin: '0 0 16px' }}>
              {report.ideal_routine.description}
            </p>
          )}
          {report.ideal_routine.schedule?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {report.ideal_routine.schedule.map((slot, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 16, alignItems: 'flex-start',
                  padding: '12px 0',
                  borderBottom: i < report.ideal_routine.schedule.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: '0.78rem',
                    color: 'var(--amber)', fontWeight: 600, minWidth: 80, flexShrink: 0,
                    paddingTop: 1,
                  }}>
                    {slot.time_block}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)', fontWeight: 600, lineHeight: 1.5 }}>
                      {slot.activity}
                    </p>
                    {slot.rationale && (
                      <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        {slot.rationale}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 06 Experiments ── */}
      {report.experiments?.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.5rem', ...sectionAnim(480) }}>
          <SectionHeader number="06" title="Experiments to Try" icon={Beaker} />
          <CollapsibleList
            items={report.experiments}
            renderItem={(exp, i) => (
              <SubItem key={i} accentColor="#6a5aaa">
                <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', margin: '0 0 6px' }}>
                  {exp.title}
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.8, margin: '0 0 8px' }}>
                  {exp.description}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {exp.duration && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 100, fontSize: '0.65rem',
                      fontWeight: 600, background: 'rgba(106,90,170,0.12)', color: '#6a5aaa',
                    }}>{exp.duration}</span>
                  )}
                  {exp.measure && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 100, fontSize: '0.65rem',
                      fontWeight: 600, background: 'rgba(150,150,170,0.1)', color: 'var(--text-light)',
                    }}>{exp.measure}</span>
                  )}
                </div>
                {exp.hypothesis && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6, fontStyle: 'italic' }}>
                    Hypothesis: {exp.hypothesis}
                  </p>
                )}
              </SubItem>
            )}
          />
        </div>
      )}

      {/* Suggestion to analyze more days */}
      {analyzedCount < 5 && (
        <div style={{
          textAlign: 'center', padding: '12px', fontSize: '0.78rem',
          color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          Tip: Analyze more days for deeper, more accurate insights. You currently have {analyzedCount} analyzed day{analyzedCount !== 1 ? 's' : ''}.
        </div>
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
