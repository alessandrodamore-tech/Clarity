import React, { useState, useRef, useEffect } from 'react'
import Vapi from '@vapi-ai/web'
import { generateAnnotationFromVoiceChat } from '../lib/gemini'
import { useToast } from '../lib/useToast'

// ─── iOS Safari / feature detection helpers ───────────────────────────────────

/** True on iOS Safari (includes Chrome/Firefox on iOS which use WebKit) */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** True if the browser supports getUserMedia at all */
const hasMediaDevices = () =>
  !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')

/**
 * On iOS Safari, WebRTC / getUserMedia can fail with AbortError if the audio
 * session hasn't been activated yet. Calling getUserMedia eagerly from a button
 * tap (synchronous user gesture chain) is the most reliable approach.
 * This utility pre-warms the audio session and releases it immediately.
 * Must be called directly from a click handler — NOT after an await.
 */
async function prewarmAudioSession() {
  if (!hasMediaDevices()) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Release immediately — we only needed the permission prompt & session init
    stream.getTracks().forEach(t => t.stop())
  } catch {
    // Ignore — Vapi will handle permission errors with its own error event
  }
}

// ─── Icona waveform (bottone) ─────────────────────────────
const VoiceWaveIcon = ({ animated = false }) => (
  <svg width="20" height="16" viewBox="0 0 20 16" fill="currentColor" style={{ display: 'block' }}>
    <rect x="0" y="5" width="2.5" height="6" rx="1.25"
      style={animated ? { animation: 'waveBar1 0.7s ease-in-out infinite', transformOrigin: '1.25px 8px' } : undefined} />
    <rect x="4.5" y="2" width="2.5" height="12" rx="1.25"
      style={animated ? { animation: 'waveBar2 0.7s ease-in-out infinite 0.1s', transformOrigin: '5.75px 8px' } : undefined} />
    <rect x="9" y="0" width="2.5" height="16" rx="1.25"
      style={animated ? { animation: 'waveBar3 0.7s ease-in-out infinite 0.2s', transformOrigin: '10.25px 8px' } : undefined} />
    <rect x="13.5" y="2" width="2.5" height="12" rx="1.25"
      style={animated ? { animation: 'waveBar2 0.7s ease-in-out infinite 0.3s', transformOrigin: '14.75px 8px' } : undefined} />
    <rect x="18" y="5" width="2.5" height="6" rx="1.25"
      style={animated ? { animation: 'waveBar1 0.7s ease-in-out infinite 0.4s', transformOrigin: '19.25px 8px' } : undefined} />
  </svg>
)

// ─── Waveform animata grande (per l'overlay) ──────────────
const BigWaveIcon = ({ status }) => {
  const colors = {
    listening: '#4CAF50',
    speaking: '#9c88ff',
    thinking: '#E8A838',
    connecting: '#E8A838',
  }
  const color = colors[status] || '#aaa'
  const animated = ['listening', 'speaking', 'thinking'].includes(status)
  return (
    <svg width="48" height="32" viewBox="0 0 48 32" fill={color} style={{ display: 'block' }}>
      {[0,8,16,24,32,40].map((x, i) => {
        const heights = [12, 24, 32, 28, 20, 14]
        const h = heights[i]
        const y = (32 - h) / 2
        const delays = [0, 0.1, 0.2, 0.15, 0.05, 0.12]
        return (
          <rect key={i} x={x} y={y} width="5" height={h} rx="2.5"
            style={animated ? {
              animation: `waveBar${(i % 3) + 1} ${0.6 + i * 0.05}s ease-in-out infinite`,
              animationDelay: `${delays[i]}s`,
              transformOrigin: `${x + 2.5}px 16px`,
            } : undefined}
          />
        )
      })}
    </svg>
  )
}

