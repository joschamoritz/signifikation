import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies'
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

// API: Heute-Daten – NetworkFirst, weil bei Mitternachtsübergang sonst der
// Vortag aus dem Cache zurückkäme, bevor die Revalidate-Antwort eintrifft.
// Bei Offline / langsamem Netz: nach 3s aus dem Cache antworten.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/heute'),
  new NetworkFirst({
    cacheName: 'api-heute',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// API: Wortzwilling – ebenfalls tagesgebunden
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/wortzwilling'),
  new NetworkFirst({
    cacheName: 'api-wortzwilling',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

// API: Zeitenwende – ebenfalls tagesgebunden
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/zeitenwende'),
  new NetworkFirst({
    cacheName: 'api-zeitenwende',
    networkTimeoutSeconds: 3,
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
  const targetUrl = event.notification.data?.url ?? '/'
  event.waitUntil((async () => {
    // Wenn bereits ein Fenster der App offen ist: fokussieren und navigieren.
    // Sonst neues Fenster öffnen.
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url)
        const targetParsed = new URL(targetUrl, self.location.origin)
        if (clientUrl.origin === targetParsed.origin) {
          if (client.url !== targetParsed.href && 'navigate' in client) {
            await client.navigate(targetParsed.href).catch(() => {})
          }
          return client.focus()
        }
      } catch {
        // Ungültige URL → ignorieren, nächsten Client probieren
      }
    }
    return self.clients.openWindow(targetUrl)
  })())
})
