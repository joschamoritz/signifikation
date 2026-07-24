// Globaler fetch-Wrapper: setzt den CSRF-Header automatisch bei allen
// State-Changing-Requests an unser Backend. Vermeidet Refactor aller
// Direkt-fetch()-Aufrufer und ist trotzdem ein robuster Schutz, weil
// Cross-Origin-Scripts diesen Header ohne CORS-Preflight nicht setzen können.
//
// Wichtig für Native (Capacitor): window.location.origin ist dort
// 'capacitor://localhost'/'http://localhost', während API-Requests an
// 'https://signifikation.de' gehen. Ohne explizite Backend-Allowlist
// würde der Wrapper diese Requests als cross-origin behandeln und den
// Header weglassen → Server lehnt mit 403 ab.
//
// Pendant im Backend: server/middleware/auth.js (CSRF_HEADER_VALUE)

import { BACKEND_ORIGINS } from './backendOrigins.js'

const CSRF_HEADER_VALUE = 'signifikation-app'
const STATE_CHANGING = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

function shouldAttachCsrfHeader(url) {
  try {
    if (typeof url === 'string') {
      // Relative URLs (z. B. "/api/v1/...") sind immer same-origin → Backend.
      if (url.startsWith('/') && !url.startsWith('//')) return true
      const parsed = new URL(url, window.location.href)
      if (parsed.origin === window.location.origin) return true
      return BACKEND_ORIGINS.has(parsed.origin)
    }
    if (url instanceof URL) {
      if (url.origin === window.location.origin) return true
      return BACKEND_ORIGINS.has(url.origin)
    }
    if (url instanceof Request) {
      const parsed = new URL(url.url, window.location.href)
      if (parsed.origin === window.location.origin) return true
      return BACKEND_ORIGINS.has(parsed.origin)
    }
  } catch {
    // Unparsebare URLs → vorsichtshalber Header setzen, damit interne
    // Calls nicht stillschweigend ihren CSRF-Header verlieren.
    return true
  }
  return false
}

function methodOf(input, init) {
  if (init && init.method) return String(init.method).toUpperCase()
  if (input instanceof Request) return String(input.method || 'GET').toUpperCase()
  return 'GET'
}

export function installCsrfFetch() {
  if (typeof window === 'undefined' || !window.fetch) return
  if (window.fetch.__sigCsrfWrapped) return

  const originalFetch = window.fetch.bind(window)

  const wrapped = function patchedFetch(input, init) {
    const method = methodOf(input, init)
    if (!STATE_CHANGING.has(method)) return originalFetch(input, init)
    if (!shouldAttachCsrfHeader(input)) return originalFetch(input, init)

    // Init-Pfad: Header dort setzen.
    if (init || !(input instanceof Request)) {
      const next = { ...(init || {}) }
      const headers = new Headers(next.headers)
      if (!headers.has('X-Requested-With')) {
        headers.set('X-Requested-With', CSRF_HEADER_VALUE)
      }
      next.headers = headers
      return originalFetch(input, next)
    }

    // Request-Objekt: neuen Request mit gepatchten Headers bauen.
    const headers = new Headers(input.headers)
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', CSRF_HEADER_VALUE)
    }
    const cloned = new Request(input, { headers })
    return originalFetch(cloned)
  }
  wrapped.__sigCsrfWrapped = true
  window.fetch = wrapped
}
