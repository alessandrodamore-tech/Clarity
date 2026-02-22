import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

export default function EntryDetailModal({
  entry,
  modalOrigin,
  modalClosing,
  editText, setEditText,
  editDate, setEditDate,
  editTime, setEditTime,
  onClose,
  onSave,
  onDelete,
}) {
  const [editingField, setEditingField] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset when entry changes
  useEffect(() => {
    setEditingField(null)
    setConfirmDelete(false)
  }, [entry?.id])

  if (!entry) return null

  const o = modalOrigin
  const targetW = Math.min(480, window.innerWidth - 40)
  const targetH = 300
  const targetX = (window.innerWidth - targetW) / 2
  const targetY = (window.innerHeight - targetH) / 2
  const fromTransform = o
    ? `translate(${o.left - targetX}px, ${o.top - targetY}px) scale(${o.width / targetW}, ${o.height / targetH})`
    : 'scale(0.9) translateY(30px)'

  const contentAnimation = modalClosing
    ? 'modalContentOut 0.15s ease forwards'
    : 'modalContentIn 0.3s ease 0.2s forwards'
  const contentOpacity = modalClosing ? 1 : 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(42,42,69,0.45)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        animation: modalClosing ? 'modalBgOut 0.35s ease forwards' : 'modalBgIn 0.35s ease forwards',
      }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 480,
        maxHeight: 'calc(100dvh - 140px)', overflowY: 'auto',
        background: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 24,
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', '--from-transform': fromTransform,
        animation: modalClosing ? 'modalMorphOut 0.4s cubic-bezier(0.5,0,0.7,0.4) forwards' : 'modalMorphIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
      }}>
        {/* === HEADER === */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
          animation: modalClosing ? 'modalContentOut 0.15s ease forwards' : 'modalContentIn 0.3s ease 0.25s forwards',
          opacity: contentOpacity,
        }}>
          <span style={{ fontSize: '0.75rem', color: '#9a9ab0', fontWeight: 600, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {editingField === 'date' ? (
              <input type="date" value={editDate} autoFocus onChange={e => setEditDate(e.target.value)} onBlur={() => setEditingField(null)}
                style={{ fontSize: '16px', color: '#9a9ab0', fontFamily: 'var(--font-display)', fontWeight: 600, background: 'none', border: 'none', outline: 'none', padding: 0 }} />
            ) : (
              <span onClick={() => setEditingField('date')} style={{ cursor: 'pointer' }}>{editDate}</span>
            )}
            {' · '}
            {editingField === 'time' ? (
              <input type="time" value={editTime} autoFocus onChange={e => setEditTime(e.target.value)} onBlur={() => setEditingField(null)}
                style={{ fontSize: '16px', color: '#9a9ab0', fontFamily: 'var(--font-display)', fontWeight: 600, background: 'none', border: 'none', outline: 'none', padding: 0 }} />
            ) : (
              <span onClick={() => setEditingField('time')} style={{ cursor: 'pointer' }}>{editTime}</span>
            )}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#9a9ab0',
            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, margin: '-10px -10px -10px 0',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* === BODY (always edit mode) === */}
        <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{
          width: '100%', minHeight: 160, padding: 0, border: 'none', background: 'none', outline: 'none',
          fontSize: '16px', lineHeight: 1.75, color: '#2a2a45', fontFamily: 'inherit', resize: 'vertical', marginBottom: 20,
          animation: contentAnimation, opacity: contentOpacity,
        }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          animation: modalClosing ? 'modalContentOut 0.1s ease forwards' : 'modalContentIn 0.3s ease 0.3s forwards',
          opacity: contentOpacity,
        }}>
          {confirmDelete ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              animation: 'slideUp 0.2s cubic-bezier(0.16,1,0.3,1) both',
            }}>
              <span style={{ fontSize: '0.78rem', color: '#dc3c3c', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
                Sei sicuro?
              </span>
              <button onClick={() => setConfirmDelete(false)} style={{
                background: 'rgba(255,255,255,0.4)', color: 'var(--text-muted)',
                border: '1px solid rgba(255,255,255,0.5)', padding: '6px 14px',
                borderRadius: 100, fontWeight: 600, fontSize: '0.75rem',
                fontFamily: 'var(--font-display)', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={onDelete} style={{
                background: 'rgba(220,60,60,0.15)', color: '#dc3c3c',
                border: '1px solid rgba(220,60,60,0.25)', padding: '6px 14px',
                borderRadius: 100, fontWeight: 600, fontSize: '0.75rem',
                fontFamily: 'var(--font-display)', cursor: 'pointer',
              }}>Delete</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{
              background: 'rgba(220,60,60,0.08)', color: '#dc3c3c',
              border: '1px solid rgba(220,60,60,0.15)', padding: '8px 16px',
              borderRadius: 100, fontWeight: 600, fontSize: '0.78rem',
              fontFamily: 'var(--font-display)', cursor: 'pointer',
            }}>Delete</button>
          )}
          <button className="btn-primary" onClick={onSave} style={{ padding: '10px 28px', fontSize: '0.85rem' }}>Save</button>
        </div>
      </div>
    </div>
  )
}
