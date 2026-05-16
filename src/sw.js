import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

precacheAndRoute(self.__WB_MANIFEST)

// ── Runtime Caching ───────────────────────────────────────────────────────────

// JS-Assets mit Content-Hash
registerRoute(
  ({ url }) => url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'),
  new StaleWhileRevalidate({
    cacheName: 'app-scripts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  })
)

// Schriften (CacheFirst, lang)
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'app-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// API: Heute-Daten
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/heute'),
  new StaleWhileRevalidate({
    cacheName: 'api-heute',
    plugins: [
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// API: Wortzwilling
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/wortzwilling'),
  new StaleWhileRevalidate({
    cacheName: 'api-wortzwilling',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// API: Zeitenwende
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/zeitenwende'),
  new StaleWhileRevalidate({
    cacheName: 'api-zeitenwende',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// Statische Bilder (PNG, SVG)
registerRoute(
  ({ url }) => /\.(?:png|svg)$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'static-images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
)

// ── Push-Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'Signifikation'
  const options = {
    body: data.body ?? 'Dein tägliches Wortspiel wartet.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url ?? '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? '/'))
})
