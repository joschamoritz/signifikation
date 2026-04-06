import { randomUUID, timingSafeEqual, createHmac } from 'crypto'
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

// ── Signierte Session-Tokens (HMAC, kein Server-State) ───────
// Format: <uuid>.<expiresAt>.<hmac>
// Überlebt Server-Neustarts und Deploys ohne Datei-I/O.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

function sign(payload) {
  if (!ADMIN_KEY) throw new Error('ADMIN_KEY nicht konfiguriert')
  return createHmac('sha256', ADMIN_KEY).update(payload).digest('hex')
}

export function createSession() {
  const uuid      = randomUUID()
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload   = `${uuid}.${expiresAt}`
  const token     = `${payload}.${sign(payload)}`
  return { token, expiresAt }
}

function sessionValid(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  // Format: <uuid>.<expiresAt>.<hmac> → 3 Teile (UUID enthält nur Bindestriche)
  if (parts.length !== 3) return false
  const [uuid, expiresAtStr, hmac] = parts
  const payload = `${uuid}.${expiresAtStr}`
  // Konstanter Zeitvergleich gegen Timing-Attacks
  try {
    const expected = sign(payload)
    if (!timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return false
  } catch {
    return false
  }
  const expiresAt = parseInt(expiresAtStr, 10)
  return Number.isFinite(expiresAt) && Date.now() < expiresAt
}

/** POST /admin/auth – tauscht Admin-Key gegen httpOnly-Session-Cookie */
export function adminAuth(req, res) {
  const { key } = req.body || {}
  if (!key || !ADMIN_KEY) {
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen (fehlender Key)')
    return res.status(401).json({ error: 'Falscher Admin-Key' })
  }
  // Constant-Time-Vergleich gegen Timing-Attacks
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
  const { token, expiresAt } = createSession()
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
  })
  logger.info({ ip: req.ip }, 'Admin eingeloggt')
  // Token nur im httpOnly-Cookie — nicht im Response-Body (verhindert sessionStorage-XSS)
  res.json({ ok: true, expiresAt })
}

/** POST /admin/logout – Cookie löschen (kein Server-State nötig) */
export function adminLogout(req, res) {
  logger.info('Admin ausgeloggt')
  res.clearCookie('admin_token', { httpOnly: true, secure: IS_PROD, sameSite: 'strict' })
  res.json({ ok: true })
}

/** Middleware: CSRF-Schutz – verhindert Form-basierte CSRF-Angriffe */
export function csrfProtect(req, res, next) {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
      logger.warn({ method: req.method, contentType }, 'CSRF-Schutz: falscher Content-Type')
      return res.status(403).json({ error: 'Ungültiger Content-Type' })
    }
  }
  next()
}

/** Middleware: CSRF-Schutz für Binary-Uploads (erlaubt zusätzlich application/octet-stream) */
export function csrfProtectUpload(req, res, next) {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json') && !contentType.includes('application/octet-stream')) {
      logger.warn({ method: req.method, contentType }, 'CSRF-Schutz: falscher Content-Type')
      return res.status(403).json({ error: 'Ungültiger Content-Type' })
    }
  }
  next()
}

/** Middleware: prüft httpOnly-Cookie (primär) oder X-Admin-Token-Header (Legacy-Fallback) */
export function requireAuth(req, res, next) {
  const token = req.cookies?.admin_token || req.headers['x-admin-token']
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
