import { useState, useEffect } from 'react'
import { useApp } from '../lib/store'
import { loadCachedSummaries, generateGlobalInsights } from '../lib/gemini'
import { Sparkles, TrendingUp, TrendingDown, Minus, Activity, ArrowUpRight, ArrowDownRight, Check, AlertCircle, Loader2, Brain, Zap, Calendar } from 'lucide-react'

const trendConfig = {
  improving: { icon: TrendingUp, color: '#3a8a6a', bg: 'rgba(58,138,106,0.12)', label: 'Improving' },
  stable: { icon: Minus, color: 'var(--amber)', bg: 'rgba(232,168,56,0.12)', label: 'Stable' },
  declining: { icon: TrendingDown, color: '#dc3c3c', bg: 'rgba(220,60,60,0.12)', label: 'Declining' },
  fluctuating: { icon: Activity, color: '#6a5aaa', bg: 'rgba(106,90,170,0.12)', label: 'Fluctuating' },
}

const confidenceColors = {
  high: { bg: 'rgba(58,138,106,0.15)', color: '#3a8a6a', border: 'rgba(58,138,106,0.3)' },
  medium: { bg: 'rgba(232,168,56,0.15)', color: '#9a7030', border: 'rgba(232,168,56,0.3)' },
  low: { bg: 'rgba(154,154,176,0.15)', color: 'var(--text-light)', border: 'rgba(154,154,176,0.3)' },
}

const strengthColors = {
  strong: { color: '#3a8a6a', weight: 700 },
  moderate: { color: '#9a7030', weight: 600 },
  weak: { color: 'var(--text-light)', weight: 500 },
}

