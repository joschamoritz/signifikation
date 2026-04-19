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
  const receivedBuf = Buffer.from(receivedKey)
  const adminBuf = Buffer.from(ADMIN_KEY)
  if (receivedBuf.length !== adminBuf.length) {
    const paddedReceived = Buffer.alloc(adminBuf.length)
    receivedBuf.copy(paddedReceived)
    try { timingSafeEqual(paddedReceived, adminBuf) } catch {}
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen')
    return res.status(401).json({ error: 'Falscher Admin-Key' })
  }
  try {
    if (!timingSafeEqual(receivedBuf, adminBuf)) {
      logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen')
      return res.status(401).json({ error: 'Falscher Admin-Key' })
    }
  } catch {
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen')
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
  if (req.originalUrl?.startsWith('/api/v1/auth/')) {
    return next()
  }
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

/** Middleware: prüft httpOnly-Cookie */
export function requireAuth(req, res, next) {
  const token = req.cookies?.admin_token
  if (token && sessionValid(token)) {
    req.adminSessionId = token.split('.')[0]
    return next()
  }
  res.status(401).json({ error: 'Nicht autorisiert' })
}

/** Fehlerausgabe: in Produktion keine internen Details preisgeben */
export function serverError(res, err) {
  logger.error({ err }, 'Server-Fehler')
  res.status(500).json({ error: IS_PROD ? 'Interner Serverfehler' : err.message })
}

/** Admin-seitige Fehlerausgabe: bereinigt Dateipfade, kein Stack an Client */
export function adminError(res, err) {
  logger.error({ err: sanitize(err instanceof Error ? { message: err.message, stack: err.stack } : err) }, 'Admin-Fehler')
  const rawMsg = err.message || String(err)
  const cleanMsg = rawMsg.replace(/(?:\/[\w.-]+)+/g, '[path]').replace(/(?:[A-Z]:\\[\w\\.-]+)/gi, '[path]')
  res.status(500).json({ error: cleanMsg })
}

export { ADMIN_KEY, IS_PROD }
