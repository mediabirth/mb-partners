/**
 * MB Partners Service Worker
 *
 * Strategy:
 *  - Static hashed assets (/_next/static/) → cache-first (immutable, content-hashed)
 *  - Everything else (HTML, API) → network-only (server sets no-store via vercel.json)
 *
 * Auto-update: skipWaiting causes immediate activation on new deploy.
 * Client listens for controllerchange and reloads, ensuring users always
 * get the latest version without manual cache clearing.
 */

const CACHE_NAME = 'mbp-static-v1'

// Only cache /_next/static/ assets — they are content-hashed and immutable
const isStaticAsset = (url) => url.pathname.startsWith('/_next/static/')

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Skip waiting: take control immediately when a new SW is available
  // (triggers 'controllerchange' → client reloads)
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  // Take control of all open clients immediately
  self.clients.claim()
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  if (isStaticAsset(url)) {
    // Cache-first for hashed static assets
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached
          return fetch(event.request).then((res) => {
            if (res.ok) cache.put(event.request, res.clone())
            return res
          })
        })
      )
    )
    return
  }

  // Network-only for HTML pages and API routes
  // HTML already has Cache-Control: no-store via vercel.json
  // Fallthrough to browser's default fetch handling
})
