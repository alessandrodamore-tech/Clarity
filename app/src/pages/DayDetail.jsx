import { useState, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { ArrowLeft, RefreshCw, Loader2, Check, X, Plus } from 'lucide-react'
import { extractDayData, loadCachedSummaries } from '../lib/gemini'
import { TYPE_ICON, TYPE_COLORS } from '../lib/constants'
import EditEntryModal from '../components/EditEntryModal'
import EmptyState from '../components/EmptyState'
import { FeatureHint } from '../components/Onboarding'

const OVERRIDES_KEY = 'clarity_med_overrides'
function loadOverrides() { try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}') } catch { return {} } }
function saveOverrides(ov) { try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(ov)) } catch {} }

function formatDayHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTime(entry) {
  if (entry.entry_time) return entry.entry_time.slice(0, 5)
  return new Date(entry.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}


function DayActions({ dayData, dateStr, overrides, onOverridesChange }) {
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDetail, setNewDetail] = useState('')

  const aiActions = dayData?.actions || dayData?.substances || []
  const dayOverrides = overrides[dateStr] || { removed: [], added: [] }

  const items = useMemo(() => {
    const result = []; const seen = new Set()
    for (const s of aiActions) {
      const key = s.name.toLowerCase()
      if (dayOverrides.removed?.includes(key)) result.push({ ...s, status: 'removed' })
      else result.push({ ...s, status: 'confirmed' })
      seen.add(key)
    }
    for (const a of (dayOverrides.added || [])) {
      const key = a.name.toLowerCase()
      if (seen.has(key)) continue
      result.push({ ...a, status: 'manual' }); seen.add(key)
    }
    return result
  }, [aiActions, dayOverrides])

  const toggleSubstance = (name) => {
    const key = name.toLowerCase()
    const current = overrides[dateStr] || { removed: [], added: [] }
    const isRemoved = current.removed?.includes(key)
    const updated = { ...overrides, [dateStr]: { ...current, removed: isRemoved ? (current.removed || []).filter(r => r !== key) : [...(current.removed || []), key] } }
    onOverridesChange(updated)
  }

  const addManual = () => {
    if (!newName.trim()) return
    const current = overrides[dateStr] || { removed: [], added: [] }
    const updated = { ...overrides, [dateStr]: { ...current, added: [...(current.added || []), { name: newName.trim(), detail: newDetail.trim() || null, type: 'other' }] } }
    onOverridesChange(updated); setNewName(''); setNewDetail(''); setAddingNew(false)
  }

  if (items.length === 0 && !addingNew) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => {
        const colors = TYPE_COLORS[item.type] || TYPE_COLORS.other
        const icon = TYPE_ICON[item.type] || '•'
        const isOff = item.status === 'removed'
        const isConfirmed = item.status === 'confirmed'
        const isManual = item.status === 'manual'
        return (
          <div key={`${item.name}-${i}`} onClick={() => toggleSubstance(item.name)} style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.75rem', padding: '7px 11px',
            background: isOff ? 'rgba(150,150,170,0.04)' : (isConfirmed || isManual) ? colors.solidBg : colors.bg,
            borderRadius: 10, border: `1px solid ${isOff ? 'rgba(150,150,170,0.1)' : colors.border}`,
            opacity: isOff ? 0.4 : 1, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
          }}>
            <span style={{ fontSize: '0.68rem', flexShrink: 0 }}>{icon}</span>
            <span style={{ fontWeight: 600, color: isOff ? 'var(--text-muted)' : 'var(--text)', textDecoration: isOff ? 'line-through' : 'none', flex: 1 }}>{item.name}</span>
            {(item.detail || item.dose) && <span style={{ color: 'var(--text-light)', fontSize: '0.68rem', fontWeight: 500 }}>{item.detail || item.dose}</span>}
            {item.time && <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>{item.time}</span>}
            {isConfirmed && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: colors.accent, flexShrink: 0 }}><Check size={10} style={{ color: '#fff' }} /></span>}
            {isManual && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: colors.accent, color: '#fff', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>+</span>}
          </div>
        )
      })}
      {addingNew ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManual()} placeholder="Name"
            style={{ flex: 1, fontSize: '0.72rem', padding: '5px 7px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.7)', outline: 'none', fontFamily: 'inherit' }} />
          <input value={newDetail} onChange={e => setNewDetail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addManual()} placeholder="Detail"
            style={{ width: 50, fontSize: '0.68rem', padding: '5px 5px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.7)', outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={addManual} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', padding: 2, fontSize: '0.8rem' }}>✓</button>
          <button onClick={() => setAddingNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><X size={12} /></button>
        </div>
      ) : (
        <button onClick={() => setAddingNew(true)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2, padding: '4px 0',
          fontSize: '0.65rem', color: 'var(--text-muted)', background: 'none', border: '1px dashed rgba(0,0,0,0.1)',
          borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'border-color 0.2s, color 0.2s',
        }}><Plus size={10} /> Add</button>
      )}
    </div>
  )
}

