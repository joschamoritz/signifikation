import { randomUUID, timingSafeEqual } from 'crypto'
import logger from '../logger.js'

const IS_PROD   = process.env.NODE_ENV === 'production'
const ADMIN_KEY = (process.env.ADMIN_KEY || (IS_PROD ? null : 'dev-only'))?.trim()

// Hilfsfunktion: Sensitive Felder aus Log-Objekten entfernen
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const copy = structuredClone(obj)
  const sensitiveFields = ['key', 'token', 'password', 'ADMIN_KEY', 'x-admin-token', 'Authorization']
  const walk = (o) => {
    for (const k of Object.keys(o || {})) {
      if (sensitiveFields.includes(k) || k.toLowerCase().includes('secret')) {
        o[k] = '[REDACTED]'
      } else if (typeof o[k] === 'object') {
        walk(o[k])
      }
    }
  }
  walk(copy)
  return copy
}

// ── Session-Token-Store (in-memory, TTL 8h) ──────────────────
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const sessions = new Map()   // token → expiresAt

export function createSession() {
  const token     = randomUUID()
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
  if (!key || !ADMIN_KEY) {
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen (fehlender Key)')
    return res.status(401).json({ error: 'Falscher Admin-Key' })
  }
  // Constant-Time-Vergleich gegen Timing-Attacks
  // Trimme beide Keys um Whitespace-Probleme zu vermeiden
  const receivedKey = String(key).trim()
  try {
    if (!timingSafeEqual(Buffer.from(receivedKey), Buffer.from(ADMIN_KEY))) {
      logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen (falscher Key)')
      return res.status(401).json({ error: 'Falscher Admin-Key' })
    }
  } catch (err) {
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen (Längen-Mismatch)')
    return res.status(401).json({ error: 'Falscher Admin-Key' })
  }
  const session = createSession()
  logger.info({ ip: req.ip }, 'Admin eingeloggt')
  res.json(session)
}

/** POST /admin/logout – Session beenden */
export function adminLogout(req, res) {
  const token = req.headers['x-admin-token']
  if (token) {
    sessions.delete(token)
    logger.info('Admin ausgeloggt')
  }
  res.json({ ok: true })
}

/** Middleware: CSRF-Schutz – verhindert Form-basierte CSRF-Angriffe */
export function csrfProtect(req, res, next) {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const contentType = req.headers['content-type'] || ''
    // Nur application/json und application/x-www-form-urlencoded mit x-admin-token sind erlaubt
    // Dies blockiert einfache CSRF-Angriffe von fremden Seiten
    if (!contentType.includes('application/json') && !contentType.includes('application/octet-stream')) {
      logger.warn({ method: req.method, contentType }, 'CSRF-Schutz: falscher Content-Type')
      return res.status(403).json({ error: 'Ungültiger Content-Type' })
    }
  }
  next()
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

/** Admin-seitige Fehlerausgabe: zeigt immer den echten Fehler (hinter Auth) */
export function adminError(res, err) {
  // Sanitize err object to avoid logging sensitive data
  const safeErr = err instanceof Error
    ? { message: err.message, stack: err.stack }
    : err
  logger.error({ err: sanitize(safeErr) }, 'Admin-Fehler')
  res.status(500).json({ error: err.message || String(err) })
}

export { ADMIN_KEY, IS_PROD }
