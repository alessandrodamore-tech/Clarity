// Clarity Service Worker
// Cache version is injected at build time via Vite plugin (sw-version-inject).
// During dev or if injection fails, falls back to a timestamp so it never gets stuck.
// Format: clarity-YYYYMMDD-HHMMSS or clarity-<build-hash>
const CACHE_NAME = typeof __SW_CACHE_VERSION__ !== 'undefined'
  ? __SW_CACHE_VERSION__
  : `clarity-dev-${Date.now()}`

const STATIC_ASSETS = ['/', '/app']

// ── Install: pre-cache the shell ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err => {
        // On iOS Safari, cache.addAll can fail for /app if the response is
        // opaque or the page hasn't fully loaded. Catch and continue gracefully.
        console.warn('[SW] Pre-cache failed (non-fatal):', err)
      })
    )
  )
  // Force immediate activation — do NOT let old SW linger
  self.skipWaiting()
})

// ── Activate: delete ALL old caches ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k)
            return caches.delete(k)
          })
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: network-first with stale fallback ──────────────────────────────────
// Strategy: always try the network. Only fall back to cache for the app shell.
// This prevents serving stale JS/CSS after a deploy.
self.addEventListener('fetch', event => {
  const { request } = event

  // Only handle GET requests
  if (request.method !== 'GET') return

  // Pass through API requests (Supabase, Vapi, Notion, etc.)
  const url = new URL(request.url)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('vapi') ||
    url.hostname.includes('daily') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('openai')
  ) return

  // For navigation requests (HTML), network-first with cache fallback for offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache a fresh copy of the app shell
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match('/app') || caches.match('/'))
    )
    return
  }

  // For everything else: network-first, no caching of JS/CSS bundles
  // (Vite adds content hashes to assets, so stale cache isn't an issue for them,
  //  but we still prefer fresh responses)
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  )
})

// ── Message: allow clients to force SW update ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
