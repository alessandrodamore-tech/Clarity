import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError('Check your email for confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/app')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="bg-mesh" />

      <div className="glass" style={{
        maxWidth: 400, width: '100%', borderRadius: 'var(--radius-lg)', padding: 36,
        animation: 'fadeIn 0.4s ease',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '2.5rem',
          color: 'var(--navy)', letterSpacing: '-0.03em', marginBottom: 8, textAlign: 'center',
        }}>Clarity.</h1>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <a href="/" style={{
            fontSize: '0.8rem', color: 'var(--text-light)', textDecoration: 'none',
            transition: 'color 0.2s',
          }} onMouseOver={e => e.target.style.color = 'var(--text-muted)'} onMouseOut={e => e.target.style.color = 'var(--text-light)'}>← Back to homepage</a>
        </div>

        {/* Tab toggle */}
        <div className="glass" style={{ borderRadius: 14, padding: 4, display: 'flex', marginBottom: 24 }}>
          {['Login', 'Sign Up'].map((label, i) => {
            const active = (i === 0 ? !isSignUp : isSignUp)
            return (
              <button
                key={label}
                onClick={() => { setIsSignUp(i === 1); setError(null) }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem',
                  transition: 'all 0.2s',
                  background: active ? 'rgba(42, 42, 69, 0.85)' : 'transparent',
                  color: active ? 'var(--white)' : 'var(--text-muted)',
                }}
              >{label}</button>
            )
          })}
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 12, marginBottom: 16, fontSize: '0.85rem',
            background: error.includes('Check your email') ? 'rgba(40,200,64,0.15)' : 'rgba(255,80,80,0.15)',
            color: error.includes('Check your email') ? '#28c840' : '#ff5050',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input className="glass-input" type="email" placeholder="Email" required value={email} onChange={e => setEmail(e.target.value)} />
          <input className="glass-input" type="password" placeholder="Password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? '...' : isSignUp ? 'Create Account' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}
