import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { Settings, HelpCircle, X, PenLine, BarChart3, Bell, Sparkles } from 'lucide-react'

function OnboardingOverlay({ onClose }) {
  const steps = [
    { icon: PenLine, title: 'Write freely', detail: 'Tap the input bar at the bottom and write about your day — like texting yourself. Mood, meds, thoughts, anything.' },
    { icon: Sparkles, title: 'AI hint chips', detail: 'Context-aware prompts appear above the input to help you reflect on what matters.' },
    { icon: BarChart3, title: 'Trends & Reports', detail: 'Tap the chart icon to see an AI clinical report with patterns, hypotheses, and recommendations.' },
    { icon: Bell, title: 'Smart Reminders', detail: 'Tap the bell icon for AI-extracted tasks, alerts, and suggestions from your entries.' },
    { icon: Settings, title: 'Settings & Profile', detail: 'Add your AI context (medications, conditions, abbreviations) so analyses understand you better.' },
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'onboardingFadeIn 0.25s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass"
        style={{
          width: '100%', maxWidth: 400, maxHeight: '80dvh',
          borderRadius: 'var(--radius-lg)', padding: '28px 24px',
          overflowY: 'auto',
          animation: 'onboardingSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700,
            color: 'var(--navy)', margin: 0,
          }}>
            How Clarity works
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(232,168,56,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <step.icon size={18} style={{ color: 'var(--amber)' }} />
              </div>
              <div>
                <p style={{
                  margin: '0 0 3px', fontFamily: 'var(--font-display)',
                  fontWeight: 600, fontSize: '0.92rem', color: 'var(--navy)',
                }}>
                  {step.title}
                </p>
                <p style={{
                  margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6,
                }}>
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Close button */}
        <button
          className="btn-primary"
          onClick={onClose}
          style={{ width: '100%', marginTop: 24 }}
        >
          Got it
        </button>
      </div>

      <style>{`
        @keyframes onboardingFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes onboardingSlideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const [showOnboarding, setShowOnboarding] = useState(false)

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
