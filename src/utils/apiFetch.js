import { Capacitor } from '@capacitor/core'

const NATIVE_TOKEN_KEY = 'sig_native_bearer'

// Verantwortlichkeit dieser Funktion: NUR Native-Bearer-Token für Capacitor-WKWebView,
// weil Cookies dort cross-origin sind (capacitor://localhost → signifikation.de).
// CSRF-Header wird global von installCsrfFetch in main.jsx gesetzt – nicht hier
// duplizieren.

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
  if (!Capacitor.isNativePlatform()) return fetch(url, options)
  let token
  try {
    token = localStorage.getItem(NATIVE_TOKEN_KEY)
  } catch {}
  if (!token) return fetch(url, options)
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...options, headers })
}
