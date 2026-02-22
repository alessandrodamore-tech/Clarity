import React, { useState, useRef, useEffect, useCallback } from 'react'
import Vapi from '@vapi-ai/web'
import { generateAnnotationFromVoiceChat } from '../lib/gemini'

// ─── Icona waveform (5 barre equalizer) ──────────────────
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

// ─── Assistente Vapi inline config ────────────────────────
function buildAssistantConfig(hints) {
  // Usa le hint chips come domande effettive da fare all'utente
  const hintQuestions = hints && hints.length > 0
    ? hints.slice(0, 5).map(h => `- ${h.text || h}`).join('\n')
    : null

  const questionsBlock = hintQuestions
    ? `\nFai queste domande specifiche all'utente (nell'ordine che senti più naturale, non farle tutte se non è necessario):\n${hintQuestions}`
    : '\nFai 2-3 domande aperte sul loro stato fisico, emotivo e sulle attività della giornata.'

  return {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sei un assistente di journaling personale chiamato Clarity.
Il tuo compito è fare domande brevi e dirette per aiutare l'utente a raccontare com'è andata la giornata.
${questionsBlock}

Regole:
- Fai UNA domanda alla volta, aspetta la risposta prima di andare avanti
- Sii naturale e caldo, come un amico che chiede com'è andata
- Ogni risposta deve essere massimo 2 frasi
- Dopo 2-3 scambi, concludi dicendo "Perfetto, creo l'annotazione" e saluta brevemente
- Parla in italiano`,
        },
      ],
    },
    voice: {
      provider: 'openai',
      voiceId: 'shimmer',
    },
    firstMessage: 'Ciao! Come stai?',
    endCallMessage: "Perfetto, creo l'annotazione. A presto!",
    endCallPhrases: ["creo l'annotazione", 'a presto', 'arrivederci'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'it',
    },
    silenceTimeoutSeconds: 20,
    maxDurationSeconds: 300,
  }
}

// ─── Componente principale ────────────────────────────────
export default function VoiceChat({ vapiPublicKey, onEntryCreated, hints = [], hideWhenText = false }) {
  const [status, setStatus] = useState('idle') // idle | connecting | listening | thinking | speaking | ending
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState([]) // [{role, content}]

  const vapiRef = useRef(null)
  const hasCreatedEntry = useRef(false)
  const callEndedNaturally = useRef(false)

  // ── Inizializza Vapi (una sola istanza) ───────────────────
  const getVapi = useCallback(() => {
    if (vapiRef.current) return vapiRef.current
    if (!vapiPublicKey || vapiPublicKey === 'PLACEHOLDER_DA_SOSTITUIRE') return null

    const vapi = new Vapi(vapiPublicKey)

    vapi.on('call-start', () => {
      setStatus('listening')
      setError(null)
      setTranscript([])
      hasCreatedEntry.current = false
      callEndedNaturally.current = false
    })

    vapi.on('speech-start', () => setStatus('speaking'))
    vapi.on('speech-end', () => setStatus('listening'))

    vapi.on('message', (msg) => {
      // Accumula trascrizione completa (utente + assistente)
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setTranscript(prev => [...prev, {
          role: msg.role, // 'user' | 'assistant'
          content: msg.transcript,
        }])
      }
      if (msg.type === 'model-output') setStatus('thinking')
    })

    vapi.on('call-end', () => {
      callEndedNaturally.current = true
      setStatus('ending')
    })

    vapi.on('error', (err) => {
      // Ignora errori che arrivano dopo che la chiamata è già finita naturalmente
      if (callEndedNaturally.current) return
      console.error('[VoiceChat] Vapi error:', err)
      setError('Errore durante la chiamata. Riprova.')
      setStatus('idle')
    })

    vapiRef.current = vapi
    return vapi
  }, [vapiPublicKey])

  // ── Genera annotazione da Gemini e crea entry ──────────────
  useEffect(() => {
    if (status !== 'ending' || hasCreatedEntry.current || transcript.length === 0) return
    hasCreatedEntry.current = true

    const createEntry = async () => {
      try {
        // Passa tutta la conversazione a Gemini per generare annotazione in prima persona
        const annotation = await generateAnnotationFromVoiceChat(transcript)
        if (annotation && onEntryCreated) {
          await onEntryCreated(annotation)
        }
      } catch (e) {
        console.error('[VoiceChat] Failed to create annotation:', e)
      } finally {
        setStatus('idle')
      }
    }

    createEntry()
  }, [status, transcript, onEntryCreated])

  // ── Avvia chiamata ─────────────────────────────────────────
  const startCall = async () => {
    if (!vapiPublicKey || vapiPublicKey === 'PLACEHOLDER_DA_SOSTITUIRE') {
      setError('API key Vapi non configurata.')
      return
    }
    try {
      setStatus('connecting')
      setError(null)
      const vapi = getVapi()
      await vapi.start(buildAssistantConfig(hints))
    } catch (err) {
      console.error('[VoiceChat] Failed to start:', err)
      setError('Impossibile avviare la chat vocale. Controlla i permessi microfono.')
      setStatus('idle')
    }
  }

  // ── Termina chiamata manualmente ───────────────────────────
  const stopCall = () => {
    callEndedNaturally.current = true
    try { vapiRef.current?.stop() } catch {}
    setStatus('ending')
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

  // ── Stato UI ───────────────────────────────────────────────
  const statusColor = {
    idle: 'var(--text-light)',
    connecting: 'var(--amber)',
    listening: '#4CAF50',
    thinking: 'var(--amber)',
    speaking: '#9c88ff',
    ending: 'var(--amber)',
  }

  const isActive = ['connecting', 'listening', 'thinking', 'speaking'].includes(status)
  const isLoading = status === 'connecting' || status === 'ending'
  const color = statusColor[status] || statusColor.idle
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

      {/* Bottone */}
      <button
        onClick={isActive ? stopCall : startCall}
        disabled={isLoading}
        title={isActive ? 'Termina chat vocale' : 'Parla con Clarity'}
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          cursor: isLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isActive ? '#fff' : 'var(--text-light)',
          background: isActive
            ? `linear-gradient(135deg, ${color}dd, ${color}99)`
            : 'transparent',
          border: isActive ? `1px solid ${color}55` : '1px solid transparent',
          boxShadow: isActive
            ? `0 0 0 3px ${color}20, 0 4px 12px ${color}30`
            : 'none',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          padding: 0,
        }}
      >
        {isLoading ? (
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes waveBar1 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.35); } }
        @keyframes waveBar2 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.55); } }
        @keyframes waveBar3 { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.25); } }
      `}</style>
    </div>
  )
}
