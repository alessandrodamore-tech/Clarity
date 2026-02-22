import React, { useState, useRef, useEffect, useCallback } from 'react'
import Vapi from '@vapi-ai/web'

// ─── Icone SVG inline ───────────────────────────────────
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
)

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="currentColor" stroke="none">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
)

// ─── Assistente Vapi inline config ────────────────────────
function buildAssistantConfig(hintsText) {
  const hintsSection = hintsText
    ? `\n\nDomande guida basate sullo storico dell'utente (usale come ispirazione):\n${hintsText}`
    : ''

  return {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sei un assistente di journaling personale chiamato Clarity.
Il tuo compito è fare 2-3 domande brevi e dirette per aiutare l'utente a creare un'annotazione sul proprio stato mentale, fisico ed emotivo della giornata.
Inizia con una domanda aperta, poi vai più in profondità in base alle risposte.
Dopo 2-3 scambi, concludi dicendo "Perfetto, creo l'annotazione" e saluta brevemente.
Parla in italiano, sii naturale e caldo ma conciso. Ogni risposta deve essere massimo 2 frasi.${hintsSection}`,
        },
      ],
    },
    voice: {
      provider: 'playht',
      voiceId: 'jennifer',
    },
    firstMessage: 'Ciao! Come stai oggi?',
    endCallMessage: 'Perfetto, creo l\'annotazione. A presto!',
    endCallPhrases: ['creo l\'annotazione', 'a presto', 'arrivederci'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'it',
    },
    // Chiudi la chiamata dopo un silenzio di 3s alla fine
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 300,
  }
}

// ─── Estrai testo utente dalla trascrizione ───────────────
function buildEntryFromTranscript(messages) {
  if (!messages || messages.length === 0) return null

  const userLines = messages
    .filter(m => m.role === 'user' && m.content?.trim())
    .map(m => m.content.trim())

  if (userLines.length === 0) return null

  // Combina le risposte dell'utente in un unico testo
  return userLines.join(' | ')
}

// ─── Componente principale ────────────────────────────────
export default function VoiceChat({ vapiPublicKey, onEntryCreated, hints = [] }) {
  const [status, setStatus] = useState('idle') // idle | connecting | listening | thinking | speaking | ending
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [showTooltip, setShowTooltip] = useState(false)

  const vapiRef = useRef(null)
  const hasCreatedEntry = useRef(false)

  // Testo degli hint come stringa per il system prompt
  const hintsText = hints
    .slice(0, 4)
    .map(h => `- ${h.text || h}`)
    .join('\n')

  // ── Inizializza Vapi ──────────────────────────────────────
  const initVapi = useCallback(() => {
    if (!vapiPublicKey || vapiPublicKey === 'PLACEHOLDER_DA_SOSTITUIRE') return null

    const vapi = new Vapi(vapiPublicKey)

    vapi.on('call-start', () => {
      setStatus('listening')
      setError(null)
      setTranscript([])
      hasCreatedEntry.current = false
    })

    vapi.on('speech-start', () => {
      setStatus('speaking')
    })

    vapi.on('speech-end', () => {
      setStatus('listening')
    })

    vapi.on('message', (msg) => {
      // Accumula trascrizione
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setTranscript(prev => [...prev, {
          role: msg.role,
          content: msg.transcript,
        }])
      }
      // Stato thinking quando l'AI sta elaborando
      if (msg.type === 'model-output') {
        setStatus('thinking')
      }
    })

    vapi.on('call-end', () => {
      setStatus('ending')
      // Piccolo delay per permettere all'utente di vedere lo stato "ending"
      setTimeout(() => {
        setStatus('idle')
      }, 1500)
    })

    vapi.on('error', (err) => {
      console.error('[VoiceChat] Vapi error:', err)
      setError('Errore durante la chiamata. Riprova.')
      setStatus('idle')
    })

    return vapi
  }, [vapiPublicKey])

  // ── Crea entry quando la trascrizione è disponibile e la chiamata finisce ──
  useEffect(() => {
    if (status === 'ending' && transcript.length > 0 && !hasCreatedEntry.current) {
      hasCreatedEntry.current = true
      const entryText = buildEntryFromTranscript(transcript)
      if (entryText && onEntryCreated) {
        onEntryCreated(entryText)
      }
    }
  }, [status, transcript, onEntryCreated])

  // ── Avvia chiamata ─────────────────────────────────────────
  const startCall = async () => {
    if (!vapiPublicKey || vapiPublicKey === 'PLACEHOLDER_DA_SOSTITUIRE') {
      setError('API key Vapi non configurata. Aggiungi VITE_VAPI_PUBLIC_KEY in .env.local')
      return
    }

    try {
      setStatus('connecting')
      setError(null)

      if (!vapiRef.current) {
        vapiRef.current = initVapi()
      }

      const assistantConfig = buildAssistantConfig(hintsText)
      await vapiRef.current.start(assistantConfig)
    } catch (err) {
      console.error('[VoiceChat] Failed to start:', err)
      setError('Impossibile avviare la chat vocale. Controlla i permessi del microfono.')
      setStatus('idle')
    }
  }

  // ── Termina chiamata ───────────────────────────────────────
  const stopCall = () => {
    if (vapiRef.current) {
      try {
        vapiRef.current.stop()
      } catch (err) {
        console.error('[VoiceChat] Failed to stop:', err)
      }
    }
    setStatus('ending')
    setTimeout(() => setStatus('idle'), 1500)
  }

  // ── Cleanup al unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        try { vapiRef.current.stop() } catch {}
      }
    }
  }, [])

  // ── Etichette stato ────────────────────────────────────────
  const statusConfig = {
    idle: { label: 'Parla con Clarity', color: 'var(--text-light)' },
    connecting: { label: 'Connessione...', color: 'var(--amber)' },
    listening: { label: 'Ti ascolto...', color: '#4CAF50' },
    thinking: { label: 'Sto pensando...', color: 'var(--amber)' },
    speaking: { label: 'Clarity parla...', color: '#9c88ff' },
    ending: { label: 'Creo annotazione...', color: 'var(--amber)' },
  }

  const isActive = ['connecting', 'listening', 'thinking', 'speaking'].includes(status)
  const { color } = statusConfig[status] || statusConfig.idle

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {/* Tooltip errore */}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(220, 80, 80, 0.92)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: 12,
          fontSize: '0.75rem',
          maxWidth: 260,
          whiteSpace: 'normal',
          textAlign: 'center',
          zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          lineHeight: 1.4,
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', marginLeft: 8, fontSize: '0.8rem' }}
          >✕</button>
        </div>
      )}

      {/* Tooltip "ending" */}
      {status === 'ending' && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          color: 'var(--text)',
          padding: '8px 14px',
          borderRadius: 12,
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}>
          ✍️ Creo annotazione...
        </div>
      )}

      {/* Bottone principale */}
      <button
        onClick={isActive ? stopCall : startCall}
        disabled={status === 'connecting' || status === 'ending'}
        title={isActive ? 'Termina chat vocale' : 'Avvia chat vocale con Clarity'}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          cursor: status === 'connecting' || status === 'ending' ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isActive ? '#fff' : color,
          background: isActive
            ? `linear-gradient(135deg, ${color}cc, ${color}88)`
            : 'rgba(255,255,255,0.2)',
          backdropFilter: 'blur(24px) saturate(190%)',
          WebkitBackdropFilter: 'blur(24px) saturate(190%)',
          border: `1px solid ${isActive ? color + '66' : 'rgba(255,255,255,0.5)'}`,
          boxShadow: isActive
            ? `0 0 0 4px ${color}22, 0 8px 24px ${color}33, inset 0 1px 0 rgba(255,255,255,0.4)`
            : '0 8px 32px rgba(100,80,160,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isActive ? 'scale(1.05)' : 'scale(1)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {/* Pulse animation quando attivo */}
        {isActive && (
          <span style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: color,
            opacity: 0.15,
            animation: 'voicePulse 1.5s ease-in-out infinite',
          }} />
        )}

        {/* Spinner quando connecting/ending */}
        {(status === 'connecting' || status === 'ending') ? (
          <span style={{
            width: 18,
            height: 18,
            border: `2px solid ${color}44`,
            borderTop: `2px solid ${color}`,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            display: 'block',
          }} />
        ) : isActive ? (
          <StopIcon />
        ) : (
          <MicIcon />
        )}
      </button>

      {/* Stile CSS inline per animazioni */}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