export default function DayDetail() {
  const { date } = useParams()
  const navigate = useNavigate()
  const { user, entries, updateEntry, deleteEntry } = useApp()

  const [dayData, setDayData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [medOverrides, setMedOverrides] = useState(() => loadOverrides())

  // Modal state
  const [modal, setModal] = useState(null)
  const [editText, setEditText] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [modalOrigin, setModalOrigin] = useState(null)
  const [modalClosing, setModalClosing] = useState(false)

  const dayEntries = useMemo(() =>
    entries.filter(e => (e.entry_date || e.created_at?.slice(0, 10)) === date)
      .sort((a, b) => {
        const ta = a.entry_time || a.created_at?.slice(11, 16) || ''
        const tb = b.entry_time || b.created_at?.slice(11, 16) || ''
        return ta.localeCompare(tb)
      }),
    [entries, date]
  )

  // Load cached day data
  useEffect(() => {
    loadCachedSummaries(user?.id).then(cache => { if (cache[date]) setDayData(cache[date]) })
  }, [user, date])

  const handleOverridesChange = useCallback((newOv) => { setMedOverrides(newOv); saveOverrides(newOv) }, [])

  const refreshDay = useCallback(async () => {
    if (loading || !dayEntries.length) return
    setLoading(true)
    // Load all cached data for context
    const allCache = await loadCachedSummaries(user?.id)
    const allGroups = {}
    for (const entry of entries) {
      const d = entry.entry_date || entry.created_at?.slice(0, 10)
      if (!d) continue
      if (!allGroups[d]) allGroups[d] = []
      allGroups[d].push(entry)
    }
    const sortedDates = Object.keys(allGroups).sort()
    const previousDays = sortedDates
      .filter(d => d < date && allCache[d]?.summary)
      .map(d => ({ date: d, summary: allCache[d].summary, insights: allCache[d].insights }))
    try {
      const result = await extractDayData(dayEntries, user?.id, null, previousDays)
      setDayData(result)
    } catch (err) { console.error('Failed to analyze:', err) }
    setLoading(false)
  }, [loading, dayEntries, user, entries, date])

  const openModal = (entry, el) => {
    if (el) setModalOrigin(el.getBoundingClientRect()); else setModalOrigin(null)
    setModalClosing(false); setModal(entry)
    setEditText(entry.text); setEditDate(entry.entry_date || ''); setEditTime(entry.entry_time?.slice(0, 5) || '')
  }
  const closeModal = () => {
    if (modal) { const el = document.querySelector(`[data-entry-id="${modal.id}"]`); if (el) setModalOrigin(el.getBoundingClientRect()) }
    setModalClosing(true); setTimeout(() => { setModal(null); setModalClosing(false) }, 400)
  }
  const handleSave = async () => { if (!modal) return; await updateEntry(modal.id, { text: editText, entry_date: editDate, entry_time: editTime }); closeModal() }
  const handleDelete = async () => { if (!modal) return; await deleteEntry(modal.id); setModal(null); setModalClosing(false) }

  const insight = dayData?.insight || (dayData?.insights?.[0]) || null
  const isAnalyzed = !!dayData?.entriesHash

  return (
    <div className="day-detail-page" style={{ animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* HEADER */}
      <div className="day-detail-header">
        <button onClick={() => navigate('/app')} className="day-detail-back">
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 className="day-detail-title">{formatDayHeader(date)}</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
            {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <button onClick={refreshDay} disabled={loading} className="day-detail-refresh" title={isAnalyzed ? 'Re-analyze' : 'Analyze day'}>
          {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
        </button>
      </div>

      {/* INSIGHT CARD */}
      {loading ? (
        <div className="glass" style={{ padding: 16, borderRadius: 'var(--radius)', marginBottom: 16 }}>
          <div className="shimmer-pill" style={{ width: '100%', height: 14, marginBottom: 8 }} />
          <div className="shimmer-pill" style={{ width: '80%', height: 14, marginBottom: 8 }} />
          <div className="shimmer-pill" style={{ width: '60%', height: 14 }} />
        </div>
      ) : insight ? (
        <div className="glass day-detail-insight">
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.65, color: 'var(--text)' }}>{insight}</p>
        </div>
      ) : dayEntries.length > 0 && !isAnalyzed ? (
        <div className="glass" style={{
          padding: 20, borderRadius: 'var(--radius)', marginBottom: 16,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6,
            marginBottom: 14,
          }}>
            AI can summarize your day, find patterns, and extract wellness factors from your entries.
          </div>
          <button onClick={refreshDay} style={{
            padding: '10px 24px', borderRadius: 100,
            background: 'var(--amber)', color: '#fff', border: 'none',
            fontFamily: 'var(--font-display)', fontWeight: 600,
            fontSize: '0.85rem', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 2px 12px rgba(232,168,56,0.3)',
            transition: 'transform 0.2s',
          }}>
            <RefreshCw size={14} /> Analyze this day
          </button>
        </div>
      ) : null}

      {/* ENTRIES */}
      {dayEntries.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <h3 className="day-detail-section-title">Entries</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayEntries.map((entry, i) => (
              <div
                key={entry.id}
                className="glass entry-item"
                data-entry-id={entry.id}
                onClick={(e) => openModal(entry, e.currentTarget)}
                style={{
                  padding: '14px 18px', borderRadius: 'var(--radius)', cursor: 'pointer',
                  animation: 'slideUp 0.2s ease both', animationDelay: `${i * 50}ms`,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600, minWidth: 36, paddingTop: 2 }}>
                  {formatTime(entry)}
                </span>
                <p style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.6, flex: 1, margin: 0 }}>{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={'\uD83D\uDCDD'}
          title="No entries this day"
          description="Go to your feed to write about this day."
          cta="Go to Feed"
          onAction={() => navigate('/app')}
        />
      )}

      {/* TRACKED FACTORS */}
      {dayData && (
        <div style={{ marginBottom: 20 }}>
          <h3 className="day-detail-section-title">Tracked Factors</h3>
          <DayActions dayData={dayData} dateStr={date} overrides={medOverrides} onOverridesChange={handleOverridesChange} />
          <FeatureHint id="factor-toggle">Tap any factor to toggle it on or off</FeatureHint>
        </div>
      )}

      {/* EDIT MODAL */}
      <EditEntryModal
        entry={modal}
        modalOrigin={modalOrigin}
        modalClosing={modalClosing}
        editText={editText} setEditText={setEditText}
        editDate={editDate} setEditDate={setEditDate}
        editTime={editTime} setEditTime={setEditTime}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
