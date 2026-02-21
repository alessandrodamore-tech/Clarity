import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Settings, HelpCircle, X, PenLine, BarChart3, Bell, Sparkles } from 'lucide-react'

function OnboardingOverlay({ onClose }) {
  const steps = [
    {
      icon: PenLine,
      title: 'Write freely',
      detail: 'Tap the input bar and write about your day — like texting yourself. Mood, meds, thoughts, anything goes.',
      color: '#6a5aaa',
      bg: 'rgba(106,90,170,0.12)',
    },
    {
      icon: Sparkles,
      title: 'AI hint chips',
      detail: 'Context-aware prompts appear above the input based on your recent entries to help you reflect on what matters.',
      color: 'var(--amber)',
      bg: 'rgba(232,168,56,0.12)',
    },
    {
      icon: BarChart3,
      title: 'Trends & Reports',
      detail: 'Tap the chart icon to generate an AI clinical report with patterns, hypotheses, and recommendations across your weeks.',
      color: '#3a8a6a',
      bg: 'rgba(58,138,106,0.12)',
    },
    {
      icon: Bell,
      title: 'Smart Alerts',
      detail: 'Tap the bell icon — AI detects health patterns, medication effects, mood trends, and wellness signals from your entries.',
      color: '#dc3c3c',
      bg: 'rgba(220,60,60,0.10)',
    },
    {
      icon: Settings,
      title: 'AI Context',
      detail: 'In settings, write your personal context — medications, conditions, abbreviations — so every analysis understands you better.',
      color: 'var(--teal-light)',
      bg: 'rgba(74,122,138,0.12)',
    },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(200, 185, 230, 0.18)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
        animation: 'obFadeIn 0.2s ease both',
      }}
    >
      {/* Sheet */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          maxHeight: '90dvh',
          background: 'rgba(255, 255, 255, 0.28)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          borderBottom: 'none',
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -8px 48px rgba(100, 80, 160, 0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
          overflowY: 'auto',
          animation: 'obSlideUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
          position: 'relative',
        }}
      >
        {/* Glass top highlight */}
        <div style={{
          position: 'absolute', top: 0, left: '-10%', right: '-10%', height: '45%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 40%, transparent 100%)',
          borderRadius: '28px 28px 50% 50%',
          pointerEvents: 'none',
        }} />

        <div style={{ padding: '28px 24px 36px', position: 'relative', zIndex: 1 }}>
          {/* Handle */}
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: 'rgba(100, 80, 160, 0.2)',
            margin: '0 auto 24px',
          }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <p style={{
                fontFamily: 'var(--font-display)', fontSize: '0.7rem', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--amber)', margin: '0 0 6px',
              }}>How it works</p>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800,
                color: 'var(--navy)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1,
              }}>
                Clarity.
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'rgba(255,255,255,0.4)',
                border: '1px solid rgba(255,255,255,0.6)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.25)',
                border: '1px solid rgba(255,255,255,0.45)',
                borderRadius: 16,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                animation: `obFadeIn 0.4s ease ${80 + i * 60}ms both`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: step.bg,
                  border: `1px solid ${step.color}22`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <step.icon size={18} style={{ color: step.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{
                    margin: '0 0 3px', fontFamily: 'var(--font-display)',
                    fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)',
                  }}>
                    {step.title}
                  </p>
                  <p style={{
                    margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6,
                  }}>
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onClose}
            style={{
              width: '100%', marginTop: 20,
              padding: '15px 24px',
              background: 'rgba(42, 42, 69, 0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 100,
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem',
              cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >
            Got it →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes obFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes obSlideUp {
          from { opacity: 0; transform: translateY(60px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Scroll to top on every route change (Home manages its own scroll-to-bottom)
  useEffect(() => {
    if (location.pathname === '/app' || location.pathname === '/app/home') return
    window.scrollTo(0, 0)
  }, [location.pathname])

  const iconLink = (to, Icon, label) => (
    <NavLink
      to={to}
      title={label}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: 12,
        background: isActive ? 'rgba(255,255,255,0.22)' : 'transparent',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.8)',
        transition: 'all 0.2s', textDecoration: 'none',
      })}
    >
      <Icon size={19} />
    </NavLink>
  )

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="bg-mesh" />

      {/* Top bar */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 'calc(56px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 12, paddingRight: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '0 0 20px 20px',
      }}>
        {/* Left: Settings */}
        {iconLink('/app/settings', Settings, 'Settings')}

        {/* Center: Logo */}
        <NavLink to="/app/home" style={{ textDecoration: 'none' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '1.45rem', color: '#fff',
            textShadow: '0 0 12px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.3)',
            letterSpacing: '-0.03em', margin: 0,
          }}>Clarity.</h1>
        </NavLink>

        {/* Right: Help / Onboarding */}
        <button
          title="How it works"
          onClick={() => setShowOnboarding(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 44, minHeight: 44, width: 44, height: 44, borderRadius: 12,
            background: 'transparent',
            color: 'rgba(255,255,255,0.8)',
            transition: 'all 0.2s',
            border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <HelpCircle size={19} />
        </button>
      </header>

      {/* Content */}
      <main style={{
        flex: 1, position: 'relative', zIndex: 1,
        padding: 'calc(68px + env(safe-area-inset-top, 0px)) 16px 24px',
        maxWidth: 960, width: '100%', margin: '0 auto',
      }}>
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>

      {/* Onboarding overlay */}
      {showOnboarding && <OnboardingOverlay onClose={() => setShowOnboarding(false)} />}
    </div>
  )
}
