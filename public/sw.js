/* Production PWA shell. Authenticated API responses are deliberately never cached. */
const CACHE = 'daidougei-platform-v11-appearance-push'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/offline.html', '/favicon-32.png', '/favicon-48.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png']

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

  event.respondWith(fetch(request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
      return response
    }).catch(() => caches.match(request)))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { payload = {} }
  const title = typeof payload.title === 'string' ? payload.title : 'HAKU'
  const body = typeof payload.body === 'string' ? payload.body : ''
  const tag = typeof payload.tag === 'string' ? payload.tag : 'haku-notification'
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//') ? payload.url : '/'
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: '/icon-192.png',
    badge: '/favicon-48.png',
    data: { url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawPath = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/'
  const path = rawPath.startsWith('/') && !rawPath.startsWith('//') ? rawPath : '/'
  const candidate = new URL(path, self.location.origin)
  const target = candidate.origin === self.location.origin ? candidate.href : self.location.origin + '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) return existing.navigate(target).then(() => existing.focus())
    return self.clients.openWindow(target)
  }))
})
