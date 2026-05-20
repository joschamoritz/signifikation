import { Capacitor } from '@capacitor/core'

const NATIVE_TOKEN_KEY = 'sig_native_bearer'

// Marker-Header, den der Server bei State-Changing-Requests verlangt (CSRF-Schutz).
// Wert muss mit CSRF_HEADER_VALUE in server/middleware/auth.js übereinstimmen.
const CSRF_HEADER_VALUE = 'signifikation-app'

function isStateChanging(method) {
  if (!method) return false
  const m = method.toUpperCase()
  return m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH'
}

function withCsrfHeader(options) {
  if (!isStateChanging(options.method)) return options
  const headers = new Headers(options.headers)
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', CSRF_HEADER_VALUE)
  }
  return { ...options, headers }
}

export function setNativeBearerToken(token) {
  if (!Capacitor.isNativePlatform()) return
  try {
    if (token) {
      localStorage.setItem(NATIVE_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(NATIVE_TOKEN_KEY)
    }
  } catch {}
}

export function apiFetch(url, options = {}) {
  const opts = withCsrfHeader(options)
  if (!Capacitor.isNativePlatform()) return fetch(url, opts)
  let token
  try {
    token = localStorage.getItem(NATIVE_TOKEN_KEY)
  } catch {}
  if (!token) return fetch(url, opts)
  const headers = new Headers(opts.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...opts, headers })
}
