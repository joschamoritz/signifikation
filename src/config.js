// API-Basis-URL: leer = relative Pfade (Web), gesetzt = native App (Capacitor)
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

// Versionierter API-Prefix
export const API = API_BASE + '/api/v1'

// Origin der Web-App – Ziel für Links, die per E-Mail rausgehen (Passwort-Reset,
// E-Mail-Bestätigung). In der nativen App ist window.location.origin
// `capacitor://localhost`; ein Mail-Link wird aber im Systembrowser geöffnet und
// kann dorthin nicht zurückspringen. Deshalb dort die Backend-Origin nehmen.
function resolveWebOrigin() {
  if (API_BASE) {
    try {
      return new URL(API_BASE, 'https://signifikation.de').origin
    } catch { /* ungültige VITE_API_BASE → Fallback unten */ }
  }
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return window.location.origin
  }
  return 'https://signifikation.de'
}

export const WEB_ORIGIN = resolveWebOrigin()

// Mobiler Breakpoint — MUSS mit den 699px-Media-Queries in
// src/styles/*.css uebereinstimmen (CSS kann die Konstante nicht teilen).
const MOBILE_BREAKPOINT_PX = 699
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`
