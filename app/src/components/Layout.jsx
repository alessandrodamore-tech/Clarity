import { Outlet, NavLink } from 'react-router-dom'
import { User, Settings } from 'lucide-react'

export default function Layout() {
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
        height: 56,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 12, paddingRight: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '0 0 20px 20px',
      }}>
        {/* Left: Profile */}
        {iconLink('/app/profile', User, 'Profile')}

        {/* Center: Logo */}
        <NavLink to="/app/home" style={{ textDecoration: 'none' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '1.45rem', color: '#fff',
            textShadow: '0 0 12px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.3)',
            letterSpacing: '-0.03em', margin: 0,
          }}>Clarity.</h1>
        </NavLink>

        {/* Right: Settings */}
        {iconLink('/app/settings', Settings, 'Settings')}
      </header>

      {/* Content */}
      <main style={{
        flex: 1, position: 'relative', zIndex: 1,
        padding: '68px 16px 24px',
        maxWidth: 960, width: '100%', margin: '0 auto',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
