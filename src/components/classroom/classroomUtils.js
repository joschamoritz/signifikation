export const HEARTBEAT_INTERVAL_MS = 15_000
export const HOST_TIMEOUT_MS = 120_000

export const GAME_ROUND_NO = { kollokationen: 1, wortzwilling: 2, zeitenwende: 3 }
export const ROUND_GAME_NAME = Object.fromEntries(Object.entries(GAME_ROUND_NO).map(([k, v]) => [v, k]))
export const GAME_LABELS = {
  kollokationen: 'Kollokationen',
  wortzwilling: 'Wort-Zwilling',
  zeitenwende: 'Zeitenwende',
}

export function formatDateTime(ts) {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ts))
  } catch {
    return String(ts)
  }
}

export function mapSessionState(state) {
  switch (state) {
    case 'running':
      return 'Laufend'
    case 'lobby':
      return 'Wartend'
    case 'finished':
      return 'Beendet'
    case 'archived':
      return 'Archiviert'
    case 'created':
      return 'Vorbereitet'
    default:
      return state || 'Unbekannt'
  }
}

export function readJsonSafe(response) {
  return response.json().catch(() => null)
}

export function getErrorMessage(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  return fallback
}

export function formatElapsed(startedAt) {
  if (!startedAt) return '—'
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatStagnation(lastAt) {
  if (!lastAt) return null
  const mins = Math.floor((Date.now() - lastAt) / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins === 1) return 'vor 1 Minute'
  if (mins < 60) return `vor ${mins} Minuten`
  return 'vor über einer Stunde'
}

export function parseStorageKey(sessionId) {
  return `sig_classroom_join_${sessionId}`
}

export function sanitizeJoinCodeInput(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
}

export function humanizeJoinError(message) {
  const text = String(message || '')
  if (text.includes('ungueltig') || text.includes('abgelaufen') || text.includes('ungültig')) {
    return 'Zugangscode ungültig oder abgelaufen. Bitte die Lehrkraft nach dem aktuellen Code fragen.'
  }
  if (text.includes('Zu viele Versuche')) {
    return 'Zu viele Versuche. Bitte 5 Minuten warten und dann erneut eingeben.'
  }
  return text || 'Beitritt fehlgeschlagen.'
}
