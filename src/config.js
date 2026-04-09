// API-Basis-URL: leer = relative Pfade (Web), gesetzt = native App (Capacitor)
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

// Versionierter API-Prefix
export const API = API_BASE + '/api/v1'
