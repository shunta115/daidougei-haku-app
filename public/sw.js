/* Production PWA shell. Authenticated API responses are deliberately never cached. */
const CACHE = 'daidougei-platform-v7-master-ui'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/offline.html', '/favicon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/offline.html'))))
    return
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
      return response
    })
    return cached || network
  }))
})
