import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Upload, Info, LogOut, Trash2, Check, RefreshCw, Link2, Unlink, ArrowUpFromLine, ArrowDownToLine } from 'lucide-react'
import { useApp } from '../lib/store'
import { useToast } from '../lib/useToast'
import { APP_VERSION, USER_CONTEXT_KEY } from '../lib/constants'
import { supabase } from '../lib/supabase'
import { loadCachedSummaries } from '../lib/gemini'
import { getNotionCredentials, saveNotionCredentials, clearNotionCredentials, loadNotionCredentialsFromUser, testNotionConnection, pushToNotion, pullFromNotion, cleanupNotionDuplicates } from '../lib/notion'
import { FeatureHint } from '../components/Onboarding'

export default function Settings() {
  const navigate = useNavigate()
  const { user, setUser, entries, addEntry, fetchEntries } = useApp()
  const toast = useToast()

  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [saved, setSaved] = useState(false)
  const [analyzedCount, setAnalyzedCount] = useState(0)
  const [context, setContext] = useState('')
  const [contextSaved, setContextSaved] = useState(false)

  // Notion sync state
  const [notionToken, setNotionToken] = useState('')
  const [notionDbId, setNotionDbId] = useState('')
  const [notionConnected, setNotionConnected] = useState(false)
  const [notionDbName, setNotionDbName] = useState('')
  const [notionTesting, setNotionTesting] = useState(false)
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [notionPulling, setNotionPulling] = useState(false)
  const [notionProgress, setNotionProgress] = useState('')
  const [notionCleaning, setNotionCleaning] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

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

  // Load AI context: prefer Supabase user_metadata (cross-device), fall back to localStorage
  useEffect(() => {
    const supabaseContext = user?.user_metadata?.ai_context
    if (supabaseContext !== undefined && supabaseContext !== null) {
      setContext(supabaseContext)
      try { localStorage.setItem(USER_CONTEXT_KEY, supabaseContext) } catch {}
    } else {
      try {
        const stored = localStorage.getItem(USER_CONTEXT_KEY)
        if (stored) setContext(stored)
      } catch {}
    }
  }, [user])

  // Load Notion credentials from user metadata (Supabase) or localStorage cache
  useEffect(() => {
    if (!user) return
    const creds = loadNotionCredentialsFromUser(user) || getNotionCredentials()
    if (creds.token && creds.databaseId) {
      setNotionToken(creds.token)
      setNotionDbId(creds.databaseId)
      setNotionDbName(creds.databaseName)
      setNotionConnected(true)
    }
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

  const handleSaveContext = async () => {
    const trimmed = context.trim()
    // Save to localStorage immediately (fast, optimistic)
    try {
      if (trimmed) {
        localStorage.setItem(USER_CONTEXT_KEY, trimmed)
      } else {
        localStorage.removeItem(USER_CONTEXT_KEY)
      }
    } catch {}
    // Persist to Supabase user_metadata for cross-device sync
    await supabase.auth.updateUser({ data: { ai_context: trimmed || '' } })
    setContextSaved(true)
    setTimeout(() => setContextSaved(false), 2000)
  }

  const handleNotionConnect = async () => {
    if (!notionToken.trim() || !notionDbId.trim()) {
      toast.error('Token and Database ID are required')
      return
    }
    setNotionTesting(true)
    try {
      const result = await testNotionConnection(notionToken.trim(), notionDbId.trim())
      await saveNotionCredentials(notionToken.trim(), notionDbId.trim(), result.title, result.title_property)
      setNotionDbName(result.title)
      setNotionConnected(true)
      toast.success(`Connected to "${result.title}"`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setNotionTesting(false)
    }
  }

  const handleNotionDisconnect = async () => {
    await clearNotionCredentials()
    setNotionToken('')
    setNotionDbId('')
    setNotionDbName('')
    setNotionConnected(false)
  }

  const handleNotionPush = async () => {
    if (!entries?.length) {
      toast.error('No entries to sync')
      return
    }
    setNotionSyncing(true)
    setNotionProgress('')
    try {
      const result = await pushToNotion(
        notionToken, notionDbId, entries,
        (done, total) => setNotionProgress(`${done}/${total}`)
      )
      setNotionProgress('')
      if (result.pushed === 0) {
        toast.success(`All ${result.alreadySynced} entries already synced`)
      } else {
        toast.success(`Pushed ${result.pushed} new entries to Notion`)
      }
    } catch (e) {
      toast.error(e.message)
      setNotionProgress('')
    } finally {
      setNotionSyncing(false)
    }
  }

  const handleNotionPull = async () => {
    setNotionPulling(true)
    try {
      const newEntries = await pullFromNotion(notionToken, notionDbId, entries || [])
      if (newEntries.length === 0) {
        toast.success('No new entries found in Notion')
      } else {
        // Insert directly via supabase (NOT addEntry) to avoid re-pushing to Notion
        let imported = 0
        for (const entry of newEntries) {
          const { data, error } = await supabase
            .from('entries')
            .insert({
              user_id: user.id,
              raw_text: entry.text,
              entry_date: entry.entry_date,
              entry_time: entry.entry_time,
              source: 'notion',
            })
            .select()
            .single()
          if (!error && data) imported++
        }
        // Refresh entries list from DB
        await fetchEntries()
        toast.success(`Imported ${imported} entries from Notion`)
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setNotionPulling(false)
    }
  }

  const handleNotionCleanup = async () => {
    setNotionCleaning(true)
    setConfirmCleanup(false)
    setNotionProgress('')
    try {
      const result = await cleanupNotionDuplicates(
        notionToken, notionDbId,
        (done, total) => setNotionProgress(`${done}/${total}`)
      )
      setNotionProgress('')
      toast.success(`Done! Found ${result.duplicates} duplicates, archived ${result.archived}. ${result.total - result.duplicates} unique pages remain.`)
    } catch (e) {
      toast.error(e.message)
      setNotionProgress('')
    } finally {
      setNotionCleaning(false)
    }
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

      {/* AI Context */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Info size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>AI Context</h2>
        </div>
        <p style={{
          color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.7,
          margin: '0 0 16px',
        }}>
          Write anything that helps the AI understand your entries better. This context is included in every analysis.
        </p>

        {/* Hint */}
        <div style={{
          padding: '12px 14px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(232,168,56,0.06)',
          border: '1px solid rgba(232,168,56,0.12)',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Info size={14} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>Examples of what to include:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                <li>Medical conditions (e.g., "I have ADHD, diagnosed in 2023")</li>
                <li>Current medications and dosages</li>
                <li>Personal abbreviations or nicknames you use in entries</li>
                <li>Goals you're working toward</li>
                <li>Context about your life situation (student, work schedule, etc.)</li>
                <li>How you want the AI to interpret your entries (e.g., "when I write 'la solita' I mean Elvanse 30mg")</li>
              </ul>
            </div>
          </div>
        </div>

        <textarea
          className="glass-textarea"
          placeholder="E.g.: I'm a 21-year-old university student with ADHD. I take Elvanse 30mg every morning and Sertralina 50mg. When I write 'la pastiglia' I mean Elvanse. I'm trying to exercise 3x/week and reduce caffeine..."
          value={context}
          onChange={e => setContext(e.target.value)}
          rows={8}
          style={{
            width: '100%', resize: 'vertical', marginBottom: 16,
            fontSize: '0.88rem', lineHeight: 1.7,
            minHeight: 160,
          }}
        />

        <button
          className="btn-primary"
          onClick={handleSaveContext}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}
        >
          {contextSaved ? <><Check size={16} /> Saved</> : 'Save Context'}
        </button>

        {context.trim() && (
          <p style={{
            margin: '12px 0 0', fontSize: '0.72rem', color: 'var(--text-light)',
            textAlign: 'center',
          }}>
            This context will be included in all AI analyses (daily, trends, alerts).
          </p>
        )}
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

      {/* Notion Sync */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Link2 size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0, flex: 1 }}>Notion Sync</h2>
          {notionConnected && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 600, color: '#3a8a6a',
              padding: '2px 8px', borderRadius: 100,
              background: 'rgba(58,138,106,0.1)',
            }}>Connected</span>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.7, margin: '0 0 16px' }}>
          Sync your journal entries with a Notion database. Two-way: push entries to Notion, or import from Notion.
        </p>

        {!notionConnected ? (
          <>
            {/* Setup instructions */}
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(232,168,56,0.06)',
              border: '1px solid rgba(232,168,56,0.12)',
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text)' }}>Setup:</strong>
                <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>Go to <strong>notion.so/my-integrations</strong> and create an integration</li>
                  <li>Copy the <strong>Internal Integration Token</strong></li>
                  <li>In Notion, open your journal database and click <strong>Share → Invite</strong> → add the integration</li>
                  <li>Copy the <strong>Database ID</strong> from the database URL (the 32-char string after the workspace name)</li>
                </ol>
              </div>
            </div>

            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Integration Token</label>
            <input
              className="glass-input"
              type="password"
              placeholder="ntn_..."
              value={notionToken}
              onChange={e => setNotionToken(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Database ID</label>
            <input
              className="glass-input"
              placeholder="abc123def456..."
              value={notionDbId}
              onChange={e => setNotionDbId(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <button
              className="btn-primary"
              onClick={handleNotionConnect}
              disabled={notionTesting}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                opacity: notionTesting ? 0.6 : 1,
              }}
            >
              {notionTesting ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : <><Link2 size={14} /> Connect</>}
            </button>
          </>
        ) : (
          <>
            {/* Connected state */}
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(58,138,106,0.06)',
              border: '1px solid rgba(58,138,106,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{notionDbName || 'Notion Database'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: 2 }}>ID: {notionDbId.slice(0, 8)}...</div>
              </div>
              <button
                onClick={handleNotionDisconnect}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-light)', display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: '0.72rem', fontWeight: 600,
                }}
              >
                <Unlink size={12} /> Disconnect
              </button>
            </div>

            {/* Sync buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleNotionPush}
                disabled={notionSyncing || notionPulling}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 'var(--radius)',
                  background: 'rgba(42,42,69,0.85)', color: '#fff',
                  border: 'none', cursor: notionSyncing ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.82rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: (notionSyncing || notionPulling) ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {notionSyncing ? (
                  <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> {notionProgress || 'Pushing...'}</>
                ) : (
                  <><ArrowUpFromLine size={13} /> Push to Notion</>
                )}
              </button>

              <button
                onClick={handleNotionPull}
                disabled={notionSyncing || notionPulling}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 'var(--radius)',
                  background: 'rgba(255,255,255,0.15)', color: 'var(--text)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  cursor: notionPulling ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.82rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: (notionSyncing || notionPulling) ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {notionPulling ? (
                  <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Pulling...</>
                ) : (
                  <><ArrowDownToLine size={13} /> Pull from Notion</>
                )}
              </button>
            </div>

            {/* Cleanup duplicates */}
            {confirmCleanup ? (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <p style={{ flex: 1, margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  This will archive duplicates in Notion (keeps oldest copy).
                </p>
                <button
                  onClick={handleNotionCleanup}
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--radius)',
                    background: 'rgba(220,60,60,0.12)', color: '#dc3c3c',
                    border: '1px solid rgba(220,60,60,0.2)',
                    cursor: 'pointer', fontFamily: 'var(--font-display)',
                    fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmCleanup(false)}
                  style={{
                    padding: '8px 14px', borderRadius: 'var(--radius)',
                    background: 'rgba(0,0,0,0.05)', color: 'var(--text-muted)',
                    border: '1px solid rgba(0,0,0,0.1)',
                    cursor: 'pointer', fontFamily: 'var(--font-display)',
                    fontWeight: 600, fontSize: '0.78rem',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCleanup(true)}
                disabled={notionSyncing || notionPulling || notionCleaning}
                style={{
                  marginTop: 10, width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
                  background: 'rgba(232,168,56,0.08)', color: 'var(--amber)',
                  border: '1px solid rgba(232,168,56,0.2)',
                  cursor: notionCleaning ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.78rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: (notionSyncing || notionPulling || notionCleaning) ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {notionCleaning ? (
                  <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Cleaning {notionProgress || '...'}</>
                ) : (
                  <><Trash2 size={12} /> Clean Notion Duplicates</>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* About */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center' }}>
        <Info size={18} style={{ color: 'var(--text-light)', marginBottom: 8 }} />
        <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>{`Clarity v${APP_VERSION}`} — Your mind, decoded.</p>
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
