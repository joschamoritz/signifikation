// API-Basis-URL: leer = relative Pfade (Web), gesetzt = native App (Capacitor)
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

// Versionierter API-Prefix
export const API = API_BASE + '/api/v1'

// Mobiler Breakpoint — MUSS mit den 699px-Media-Queries in
// src/styles/*.css uebereinstimmen (CSS kann die Konstante nicht teilen).
export const MOBILE_BREAKPOINT_PX = 699
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`
