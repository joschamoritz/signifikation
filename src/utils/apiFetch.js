import { Capacitor } from '@capacitor/core'

const NATIVE_TOKEN_KEY = 'sig_native_bearer'

// Verantwortlichkeit dieser Funktion: NUR Native-Bearer-Token für Capacitor-WKWebView,
// weil Cookies dort cross-origin sind (capacitor://localhost → signifikation.de).
// CSRF-Header wird global von installCsrfFetch in main.jsx gesetzt – nicht hier
// duplizieren.
//
// Persistenz auf Native: iOS Keychain / Android Keystore via
// @aparajita/capacitor-secure-storage. Bearer-Token = Vollzugang zur Session,
// localStorage wäre auf gejailbreakten Geräten oder per Forensik auslesbar.
// Web-Fallback bleibt localStorage – dort läuft Auth ohnehin cookie-basiert,
// der Bearer-Token-Pfad ist nur für die native App relevant.

let cachedToken = null
let initPromise = null

async function getSecureStorage() {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const mod = await import('@aparajita/capacitor-secure-storage')
    return mod.SecureStorage ?? null
  } catch {
    return null
  }
}

// Beim App-Start einmal aufrufen. Lädt das Token aus dem Keychain in den
// In-Memory-Cache, damit apiFetch synchron bleiben kann. Migriert ein altes
// localStorage-Token einmalig in den Keychain.
export function initNativeBearerToken() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  if (initPromise) return initPromise
  initPromise = (async () => {
    const storage = await getSecureStorage()
    if (storage) {
      try {
        const fromKeychain = await storage.get(NATIVE_TOKEN_KEY)
        if (typeof fromKeychain === 'string' && fromKeychain) {
          cachedToken = fromKeychain
          try { localStorage.removeItem(NATIVE_TOKEN_KEY) } catch {}
          return
        }
        let legacy = null
        try { legacy = localStorage.getItem(NATIVE_TOKEN_KEY) } catch {}
        if (legacy) {
          await storage.set(NATIVE_TOKEN_KEY, legacy)
          cachedToken = legacy
          try { localStorage.removeItem(NATIVE_TOKEN_KEY) } catch {}
        }
      } catch {}
      return
    }
    try { cachedToken = localStorage.getItem(NATIVE_TOKEN_KEY) } catch {}
  })()
  return initPromise
}

export function setNativeBearerToken(token) {
  if (!Capacitor.isNativePlatform()) return
  cachedToken = token || null
  void (async () => {
    const storage = await getSecureStorage()
    if (storage) {
      try {
        if (token) await storage.set(NATIVE_TOKEN_KEY, token)
        else await storage.remove(NATIVE_TOKEN_KEY)
      } catch {}
      return
    }
    try {
      if (token) localStorage.setItem(NATIVE_TOKEN_KEY, token)
      else localStorage.removeItem(NATIVE_TOKEN_KEY)
    } catch {}
  })()
}

export function apiFetch(url, options = {}) {
  if (!Capacitor.isNativePlatform()) return fetch(url, options)
  if (!cachedToken) return fetch(url, options)
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${cachedToken}`)
  return fetch(url, { ...options, headers })
}
