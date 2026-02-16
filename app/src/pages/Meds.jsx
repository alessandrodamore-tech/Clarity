import { Pill, Plus } from 'lucide-react'

const meds = [
  { name: 'Elvanse', dose: '30mg', frequency: 'Daily', time: 'Morning' },
  { name: 'Aripiprazole', dose: '2mg', frequency: 'Daily', time: 'Evening' },
]

export default function Meds() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700,
        color: 'var(--navy)',
      }}>Your Medications</h2>

      {meds.map(m => (
        <div key={m.name} className="glass" style={{
          borderRadius: 'var(--radius)', padding: 20,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem',
              color: 'var(--text)', margin: 0,
            }}>
              {m.name} <span style={{ color: 'var(--amber)' }}>{m.dose}</span>
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0', lineHeight: 1.5 }}>
              {m.frequency} · {m.time}
            </p>
          </div>
          <Pill size={22} style={{ color: 'var(--text-light)' }} />
        </div>
      ))}

      <button
        style={{
          padding: 20, borderRadius: 'var(--radius)',
          border: '1.5px dashed var(--amber)', background: 'transparent',
          color: 'var(--amber)', fontFamily: 'var(--font-display)', fontWeight: 600,
          fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.3s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,168,56,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Plus size={18} /> Add Medication
      </button>
    </div>
  )
}
