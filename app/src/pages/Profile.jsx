import { useState, useEffect } from 'react'
import { useApp } from '../lib/store'
import { User, Check, Info } from 'lucide-react'

const CONTEXT_KEY = 'clarity_user_context'

export default function Profile() {
  const { user } = useApp()
  const [context, setContext] = useState('')
  const [saved, setSaved] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setMounted(true)) }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTEXT_KEY)
      if (stored) setContext(stored)
    } catch {}
  }, [])

  const handleSave = () => {
    try {
      if (context.trim()) {
        localStorage.setItem(CONTEXT_KEY, context.trim())
      } else {
        localStorage.removeItem(CONTEXT_KEY)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
  }

  const sectionAnim = (delay) => ({
    animation: mounted ? `slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both` : undefined,
  })

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text)', margin: 0 }}>
        Profile
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: 4, marginBottom: 20 }}>
        Help Clarity understand you better
      </p>

      {/* User info */}
      <div className="glass" style={{
        borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem',
        ...sectionAnim(0),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(232,168,56,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={20} style={{ color: 'var(--amber)' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User'}
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-light)' }}>
              {user?.email || ''}
            </p>
          </div>
        </div>
      </div>

      {/* AI Context */}
      <div className="glass" style={{
        borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1.25rem',
        ...sectionAnim(80),
      }}>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700,
          color: 'var(--text)', margin: '0 0 6px',
        }}>
          AI Context
        </h3>
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
          onClick={handleSave}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}
        >
          {saved ? <><Check size={16} /> Saved</> : 'Save Context'}
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

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
