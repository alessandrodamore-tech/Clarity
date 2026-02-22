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
  const hintContext = hints && hints.length > 0
    ? `\nSe l'utente non menziona spontaneamente questi aspetti, potresti chiedere (scegli al massimo 1-2, solo se pertinenti):\n${hints.slice(0, 4).map(h => `- ${h.text || h}`).join('\n')}`
    : ''

  return {
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sei un assistente di journaling personale chiamato Clarity. Il tuo ruolo è ascoltare, non interrogare.

Flusso della conversazione:
1. L'utente parla liberamente — tu ASCOLTI senza interrompere
2. Solo dopo che ha finito, fai AL MASSIMO 1-2 domande di follow-up brevi, solo se ci sono cose poco chiare o aspetti importanti che non ha menzionato
3. Quando hai abbastanza, concludi con "Perfetto, creo l'annotazione"
${hintContext}

Regole assolute:
- NON fare domande lunghe o multiple
- NON anticipare o interrompere l'utente
- Risposte brevissime (1 frase max)
- Parla in italiano
- Se l'utente ha già detto abbastanza, vai direttamente a "Perfetto, creo l'annotazione"`,
        },
      ],
    },
    voice: {
      provider: 'openai',
      voiceId: 'shimmer',
    },
    firstMessage: 'Ciao, di pure.',
    endCallMessage: "Perfetto, creo l'annotazione.",
    endCallPhrases: ["creo l'annotazione", 'annotazione', 'a presto', 'arrivederci'],
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'it',
    },
    silenceTimeoutSeconds: 25,
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
  const transcriptRef = useRef([]) // ref sincrono, sempre aggiornato anche in call-end
  const onEntryCreatedRef = useRef(onEntryCreated)
  useEffect(() => { onEntryCreatedRef.current = onEntryCreated }, [onEntryCreated])

  // ── Inizializza Vapi (una sola istanza) ───────────────────
  const getVapi = useCallback(() => {
    if (vapiRef.current) return vapiRef.current
    if (!vapiPublicKey || vapiPublicKey === 'PLACEHOLDER_DA_SOSTITUIRE') return null

    const vapi = new Vapi(vapiPublicKey)

    vapi.on('call-start', () => {
      setStatus('listening')
      setError(null)
      setTranscript([])
      transcriptRef.current = []
      hasCreatedEntry.current = false
      callEndedNaturally.current = false
    })

    vapi.on('speech-start', () => setStatus('speaking'))
    vapi.on('speech-end', () => setStatus('listening'))

    vapi.on('message', (msg) => {
      // Accumula trascrizione completa (utente + assistente) sia nel ref (sincrono) che nello stato
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        const entry = { role: msg.role, content: msg.transcript }
        transcriptRef.current = [...transcriptRef.current, entry]
        setTranscript(prev => [...prev, entry])
      }
      if (msg.type === 'model-output') setStatus('thinking')
    })

    vapi.on('call-end', () => {
      callEndedNaturally.current = true
      const conv = transcriptRef.current

      if (conv.length > 0 && !hasCreatedEntry.current) {
        hasCreatedEntry.current = true
        setStatus('ending')
        // Genera annotazione direttamente qui — non aspettare il useEffect con lo stato
        generateAnnotationFromVoiceChat(conv)
          .then(annotation => {
            if (annotation && onEntryCreatedRef.current) onEntryCreatedRef.current(annotation)
          })
          .catch(e => console.error('[VoiceChat] Annotation failed:', e))
          .finally(() => setStatus('idle'))
      } else {
        setStatus('idle')
      }
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
