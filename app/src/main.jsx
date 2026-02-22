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

// ── Service Worker registration with update handling ──────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // When a new SW is waiting to activate, reload to apply it.
      // This prevents clients from being stuck on a stale app shell.
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content available — tell the waiting SW to skip waiting,
            // then reload to pick up the new bundle immediately.
            console.log('[SW] New version available — applying update…')
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // If the SW controller changes (after SKIP_WAITING), reload the page
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    } catch (err) {
      // SW registration failure is non-fatal — app still works, just no offline support
      console.warn('[SW] Registration failed (non-fatal):', err)
    }
  })
}
