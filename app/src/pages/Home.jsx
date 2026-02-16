import React, { useState, useEffect, useMemo } from 'react'
import { useApp } from '../lib/store'
import { BookOpen } from 'lucide-react'

function nowDate() { return new Date().toISOString().slice(0, 10) }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

function formatTime(entry) {
  if (entry.entry_time) return entry.entry_time.slice(0, 5)
  return new Date(entry.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(entry) {
  const d = entry.entry_date || entry.created_at?.slice(0, 10)
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return ''
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function Home() {
  const { user, entries, entriesLoading, addEntry, updateEntry, deleteEntry } = useApp()
  const [text, setText] = useState('')
  const [time, setTime] = useState(nowTime())
  const [saving, setSaving] = useState(false)

  // Edit modal
  const [modal, setModal] = useState(null)
  const [editText, setEditText] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editingField, setEditingField] = useState(null)
  const [modalOrigin, setModalOrigin] = useState(null)
  const [modalClosing, setModalClosing] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => setTime(nowTime()), 1000)
    return () => clearInterval(iv)
  }, [])

  // All entries sorted newest first
  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const da = a.entry_date || a.created_at?.slice(0, 10) || ''
      const db = b.entry_date || b.created_at?.slice(0, 10) || ''
      if (da !== db) return da.localeCompare(db)
      const ta = a.entry_time || a.created_at?.slice(11, 16) || ''
      const tb = b.entry_time || b.created_at?.slice(11, 16) || ''
      return ta.localeCompare(tb)
    })
  }, [entries])

  const handleSubmit = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    await addEntry({ text: text.trim(), date: nowDate(), time: nowTime() })
    setText(''); setTime(nowTime()); setSaving(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const openModal = (entry, el) => {
    if (el) setModalOrigin(el.getBoundingClientRect()); else setModalOrigin(null)
    setModalClosing(false); setModal(entry)
    setEditText(entry.text); setEditDate(entry.entry_date || ''); setEditTime(entry.entry_time?.slice(0, 5) || '')
  }
  const closeModal = () => {
    if (modal) {
      const el = document.querySelector(`[data-entry-id="${modal.id}"]`)
      if (el) setModalOrigin(el.getBoundingClientRect())
    }
    setModalClosing(true)
    setTimeout(() => { setModal(null); setModalClosing(false) }, 400)
  }
  const handleSave = async () => {
    if (!modal) return
    await updateEntry(modal.id, { text: editText, entry_date: editDate, entry_time: editTime })
    closeModal()
  }
  const handleDelete = async () => {
    if (!modal) return
    await deleteEntry(modal.id)
    setModal(null); setModalClosing(false)
  }

  // Auto-scroll to bottom on new entry
  const feedRef = React.useRef(null)
  const prevCount = React.useRef(entries.length)
  useEffect(() => {
    if (entries.length > prevCount.current) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }
    prevCount.current = entries.length
  }, [entries.length])

  // Scroll to bottom on first load
  useEffect(() => {
    if (!entriesLoading && entries.length > 0) {
      window.scrollTo(0, document.body.scrollHeight)
    }
  }, [entriesLoading])

  return (
    <div className="home-feed" ref={feedRef}>
      {/* Entries */}
      {sorted.map((entry) => {
        const dateLabel = formatDate(entry)
        return (
          <div
            key={entry.id}
            className="feed-card"
            data-entry-id={entry.id}
            onClick={(e) => openModal(entry, e.currentTarget)}
          >
            <div className="feed-time-col">
              <span className="feed-time">{formatTime(entry)}</span>
              {dateLabel && <span className="feed-date">{dateLabel}</span>}
            </div>
            <p className="feed-text">{entry.text}</p>
          </div>
        )
      })}

      {/* Loading */}
      {entriesLoading && (
        <p className="feed-loading">Loading...</p>
      )}

      {/* Empty */}
      {!entriesLoading && entries.length === 0 && (
        <div className="feed-empty">
          <BookOpen size={40} style={{ color: 'var(--amber)', marginBottom: 12 }} />
          <h3>Your journal is empty</h3>
          <p>Write your first entry below.</p>
        </div>
      )}

      {/* Input — fixed at bottom */}
      <div className="feed-input-bar">
        <div className="feed-input-inner" style={{ opacity: saving ? 0.6 : 1 }}>
          <span className="feed-time">{time}</span>
          <div className="feed-card-body">
            <textarea
              className="feed-input"
              placeholder="Write anything..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              rows={1}
            />
            {text.trim() && (
              <button className="feed-save" onClick={handleSubmit} disabled={saving}>
                {saving ? '...' : 'Save ↵'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      {modal && (() => {
        const o = modalOrigin
        const targetW = Math.min(480, window.innerWidth - 40)
        const targetH = 300
        const targetX = (window.innerWidth - targetW) / 2
        const targetY = (window.innerHeight - targetH) / 2
        const fromTransform = o
          ? `translate(${o.left - targetX}px, ${o.top - targetY}px) scale(${o.width / targetW}, ${o.height / targetH})`
          : 'scale(0.9) translateY(30px)'
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={closeModal}>
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(42,42,69,0.45)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              animation: modalClosing ? 'modalBgOut 0.35s ease forwards' : 'modalBgIn 0.35s ease forwards',
            }} />
            <div onClick={e => e.stopPropagation()} style={{
              position: 'relative', zIndex: 1, width: '100%', maxWidth: 480,
              background: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)', '--from-transform': fromTransform,
              animation: modalClosing ? 'modalMorphOut 0.4s cubic-bezier(0.5,0,0.7,0.4) forwards' : 'modalMorphIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
                animation: modalClosing ? 'modalContentOut 0.15s ease forwards' : 'modalContentIn 0.3s ease 0.25s forwards',
                opacity: modalClosing ? 1 : 0,
              }}>
                <span style={{ fontSize: '0.75rem', color: '#9a9ab0', fontWeight: 600, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editingField === 'date' ? (
                    <input type="date" value={editDate} autoFocus onChange={e => setEditDate(e.target.value)} onBlur={() => setEditingField(null)}
                      style={{ fontSize: '0.75rem', color: '#9a9ab0', fontFamily: 'var(--font-display)', fontWeight: 600, background: 'none', border: 'none', outline: 'none', padding: 0 }} />
                  ) : (
                    <span onClick={() => setEditingField('date')} style={{ cursor: 'pointer' }}>{editDate}</span>
                  )}
                  {' · '}
                  {editingField === 'time' ? (
                    <input type="time" value={editTime} autoFocus onChange={e => setEditTime(e.target.value)} onBlur={() => setEditingField(null)}
                      style={{ fontSize: '0.75rem', color: '#9a9ab0', fontFamily: 'var(--font-display)', fontWeight: 600, background: 'none', border: 'none', outline: 'none', padding: 0 }} />
                  ) : (
                    <span onClick={() => setEditingField('time')} style={{ cursor: 'pointer' }}>{editTime}</span>
                  )}
                </span>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9ab0', padding: 2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{
                width: '100%', minHeight: 160, padding: 0, border: 'none', background: 'none', outline: 'none',
                fontSize: '0.95rem', lineHeight: 1.75, color: '#2a2a45', fontFamily: 'inherit', resize: 'vertical', marginBottom: 20,
                animation: modalClosing ? 'modalContentOut 0.15s ease forwards' : 'modalContentIn 0.3s ease 0.2s forwards',
                opacity: modalClosing ? 1 : 0,
              }} />
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                animation: modalClosing ? 'modalContentOut 0.1s ease forwards' : 'modalContentIn 0.3s ease 0.3s forwards',
                opacity: modalClosing ? 1 : 0,
              }}>
                <button onClick={handleDelete} style={{
                  background: 'none', border: 'none', color: '#c4c4d4', fontSize: '0.78rem', fontWeight: 500,
                  fontFamily: 'var(--font-display)', cursor: 'pointer', transition: 'color 0.2s',
                }} onMouseEnter={e => e.target.style.color = '#dc3c3c'} onMouseLeave={e => e.target.style.color = '#c4c4d4'}>Delete</button>
                <button className="btn-primary" onClick={handleSave} style={{ padding: '10px 28px', fontSize: '0.85rem' }}>Save</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
