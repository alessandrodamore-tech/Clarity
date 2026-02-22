import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './lib/store.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import App from './App.jsx'
import './index.css'

// Inject preconnect for Supabase project URL at runtime (resolved from env at build time)
;(function injectPreconnects() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
    try {
      const origin = new URL(supabaseUrl).origin
      ;['preconnect', 'dns-prefetch'].forEach(rel => {
        if (!document.querySelector(`link[rel="${rel}"][href="${origin}"]`)) {
          const link = document.createElement('link')
          link.rel = rel
          if (rel === 'preconnect') link.crossOrigin = 'anonymous'
          link.href = origin
          document.head.appendChild(link)
        }
      })
    } catch {}
  }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
)

// ── Service Worker: unregister all (prevents stale cache on iOS Safari) ───────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister())
  })
}