const impactColors = {
  positive: { color: '#3a8a6a', bg: 'rgba(58,138,106,0.12)' },
  negative: { color: '#dc3c3c', bg: 'rgba(220,60,60,0.12)' },
  neutral: { color: 'var(--text-light)', bg: 'rgba(150,150,170,0.1)' },
  mixed: { color: '#9a7030', bg: 'rgba(232,168,56,0.12)' },
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

export default function Insights() {
  const [daySummaries, setDaySummaries] = useState({})
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load day summaries from Supabase + localStorage
  const { user } = useApp()
  useEffect(() => {
    loadCachedSummaries(user?.id).then(cache => {
      setDaySummaries(cache)
    })
  }, [user])

  const analyzedDays = Object.entries(daySummaries)
    .filter(([, data]) => data.entriesHash) // Only days that have been analyzed
    .map(([date, data]) => ({
      date,
      summary: data.summary,
      insight: data.insight,
      substances: data.substances || [],
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalDays = Object.keys(daySummaries).length
  const analyzedCount = analyzedDays.length

  const handleGenerate = async () => {
    if (analyzedCount === 0 || loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await generateGlobalInsights(analyzedDays)
      setInsights(result)
    } catch (e) {
      setError(e.message || 'Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  const sectionStyle = (delay = 0) => ({
    borderRadius: 'var(--radius-lg)',
    padding: 24,
    animation: insights ? `slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both` : undefined,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800,
          color: 'var(--navy)', letterSpacing: '-0.02em', marginBottom: 6,
        }}>Global Insights</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 300, marginBottom: 20 }}>
          Deep analysis across all your analyzed days
        </p>

        {/* Stats card */}
        <div className="glass" style={{
          display: 'inline-flex', alignItems: 'center', gap: 16,
          padding: '12px 20px', borderRadius: 100, marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={16} style={{ color: '#3a8a6a' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
              {analyzedCount} {analyzedCount === 1 ? 'day' : 'days'} analyzed
            </span>
          </div>
          {totalDays > analyzedCount && (
            <>
              <div style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.1)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} style={{ color: 'var(--text-light)' }} />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {totalDays - analyzedCount} pending
                </span>
              </div>
            </>
          )}
        </div>

        <div>
          <button
            className="btn-amber"
            onClick={handleGenerate}
            disabled={loading || analyzedCount === 0}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              opacity: loading || analyzedCount === 0 ? 0.6 : 1,
            }}
          >
            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
            {loading ? 'Analyzing...' : 'Generate Global Insights'}
          </button>
          {analyzedCount === 0 && (
            <p style={{ color: 'var(--text-light)', fontSize: '0.8rem', marginTop: 10 }}>
              Analyze some days first to generate insights
            </p>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 14, fontSize: '0.85rem',
          background: 'rgba(255,80,80,0.12)', color: '#dc3c3c',
          border: '1px solid rgba(255,80,80,0.2)',
        }}>{error}</div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <>
          <ShimmerCard height={100} />
          <ShimmerCard height={160} />
          <ShimmerCard height={140} />
        </>
      )}

      {/* Empty state */}
      {!insights && !loading && analyzedCount > 0 && (
        <div className="glass" style={{
          borderRadius: 'var(--radius-lg)', padding: 48, textAlign: 'center',
        }}>
          <Sparkles size={48} style={{ color: 'var(--amber)', marginBottom: 20, opacity: 0.6 }} />
          <h3 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.15rem',
            color: 'var(--navy)', marginBottom: 8,
          }}>Discover deep patterns</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.7, maxWidth: 360, margin: '0 auto' }}>
            Ready to analyze {analyzedCount} {analyzedCount === 1 ? 'day' : 'days'} of data. 
            Tap "Generate Global Insights" to uncover correlations between substances, behaviors, and your wellbeing.
          </p>
        </div>
      )}

      {/* Results */}
      {insights && !loading && (
        <>
          {/* Overall Summary */}
          {insights.summary && (
            <div className="glass" style={sectionStyle(0)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Brain size={18} style={{ color: 'var(--navy)' }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Overall Summary</h3>
              </div>
              <p style={{ color: 'var(--text)', fontSize: '0.92rem', lineHeight: 1.8, margin: 0 }}>
                {insights.summary}
              </p>
            </div>
          )}

          {/* Mood Trend */}
          {insights.mood_trend && insights.mood_trend !== 'unknown' && (
            <div className="glass" style={sectionStyle(100)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Zap size={18} style={{ color: 'var(--navy)' }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Mood Trend</h3>
              </div>
              {(() => {
                const t = trendConfig[insights.mood_trend] || trendConfig.stable
                const Icon = t.icon
                return (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 16px', borderRadius: 100,
                    background: t.bg, border: `1px solid ${t.color}22`,
                  }}>
                    <Icon size={18} style={{ color: t.color }} />
                    <span style={{
                      fontFamily: 'var(--font-display)', fontWeight: 600,
                      fontSize: '0.9rem', color: t.color,
                    }}>{t.label}</span>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Patterns */}
          {insights.patterns?.length > 0 && (
            <div className="glass" style={sectionStyle(200)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Sparkles size={18} style={{ color: 'var(--navy)' }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Patterns Detected</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.patterns.map((p, i) => {
                  const conf = confidenceColors[p.confidence] || confidenceColors.low
                  return (
                    <div key={i} style={{
                      padding: '14px 18px', borderRadius: 16,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      animation: `slideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${250 + i * 80}ms both`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                        <h4 style={{
                          fontFamily: 'var(--font-display)', fontWeight: 600,
                          fontSize: '0.9rem', color: 'var(--navy)', margin: 0,
                        }}>{p.title}</h4>
                        <span style={{
                          padding: '2px 10px', borderRadius: 100,
                          fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase',
                          letterSpacing: '0.06em', whiteSpace: 'nowrap',
                          background: conf.bg, color: conf.color, border: `1px solid ${conf.border}`,
                        }}>{p.confidence}</span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.65, margin: 0 }}>
                        {p.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Correlations */}
          {insights.correlations?.length > 0 && (
            <div className="glass" style={sectionStyle(300)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Activity size={18} style={{ color: 'var(--navy)' }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Correlations</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.correlations.map((c, i) => {
                  const positive = c.direction === 'positive'
                  const strength = strengthColors[c.strength] || strengthColors.weak
                  return (
                    <div key={i} style={{
                      padding: '14px 18px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      animation: `slideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${350 + i * 80}ms both`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: positive ? 'rgba(58,138,106,0.15)' : 'rgba(220,60,60,0.12)',
                        }}>
                          {positive
                            ? <ArrowUpRight size={16} style={{ color: '#3a8a6a' }} />
                            : <ArrowDownRight size={16} style={{ color: '#dc3c3c' }} />
                          }
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{
                            margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.5,
                          }}>
                            <strong style={{ color: 'var(--navy)' }}>{c.factor}</strong>
                            <span style={{ color: 'var(--text-light)', margin: '0 6px' }}>→</span>
                            {c.effect}
                          </p>
                          {c.evidence && (
                            <p style={{
                              margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)',
                              fontStyle: 'italic', lineHeight: 1.5,
                            }}>
                              {c.evidence}
                            </p>
                          )}
                          <span style={{
                            display: 'inline-block', marginTop: 6,
                            padding: '2px 8px', borderRadius: 100,
                            fontSize: '0.65rem', fontWeight: strength.weight,
                            color: strength.color,
                            background: `${strength.color}15`,
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                          }}>
                            {c.strength}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Substance Effects */}
          {insights.substance_effects?.length > 0 && (
            <div className="glass" style={sectionStyle(400)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: '1.1rem' }}>💊</span>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Substance Effects</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {insights.substance_effects.map((s, i) => {
                  const moodColor = impactColors[s.mood_impact] || impactColors.neutral
                  const energyColor = impactColors[s.energy_impact] || impactColors.neutral
                  return (
                    <div key={i} style={{
                      padding: '16px 20px', borderRadius: 16,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      animation: `slideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${450 + i * 80}ms both`,
                    }}>
                      <h4 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 600,
                        fontSize: '0.95rem', color: 'var(--navy)', marginBottom: 8,
                      }}>{s.substance}</h4>
                      <p style={{
                        color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.65,
                        marginBottom: 10,
                      }}>{s.observed_effects}</p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 100, fontSize: '0.7rem',
                          fontWeight: 600, background: moodColor.bg, color: moodColor.color,
                        }}>
                          Mood: {s.mood_impact}
                        </span>
                        <span style={{
                          padding: '3px 10px', borderRadius: 100, fontSize: '0.7rem',
                          fontWeight: 600, background: energyColor.bg, color: energyColor.color,
                        }}>
                          Energy: {s.energy_impact}
                        </span>
                        {s.consistency && (
                          <span style={{
                            padding: '3px 10px', borderRadius: 100, fontSize: '0.7rem',
                            fontWeight: 600, background: 'rgba(150,150,170,0.1)',
                            color: 'var(--text-light)',
                          }}>
                            {s.consistency}
                          </span>
                        )}
                      </div>
                      {s.notes && (
                        <p style={{
                          margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)',
                          fontStyle: 'italic', lineHeight: 1.5,
                        }}>
                          {s.notes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Behavioral Insights */}
          {insights.behavioral_insights?.length > 0 && (
            <div className="glass" style={sectionStyle(500)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Calendar size={18} style={{ color: 'var(--navy)' }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Behavioral Insights</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.behavioral_insights.map((b, i) => (
                  <div key={i} style={{
                    padding: '14px 18px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    animation: `slideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${550 + i * 80}ms both`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                      <h4 style={{
                        fontFamily: 'var(--font-display)', fontWeight: 600,
                        fontSize: '0.9rem', color: 'var(--navy)', margin: 0,
                      }}>{b.behavior}</h4>
                      {b.frequency && (
                        <span style={{
                          padding: '2px 10px', borderRadius: 100,
                          fontSize: '0.65rem', fontWeight: 600,
                          background: 'rgba(150,150,170,0.12)', color: 'var(--text-light)',
                        }}>{b.frequency}</span>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.65, marginBottom: 8 }}>
                      {b.impact}
                    </p>
                    {b.recommendation && (
                      <div style={{
                        padding: '8px 12px', borderRadius: 10,
                        background: 'rgba(232,168,56,0.08)',
                        borderLeft: '3px solid var(--amber)',
                      }}>
                        <p style={{
                          margin: 0, fontSize: '0.8rem', color: 'var(--text)',
                          fontWeight: 500, lineHeight: 1.6,
                        }}>
                          💡 {b.recommendation}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {insights.recommendations?.length > 0 && (
            <div className="glass" style={sectionStyle(600)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Sparkles size={18} style={{ color: 'var(--amber)' }} />
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem',
                  color: 'var(--navy)', margin: 0,
                }}>Recommendations</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {insights.recommendations.map((rec, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '12px 16px', borderRadius: 14,
                    background: 'rgba(232,168,56,0.08)',
                    border: '1px solid rgba(232,168,56,0.15)',
                    animation: `slideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${650 + i * 80}ms both`,
                  }}>
                    <span style={{
                      fontSize: '1rem', flexShrink: 0, paddingTop: 2,
                    }}>💡</span>
                    <p style={{
                      margin: 0, fontSize: '0.88rem', color: 'var(--text)',
                      lineHeight: 1.65, flex: 1,
                    }}>{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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
