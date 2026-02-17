export default function EmptyState({ icon, title, description, cta, onAction }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '48px 24px',
      animation: 'fadeIn 0.5s ease both',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(232,168,56,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem', marginBottom: 20,
        border: '1px solid rgba(232,168,56,0.18)',
      }}>
        {icon}
      </div>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: '1.15rem',
        fontWeight: 700, color: 'var(--navy)', margin: '0 0 8px 0',
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          color: 'var(--text-muted)', fontSize: '0.88rem',
          lineHeight: 1.6, margin: '0 0 20px 0', maxWidth: 280,
        }}>
          {description}
        </p>
      )}
      {cta && onAction && (
        <button
          onClick={onAction}
          style={{
            padding: '12px 28px', borderRadius: 100,
            background: 'var(--amber)', color: '#fff', border: 'none',
            fontFamily: 'var(--font-display)', fontWeight: 600,
            fontSize: '0.88rem', cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 2px 12px rgba(232,168,56,0.3)',
          }}
        >
          {cta}
        </button>
      )}
    </div>
  )
}
