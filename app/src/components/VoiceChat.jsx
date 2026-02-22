import React, { useState, useRef, useEffect, useCallback } from 'react'
import Vapi from '@vapi-ai/web'

// ─── Icone SVG inline ───────────────────────────────────
// Chat bubble con waveform inside — comunica chiaramente "chat vocale"
const VoiceWaveIcon = ({ animated = false }) => (
  <svg width="22" height="21" viewBox="0 0 22 21" fill="currentColor" style={{ display: 'block' }}>
    {/* Chat bubble */}
    <path
      d="M2 1h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7.5L2 18V2a1 1 0 0 1 1-1z"
      fillOpacity="0.12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="currentColor"
    />
    {/* Waveform bars inside the bubble */}
    <rect x="5.5" y="7" width="1.8" height="3" rx="0.9"
      style={animated ? { animation: 'waveBar1 0.7s ease-in-out infinite', transformOrigin: '6.4px 8.5px' } : undefined} />
    <rect x="8.5" y="5.5" width="1.8" height="6" rx="0.9"
      style={animated ? { animation: 'waveBar2 0.7s ease-in-out infinite 0.1s', transformOrigin: '9.4px 8.5px' } : undefined} />
    <rect x="11.5" y="4.5" width="1.8" height="8" rx="0.9"
      style={animated ? { animation: 'waveBar3 0.7s ease-in-out infinite 0.2s', transformOrigin: '12.4px 8.5px' } : undefined} />
    <rect x="14.5" y="5.5" width="1.8" height="6" rx="0.9"
      style={animated ? { animation: 'waveBar2 0.7s ease-in-out infinite 0.3s', transformOrigin: '15.4px 8.5px' } : undefined} />
  </svg>
)

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
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
      provider: 'openai',
      voiceId: 'shimmer',
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
export default function VoiceChat({ vapiPublicKey, onEntryCreated, hints = [], hideWhenText = false }) {
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

  // Nascondi se c'è testo nell'input e non siamo attivi
  const hidden = hideWhenText && !isActive

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      opacity: hidden ? 0 : 1,
      pointerEvents: hidden ? 'none' : 'auto',
      transition: 'opacity 0.2s ease',
      flexShrink: 0,
    }}>
      {/* Tooltip errore */}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 10px)',
          right: 0,
          background: 'rgba(220, 80, 80, 0.92)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: 12,
          fontSize: '0.75rem',
          maxWidth: 240,
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
          right: 0,
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

      {/* Bottone principale — inline, stesso stile del send button */}
      <button
        onClick={isActive ? stopCall : startCall}
        disabled={status === 'connecting' || status === 'ending'}
        title={isActive ? 'Termina chat vocale' : 'Parla con Clarity'}
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          cursor: status === 'connecting' || status === 'ending' ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isActive ? '#fff' : 'var(--text-light)',
          background: isActive
            ? `linear-gradient(135deg, ${color}dd, ${color}99)`
            : 'transparent',
          border: isActive
            ? `1px solid ${color}55`
            : '1px solid transparent',
          boxShadow: isActive
            ? `0 0 0 3px ${color}20, 0 4px 12px ${color}30`
            : 'none',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        {/* Spinner quando connecting/ending */}
        {(status === 'connecting' || status === 'ending') ? (
          <span style={{
            width: 16,
            height: 16,
            border: `2px solid ${color}44`,
            borderTop: `2px solid ${color}`,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            display: 'block',
          }} />
        ) : isActive ? (
          // Waveform animata quando attivo — tocca per fermare
          <VoiceWaveIcon animated={true} />
        ) : (
          <VoiceWaveIcon animated={false} />
        )}
      </button>

      {/* CSS animazioni */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes waveBar1 {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.4); }
        }
        @keyframes waveBar2 {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.6); }
        }
        @keyframes waveBar3 {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.3); }
        }
      `}</style>
    </div>
  )
}
