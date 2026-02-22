import { useEffect, useRef, useState, useCallback } from 'react';
import { useToastState } from '../lib/useToast';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  success: { color: '#3a8a6a', icon: '✓', label: 'Success' },
  error:   { color: '#dc3c3c', icon: '✗', label: 'Error'   },
  warning: { color: '#E8A838', icon: '⚠', label: 'Warning' },
  info:    { color: '#6a5aaa', icon: 'ℹ', label: 'Info'    },
};

// ─── Keyframes injected once ───────────────────────────────────────────────────
const STYLE_ID = '__clarity-toast-styles__';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes __toast-in {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1);    }
    }
    @keyframes __toast-out {
      from { opacity: 1; transform: translateY(0)    scale(1);    max-height: 120px; margin-bottom: 8px; }
      to   { opacity: 0; transform: translateY(16px) scale(0.97); max-height: 0;     margin-bottom: 0;  }
    }
    @keyframes __toast-progress {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Single toast item ─────────────────────────────────────────────────────────
function ToastItem({ toast, onDismiss }) {
  const { id, type, message, duration } = toast;
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  const [exiting, setExiting] = useState(false);
  const exitTimer  = useRef(null);
  const autoTimer  = useRef(null);

  const handleDismiss = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    exitTimer.current = setTimeout(() => onDismiss(id), 300);
  }, [exiting, id, onDismiss]);

  useEffect(() => {
    autoTimer.current = setTimeout(handleDismiss, duration);
    return () => {
      clearTimeout(autoTimer.current);
      clearTimeout(exitTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const animation = exiting
    ? '__toast-out 0.3s cubic-bezier(0.4,0,1,1) forwards'
    : '__toast-in  0.32s cubic-bezier(0.22,1,0.36,1) forwards';

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      onClick={handleDismiss}
      style={{
        position:        'relative',
        minWidth:        '280px',
        maxWidth:        '340px',
        width:           '100%',
        background:      'rgba(255,255,255,0.95)',
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border:          '1px solid rgba(255,255,255,0.3)',
        borderRadius:    '14px',
        boxShadow:       '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        padding:         '12px 16px',
        display:         'flex',
        alignItems:      'center',
        gap:             '10px',
        cursor:          'pointer',
        overflow:        'hidden',
        marginBottom:    '8px',
        animation,
        userSelect:      'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Accent bar */}
      <span
        aria-hidden="true"
        style={{
          position:     'absolute',
          left:         0,
          top:          0,
          bottom:       0,
          width:        '3px',
          background:   cfg.color,
          borderRadius: '14px 0 0 14px',
        }}
      />

      {/* Icon */}
      <span
        aria-hidden="true"
        style={{
          flexShrink:     0,
          width:          '22px',
          height:         '22px',
          borderRadius:   '50%',
          background:     cfg.color + '1a', // 10% opacity
          color:          cfg.color,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       '13px',
          fontWeight:     700,
          fontFamily:     'var(--font-display, system-ui)',
          lineHeight:     1,
          marginLeft:     '6px',
        }}
      >
        {cfg.icon}
      </span>

      {/* Message */}
      <span
        style={{
          flex:       1,
          fontSize:   '14px',
          lineHeight: '1.4',
          color:      'var(--text, #1a1a2e)',
          fontFamily: 'var(--font-display, system-ui)',
          fontWeight: 500,
        }}
      >
        {message}
      </span>

      {/* Progress bar */}
      <span
        aria-hidden="true"
        style={{
          position:        'absolute',
          bottom:          0,
          left:            0,
          right:           0,
          height:          '2px',
          background:      cfg.color + '40', // faint track
          borderRadius:    '0 0 14px 14px',
          overflow:        'hidden',
        }}
      >
        <span
          style={{
            display:         'block',
            height:          '100%',
            background:      cfg.color,
            transformOrigin: 'left center',
            animation:       exiting
              ? 'none'
              : `__toast-progress ${duration}ms linear forwards`,
          }}
        />
      </span>
    </div>
  );
}

// ─── Toast stack container ─────────────────────────────────────────────────────
export default function Toast() {
  const { toasts, dismiss } = useToastState();

  useEffect(() => { injectStyles(); }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      style={{
        position:        'fixed',
        bottom:          'max(24px, env(safe-area-inset-bottom, 24px))',
        left:            '50%',
        transform:       'translateX(-50%)',
        zIndex:          9999,
        display:         'flex',
        flexDirection:   'column-reverse', // newest on top visually
        alignItems:      'center',
        pointerEvents:   'none',
        width:           'min(90vw, 360px)',
      }}
    >
      {[...toasts].reverse().map(toast => (
        <div
          key={toast.id}
          style={{ pointerEvents: 'auto', width: '100%' }}
        >
          <ToastItem toast={toast} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
