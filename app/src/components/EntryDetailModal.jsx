import { useState, useEffect } from 'react'
import { Pencil, X, Sparkles, MessageCircle, SendHorizontal } from 'lucide-react'
import { analyzeEntry } from '../lib/gemini'

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
  const [mode, setMode] = useState('read')
  const [aiAction, setAiAction] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiError, setAiError] = useState(null)
  const [askQuestion, setAskQuestion] = useState('')
  const [editingField, setEditingField] = useState(null)

  // Reset when entry changes
  useEffect(() => {
    setMode('read')
    setAiAction(null)
    setAiLoading(false)
    setAiResult(null)
    setAiError(null)
    setAskQuestion('')
    setEditingField(null)
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

  const handleAction = async (key) => {
    if (aiAction === key && !aiLoading) {
      setAiAction(null)
      setAiResult(null)
      setAiError(null)
      return
    }
    setAiAction(key)
    setAiResult(null)
    setAiError(null)

    if (key === 'ask') return

    setAiLoading(true)
    try {
      const result = await analyzeEntry(entry, key)
      setAiResult(result)
    } catch (e) {
      console.error('AI action failed:', e)
      setAiError(e.message || 'Something went wrong')
    }
    setAiLoading(false)
  }

  const handleAsk = async () => {
    if (!askQuestion.trim() || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    try {
      const result = await analyzeEntry(entry, 'ask', askQuestion.trim())
      setAiResult(result)
    } catch (e) {
      console.error('AI ask failed:', e)
      setAiError(e.message || 'Something went wrong')
    }
    setAiLoading(false)
  }

  const switchToEdit = () => {
    setMode('edit')
    setAiAction(null)
    setAiResult(null)
    setAiError(null)
  }

  const switchToRead = () => {
    setMode('read')
    setEditingField(null)
  }

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
        maxHeight: 'calc(100vh - 140px)', overflowY: 'auto',
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
          {mode === 'read' ? (
            <>
              <span style={{ fontSize: '0.75rem', color: '#9a9ab0', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
                {editDate} · {editTime}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={switchToEdit} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9a9ab0',
                  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}>
                  <Pencil size={15} />
                </button>
                <button onClick={onClose} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9a9ab0',
                  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, margin: '-10px -10px -10px 0',
                }}>
                  <X size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
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
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={switchToRead} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9a9ab0',
                  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, margin: '-10px -10px -10px 0',
                }}>
                  <X size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* === BODY === */}
        {mode === 'read' ? (
          <div style={{ animation: contentAnimation, opacity: contentOpacity }}>
            <p className="entry-read-text" style={{ marginBottom: 0 }}>{entry.text}</p>

            {/* Action chips */}
            <div className="entry-action-tray">
              <button
                className={`hint-chip glass${aiAction === 'analyze' ? ' hint-chip-active' : ''}`}
                onClick={() => handleAction('analyze')}
                disabled={aiLoading}
                style={{
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: aiLoading && aiAction !== 'analyze' ? 0.5 : 1,
                  transition: 'opacity 0.2s, background 0.2s, border-color 0.2s, color 0.2s',
                }}
              >
                <Sparkles size={13} />
                Analyze
              </button>

              <button
                className={`hint-chip glass${aiAction === 'ask' ? ' hint-chip-active' : ''}`}
                onClick={() => handleAction('ask')}
                disabled={aiLoading && aiAction !== 'ask'}
                style={{
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                  opacity: aiLoading && aiAction !== 'ask' ? 0.5 : 1,
                  transition: 'opacity 0.2s, background 0.2s, border-color 0.2s, color 0.2s',
                }}
              >
                <MessageCircle size={13} />
                Ask anything
              </button>
            </div>

            {/* Ask input */}
            {aiAction === 'ask' && (
              <div className="entry-ask-row" style={{ animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1) both' }}>
                <input
                  className="glass-textarea"
                  value={askQuestion}
                  onChange={e => setAskQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
                  placeholder="Ask anything about this entry..."
                  autoFocus
                  style={{ flex: 1, minHeight: 40, padding: '10px 14px', fontSize: '0.85rem', borderRadius: 14 }}
                />
                <button
                  className="feed-send"
                  onClick={handleAsk}
                  disabled={aiLoading || !askQuestion.trim()}
                  style={{ opacity: askQuestion.trim() ? 1 : 0.4, flexShrink: 0 }}
                >
                  <SendHorizontal size={15} />
                </button>
              </div>
            )}

            {aiLoading && (
              <div className="entry-ai-result" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="shimmer-pill" style={{ width: '100%', height: 14 }} />
                <div className="shimmer-pill" style={{ width: '85%', height: 14 }} />
                <div className="shimmer-pill" style={{ width: '70%', height: 14 }} />
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="entry-ai-result glass" style={{ padding: 16, borderRadius: 16, borderLeft: '3px solid var(--amber)' }}>
                <p className="entry-ai-prose" style={{ margin: 0 }}>{aiResult}</p>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="entry-ai-result" style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(220,60,60,0.08)', border: '1px solid rgba(220,60,60,0.15)' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#dc3c3c' }}>{aiError}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{
              width: '100%', minHeight: 160, padding: 0, border: 'none', background: 'none', outline: 'none',
              fontSize: '0.95rem', lineHeight: 1.75, color: '#2a2a45', fontFamily: 'inherit', resize: 'vertical', marginBottom: 20,
              animation: contentAnimation, opacity: contentOpacity,
            }} />
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              animation: modalClosing ? 'modalContentOut 0.1s ease forwards' : 'modalContentIn 0.3s ease 0.3s forwards',
              opacity: contentOpacity,
            }}>
              <button onClick={onDelete} style={{
                background: 'rgba(220,60,60,0.08)', color: '#dc3c3c',
                border: '1px solid rgba(220,60,60,0.15)', padding: '8px 16px',
                borderRadius: 100, fontWeight: 600, fontSize: '0.78rem',
                fontFamily: 'var(--font-display)', cursor: 'pointer',
              }}>Delete</button>
              <button className="btn-primary" onClick={onSave} style={{ padding: '10px 28px', fontSize: '0.85rem' }}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
