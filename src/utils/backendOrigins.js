// Einzige Quelle der Wahrheit fuer die Origins unseres eigenen Backends.
// Genutzt von installCsrfFetch.js (CSRF-Header) UND apiFetch.js (Bearer-Token
// fuer Native) - beide muessen wissen, welche Ziel-Origin "unser Server" ist,
// bevor sie einen sicherheitsrelevanten Header anhaengen.
export const BACKEND_ORIGINS = new Set([
  'https://signifikation.de',
  'http://localhost:3001',
  'http://localhost:5173',
])

// VITE_API_BASE kann zur Build-Zeit eine weitere Backend-Origin liefern
// (z. B. Staging). Diese ergaenzen wir dynamisch zur Allowlist.
try {
  const apiBase = import.meta.env?.VITE_API_BASE
  if (apiBase) {
    const parsed = new URL(apiBase, 'https://example.invalid')
    if (parsed.origin && parsed.origin !== 'https://example.invalid') {
      BACKEND_ORIGINS.add(parsed.origin)
    }
  }
} catch { /* import.meta nicht verfuegbar (Tests u.ae.) - egal */ }
