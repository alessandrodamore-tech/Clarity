import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Upload, Info, LogOut, Trash2, Check } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { clearSummaryCache, loadCachedSummaries } from '../lib/gemini'
import { FeatureHint } from '../components/Onboarding'

export default function Settings() {
  const navigate = useNavigate()
  const { user, setUser, entries } = useApp()

  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [saved, setSaved] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [analyzedCount, setAnalyzedCount] = useState(0)

  useEffect(() => {
    if (!user) return
    setDisplayName(user.user_metadata?.display_name || '')
    setTimezone(user.user_metadata?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [user])

  // Load analyzed days count
  useEffect(() => {
    if (!user) return
    loadCachedSummaries(user.id).then(cache => {
      setAnalyzedCount(Object.keys(cache).length)
    })
  }, [user])

  const journeyStats = useMemo(() => {
    const totalEntries = entries?.length || 0
    const uniqueDates = new Set(entries?.map(e => e.entry_date) || [])
    const daysTracked = uniqueDates.size

    // Compute current streak
    let streak = 0
    if (daysTracked > 0) {
      const sortedDates = [...uniqueDates].sort().reverse()
      const today = new Date()
      const todayStr = today.toISOString().slice(0, 10)
      const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().slice(0, 10)

      // Streak starts from today or yesterday
      if (sortedDates[0] === todayStr || sortedDates[0] === yesterdayStr) {
        let checkDate = new Date(sortedDates[0] + 'T00:00:00')
        for (const d of sortedDates) {
          const expected = checkDate.toISOString().slice(0, 10)
          if (d === expected) {
            streak++
            checkDate.setDate(checkDate.getDate() - 1)
          } else if (d < expected) {
            break
          }
        }
      }
    }

    return { totalEntries, daysTracked, streak }
  }, [entries])

  const hasExplicitTimezone = !!user?.user_metadata?.timezone

  const handleSaveProfile = async () => {
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName, timezone }
    })
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleClearCache = async () => {
    if (!confirm('This will delete all cached analyses. You can re-analyze your days afterwards.')) return
    setClearing(true)
    await clearSummaryCache(user?.id)
    localStorage.removeItem('clarity_global_insights')
    localStorage.removeItem('clarity_global_report')
    localStorage.removeItem('clarity_reminders')
    localStorage.removeItem('clarity_reminders_hash')
    localStorage.removeItem('clarity_reminders_done')
    setClearing(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const timezones = [
    'Europe/Rome', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
    'Europe/Amsterdam', 'Europe/Lisbon', 'Europe/Athens', 'Europe/Helsinki',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Pacific/Auckland',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <User size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Profile</h2>
        </div>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Display Name</label>
        <input
          className="glass-input"
          placeholder="Your name"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Timezone</label>
        <select
          className="glass-input"
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          style={{ cursor: 'pointer', marginBottom: 16 }}
        >
          {timezones.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
        </select>
        <button
          className="btn-primary"
          onClick={handleSaveProfile}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {saved ? <><Check size={16} /> Saved</> : 'Save Profile'}
        </button>
      </div>

      {/* Import */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Upload size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Import Journal</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
          Import entries from text files, CSV, Notion exports, or paste them directly.
        </p>
        <button onClick={() => navigate('/app/import')} className="btn-primary" style={{ width: '100%' }}>
          Import Entries
        </button>
      </div>

      {/* Data */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Trash2 size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Data</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
          Clear all AI analyses cache. Your journal entries won't be affected.
        </p>
        <button
          onClick={handleClearCache}
          disabled={clearing}
          style={{
            width: '100%', padding: '12px 24px', borderRadius: 'var(--radius)',
            background: 'rgba(220,60,60,0.08)', color: '#dc3c3c',
            border: '1px solid rgba(220,60,60,0.2)',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.88rem',
            cursor: clearing ? 'wait' : 'pointer', opacity: clearing ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {clearing ? 'Clearing...' : 'Clear Analysis Cache'}
        </button>
      </div>

      {/* About */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center' }}>
        <Info size={18} style={{ color: 'var(--text-light)', marginBottom: 8 }} />
        <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>Clarity v0.1 — Your mind, decoded.</p>
      </div>

      {/* Your Journey */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: '1.1rem' }}>{'\u2728'}</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Your Journey</h2>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}>
          {[
            { label: 'Entries written', value: journeyStats.totalEntries },
            { label: 'Days tracked', value: journeyStats.daysTracked },
            { label: 'Days analyzed', value: analyzedCount },
            { label: 'Current streak', value: journeyStats.streak > 0 ? `${journeyStats.streak}d` : '--' },
          ].map((stat) => (
            <div key={stat.label} style={{
              padding: '14px 12px', borderRadius: 'var(--radius)',
              background: 'rgba(232,168,56,0.06)',
              border: '1px solid rgba(232,168,56,0.12)',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 700,
                fontSize: '1.3rem', color: 'var(--navy)', marginBottom: 2,
              }}>
                {stat.value}
              </div>
              <div style={{
                fontSize: '0.72rem', color: 'var(--text-muted)',
                fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!hasExplicitTimezone && (
        <FeatureHint id="timezone-setting">
          Set your timezone above so entries are always sorted correctly for your location.
        </FeatureHint>
      )}

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px 24px', borderRadius: 100, width: '100%',
          background: 'rgba(220,60,60,0.1)', color: '#dc3c3c',
          border: '1px solid rgba(220,60,60,0.2)',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.92rem',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <LogOut size={16} /> Sign Out
      </button>
    </div>
  )
}
