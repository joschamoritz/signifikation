import logger from '../logger.js'

const IS_PROD   = process.env.NODE_ENV === 'production'
const ADMIN_KEY = (process.env.ADMIN_KEY || (IS_PROD ? null : 'dev-only'))?.trim()

// ── Session-Token-Store (in-memory, TTL 8h) ──────────────────
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const sessions = new Map()   // token → expiresAt

export function createSession() {
  const token     = crypto.randomUUID()
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, expiresAt)
  return { token, expiresAt }
}

function sessionValid(token) {
  const exp = sessions.get(token)
  if (!exp) return false
  if (Date.now() > exp) { sessions.delete(token); return false }
  return true
}

/** POST /admin/auth – tauscht Admin-Key gegen Session-Token */
export function adminAuth(req, res) {
  const { key } = req.body || {}
  if (!key || key !== ADMIN_KEY) {
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen')
    return res.status(401).json({ error: 'Falscher Admin-Key' })
  }
  const session = createSession()
  logger.info({ ip: req.ip }, 'Admin eingeloggt')
  res.json(session)
}

/** Middleware: prüft x-admin-token Header */
export function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token']
  if (token && sessionValid(token)) return next()
  res.status(401).json({ error: 'Nicht autorisiert' })
}

/** Fehlerausgabe: in Produktion keine internen Details preisgeben */
export function serverError(res, err) {
  logger.error({ err }, 'Server-Fehler')
  res.status(500).json({ error: IS_PROD ? 'Interner Serverfehler' : err.message })
}

export { ADMIN_KEY, IS_PROD }