// ─── Componente principale ────────────────────────────────
export default function VoiceChat({
  vapiPublicKey,
  assistantId,
  onEntryCreated,
  hints = [],
  userContext = '',
  hideWhenText = false,
}) {
  const toast = useToast()
  const [status, setStatus] = useState('idle')
  const [showModal, setShowModal] = useState(false)
  const [messages, setMessages] = useState([]) // [{role, content, id}]
  const [error, setError] = useState(null)
  const [modalClosing, setModalClosing] = useState(false)

  const vapiRef = useRef(null)
  const hasCreatedEntry = useRef(false)
  const callEndedNaturally = useRef(false)
  const transcriptRef = useRef([])
  const onEntryCreatedRef = useRef(onEntryCreated)
  const messagesEndRef = useRef(null)
  useEffect(() => { onEntryCreatedRef.current = onEntryCreated }, [onEntryCreated])

  // Auto-scroll alla fine dei messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Inizializza Vapi ───────────────────────────────────────
  const getVapi = () => {
    if (vapiRef.current) return vapiRef.current
    if (!vapiPublicKey) return null

    const vapi = new Vapi(vapiPublicKey)

    vapi.on('call-start', () => {
      setStatus('listening')
      setError(null)
      setMessages([])
      transcriptRef.current = []
      hasCreatedEntry.current = false
      callEndedNaturally.current = false
    })

    vapi.on('speech-start', () => {
      // Detect who's speaking based on recent context (Vapi emits for both)
      setStatus('speaking')
    })

    vapi.on('speech-end', () => setStatus('listening'))

    vapi.on('message', (msg) => {
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        const entry = { role: msg.role, content: msg.transcript }
        transcriptRef.current = [...transcriptRef.current, entry]
        setMessages(prev => [...prev, { ...entry, id: Date.now() + Math.random() }])
      }
      if (msg.type === 'model-output') setStatus('thinking')
    })

    vapi.on('call-end', () => {
      callEndedNaturally.current = true
      const conv = transcriptRef.current

      if (conv.length > 0 && !hasCreatedEntry.current) {
        hasCreatedEntry.current = true
        setStatus('ending')
        generateAnnotationFromVoiceChat(conv)
          .then(annotation => {
            if (annotation && onEntryCreatedRef.current) onEntryCreatedRef.current(annotation)
          })
          .catch(e => console.error('[VoiceChat] Annotation failed:', e))
          .finally(() => {
            setStatus('idle')
            closeModal()
          })
      } else {
        setStatus('idle')
        closeModal()
      }
    })

    vapi.on('error', (err) => {
      if (callEndedNaturally.current) return
      console.error('[VoiceChat] error:', err)

      // Classify error for better UX, especially on iOS Safari
      const msg = err?.message || String(err)
      let userMsg = 'Connection error. Try again.'
      if (msg.toLowerCase().includes('abort')) {
        userMsg = isIOS()
          ? 'Audio session interrupted. Close other apps using the mic and try again.'
          : 'Audio connection aborted. Please try again.'
      } else if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')) {
        userMsg = 'Microphone permission denied. Please allow access in your browser settings.'
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('ice')) {
        userMsg = 'Network error. Check your connection and try again.'
      }
      toast.error(userMsg)
      setError(null)
      setStatus('idle')
    })

    vapiRef.current = vapi
    return vapi
  }

  // ── Apri modal e avvia chiamata ────────────────────────────
  const startCall = async () => {
    if (!vapiPublicKey || !assistantId) {
      setError('Vapi not configured.')
      return
    }

    // ── iOS Safari: feature detection ─────────────────────────
    if (!hasMediaDevices()) {
      setError(
        isIOS()
          ? 'Microphone not available. Open Clarity in Safari (not an in-app browser) and allow microphone access in Settings → Safari → Microphone.'
          : 'Microphone access is not supported in this browser.'
      )
      return
    }

    setShowModal(true)
    setModalClosing(false)
    setMessages([])
    setError(null)
    setStatus('connecting')

    try {
      // ── iOS Safari: pre-warm the audio session ────────────────
      // On iOS, getUserMedia must be triggered directly from a user gesture.
      // Calling it here (still in the synchronous click-event microtask chain)
      // activates the audio session before Daily/Vapi tries to claim it,
      // preventing AbortError: "The operation was aborted".
      if (isIOS()) {
        await prewarmAudioSession()
      }

      const vapi = getVapi()
      const hintsText = hints.length > 0
        ? hints.slice(0, 5).map(h => `- ${h.text || h}`).join('\n')
        : ''

      // Detect language from browser locale
      const lang = navigator.language?.startsWith('it') ? 'Italian' : 'English'
      const firstMsg = lang === 'Italian' ? "Di' pure, ti ascolto." : "Go ahead, I'm listening."

      await vapi.start(assistantId, {
        // firstMessage as direct override (not variableValue — that field doesn't support variables)
        firstMessage: firstMsg,
        variableValues: {
          userContext: userContext || '',
          hints: hintsText,
          language: lang,
        },
      })
    } catch (err) {
      console.error('[VoiceChat] Failed to start:', err)

      // ── iOS-specific error classification ─────────────────────
      const isAbort = err?.name === 'AbortError' || err?.message?.includes('abort')
      const isPermission = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      const isNotFound = err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError'

      let msg = 'Could not start voice chat. Please try again.'
      if (isPermission) {
        msg = isIOS()
          ? 'Microphone blocked. Go to Settings → Safari → Microphone and allow access for this site.'
          : 'Microphone permission denied. Please allow access and try again.'
      } else if (isNotFound) {
        msg = 'No microphone found on this device.'
      } else if (isAbort) {
        msg = isIOS()
          ? 'Audio session interrupted (iOS). Close other apps using the microphone and try again.'
          : 'Audio connection aborted. Please try again.'
      }

      toast.error(msg)
      setError(null)
      setStatus('idle')
    }
  }

  // ── Termina chiamata manualmente ───────────────────────────
  const stopCall = () => {
    callEndedNaturally.current = true
    try { vapiRef.current?.stop() } catch {}
    setStatus('ending')
  }

  // ── Chiudi modal con animazione ────────────────────────────
  const closeModal = () => {
    setModalClosing(true)
    setTimeout(() => {
      setShowModal(false)
      setModalClosing(false)
    }, 350)
  }

  // ── Cleanup al unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        try { vapiRef.current.stop() } catch {}
        vapiRef.current = null
      }
    }
  }, [])

  const isActive = ['connecting', 'listening', 'thinking', 'speaking'].includes(status)
  const isEnding = status === 'ending'
  const hidden = hideWhenText && !isActive && !showModal

  // ── iOS: stop call when app is backgrounded ────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && isActive) {
        stopCall()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusLabel = {
    connecting: 'Connecting...',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
    ending: 'Creating annotation...',
    idle: '',
  }

  const statusColor = {
    listening: '#4CAF50',
    speaking: '#9c88ff',
    thinking: '#E8A838',
    connecting: '#E8A838',
    ending: '#E8A838',
  }
  const color = statusColor[status] || 'var(--text-light)'

  return (
    <>
      {/* ── Bottone nella input bar ── */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transition: 'opacity 0.2s ease',
        flexShrink: 0,
      }}>
        <button
          onClick={isActive || showModal ? stopCall : startCall}
          disabled={isEnding}
          title={isActive ? 'End voice chat' : 'Talk to Clarity'}
          style={{
            width: 36, height: 36,
            borderRadius: 12,
            cursor: isEnding ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isActive ? '#fff' : 'var(--text-light)',
            background: isActive ? `linear-gradient(135deg, ${color}dd, ${color}99)` : 'transparent',
            border: isActive ? `1px solid ${color}55` : '1px solid transparent',
            boxShadow: isActive ? `0 0 0 3px ${color}20, 0 4px 12px ${color}30` : 'none',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: 0,
          }}
        >
          {isEnding ? (
            <span style={{
              width: 16, height: 16,
              border: `2px solid ${color}44`,
              borderTop: `2px solid ${color}`,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              display: 'block',
            }} />
          ) : (
            <VoiceWaveIcon animated={isActive} />
          )}
        </button>
      </div>

      {/* ── Modal overlay ── */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: modalClosing ? 'fadeOut 0.35s ease forwards' : 'fadeIn 0.25s ease',
        }}
          onClick={e => { if (e.target === e.currentTarget && !isActive) closeModal() }}
        >
          <div style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(40px) saturate(200%)',
            WebkitBackdropFilter: 'blur(40px) saturate(200%)',
            borderRadius: '28px 28px 0 0',
            padding: '0 0 env(safe-area-inset-bottom, 20px)',
            maxHeight: '75vh',
            display: 'flex',
            flexDirection: 'column',
            animation: modalClosing ? 'slideDown 0.35s cubic-bezier(0.16,1,0.3,1) forwards' : 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: color,
                  boxShadow: isActive ? `0 0 8px ${color}` : 'none',
                  animation: status === 'listening' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--navy)' }}>
                  Clarity
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginLeft: 4 }}>
                  {statusLabel[status]}
                </span>
              </div>

              {/* Waveform / status */}
              <BigWaveIcon status={status} />
            </div>

            {/* Transcript */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 120,
            }}>
              {messages.length === 0 && (
                <p style={{
                  textAlign: 'center',
                  color: 'var(--text-light)',
                  fontSize: '0.85rem',
                  margin: 'auto',
                  opacity: 0.7,
                }}>
                  {status === 'connecting' ? 'Connecting...' : 'Start speaking...'}
                </p>
              )}

              {messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    animation: 'fadeInUp 0.25s ease',
                  }}
                >
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #667eea, #764ba2)'
                      : 'rgba(0,0,0,0.07)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text)',
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    boxShadow: msg.role === 'user' ? '0 2px 8px rgba(102,126,234,0.3)' : 'none',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Ending state */}
              {isEnding && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeInUp 0.25s ease' }}>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '18px 18px 18px 4px',
                    background: 'rgba(232,168,56,0.12)',
                    color: 'var(--amber)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                  }}>
                    ✍️ Creating annotation...
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(220,80,80,0.1)', color: '#c0392b',
                  fontSize: '0.82rem', textAlign: 'center',
                }}>
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Footer — stop button */}
            <div style={{
              padding: '16px 24px 20px',
              display: 'flex',
              justifyContent: 'center',
              flexShrink: 0,
              borderTop: '1px solid rgba(0,0,0,0.06)',
            }}>
              <button
                onClick={stopCall}
                disabled={isEnding}
                style={{
                  width: 56, height: 56,
                  borderRadius: '50%',
                  background: isEnding ? 'rgba(0,0,0,0.08)' : 'rgba(220,80,80,0.12)',
                  border: 'none',
                  cursor: isEnding ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  color: isEnding ? 'var(--text-light)' : '#c0392b',
                }}
              >
                {isEnding ? (
                  <span style={{
                    width: 20, height: 20,
                    border: '2px solid rgba(0,0,0,0.15)',
                    borderTop: '2px solid var(--amber)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    display: 'block',
                  }} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes waveBar1 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.35); } }
        @keyframes waveBar2 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.55); } }
        @keyframes waveBar3 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.25); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
      `}</style>
    </>
  )
}
