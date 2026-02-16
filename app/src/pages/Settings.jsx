import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Upload, Info, LogOut } from 'lucide-react'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const navigate = useNavigate()
  const { user, setUser } = useApp()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Profile */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <User size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Profile</h2>
        </div>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Display Name</label>
        <input className="glass-input" placeholder="Your name" style={{ marginBottom: 16 }} />
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Timezone</label>
        <select className="glass-input" defaultValue="Europe/Rome" style={{ cursor: 'pointer' }}>
          <option>Europe/Rome</option>
          <option>Europe/London</option>
          <option>America/New_York</option>
          <option>America/Los_Angeles</option>
          <option>Asia/Tokyo</option>
        </select>
      </div>

      {/* Import */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Upload size={18} style={{ color: 'var(--navy)' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', margin: 0 }}>Import Journal</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
          Import entries from text files, CSV, Notion exports, or paste them directly.
        </p>
        <button onClick={() => navigate('/app/import')} className="btn-primary" style={{ width: '100%' }}>
          Import Entries
        </button>
      </div>

      {/* About */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 24, textAlign: 'center' }}>
        <Info size={18} style={{ color: 'var(--text-light)', marginBottom: 8 }} />
        <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>Clarity v0.1 — Your mind, decoded.</p>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px 24px', borderRadius: 100, width: '100%',
          background: 'rgba(220,60,60,0.1)', color: '#dc3c3c',
          border: '1px solid rgba(220,60,60,0.2)',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.92rem',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <LogOut size={16} /> Sign Out
      </button>
    </div>
  )
}
