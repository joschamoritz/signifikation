import '../env.js'
import { createHash } from 'node:crypto'
import logger from '../logger.js'
import db from '../db.js'
import { auditSecurity } from '../audit.js'
import { sendErrorResponse } from '../error-handling.js'

// DSGVO: Email-Adressen nicht im Klartext loggen.
// SHA-256 (gekürzt) reicht zur Korrelation in Logs ohne Klartext-Speicherung.
function hashEmail(email) {
  if (!email) return null
  return createHash('sha256').update(String(email).toLowerCase().trim()).digest('hex').slice(0, 16)
}

const IS_PROD = process.env.NODE_ENV === 'production'
// Strict-Mode-Check für Klartext-Fehlerausgabe: nur in echtem dev-Modus,
// nicht in staging/test/sonstigem, damit interne Pfade nicht versehentlich
// exposed werden.
const IS_DEV = process.env.NODE_ENV === 'development'
function clientErrorMessage(err) {
  return IS_DEV ? err.message : 'Interner Fehler'
}

// Dummy-Hash für constant-time-Login: Wenn User nicht existiert oder keine
// Admin-Rolle hat, wird trotzdem bcrypt.compare gegen diesen Hash gefahren,
// damit Response-Zeiten keine User-/Admin-Enumeration erlauben.
// (bcrypt-Hash von 'invalid-dummy-password' mit cost=10)
const DUMMY_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8RU.kF8wQHbgcQp.4Xz5o5Wi1iD./.'

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

/** POST /admin/auth – Email+Password-Login für Admin */
export async function adminAuth(req, res) {
  const { email, password } = req.body || {}

  if (!email || !password) {
    logger.warn({ ip: req.ip }, 'Admin-Login fehlgeschlagen (fehlende Daten)')
    return res.status(400).json({ error: 'Email und Passwort erforderlich' })
  }

  try {
    const emailLower = String(email).trim().toLowerCase()
    const { default: bcryptjs } = await import('bcryptjs')

    // User, Admin-Rolle und Account-Passwort holen. Wir entscheiden ERST nach
    // dem bcrypt.compare, ob der Login gültig ist – damit alle Fail-Pfade die
    // gleiche Laufzeit haben (kein Timing-Leak für User-/Admin-Enumeration).
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(emailLower)
    const profile = user
      ? db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(user.id)
      : null
    const account = user
      ? db.prepare('SELECT password FROM account WHERE userId = ? AND providerId = ?').get(user.id, 'credential')
      : null

    const hashToCompare = account?.password || DUMMY_BCRYPT_HASH
    const passwordMatch = await bcryptjs.compare(String(password), hashToCompare)

    const isAdmin = profile?.role === 'admin'
    const loginValid = Boolean(user) && Boolean(account?.password) && isAdmin && passwordMatch

    if (!loginValid) {
      const reason = !user
        ? 'User nicht gefunden'
        : !isAdmin
          ? 'keine Admin-Role'
          : !account?.password
            ? 'kein Passwort'
            : 'Passwort falsch'
      logger.warn(
        { ip: req.ip, emailHash: hashEmail(emailLower), userId: user?.id, reason },
        'Admin-Login fehlgeschlagen'
      )
      auditSecurity('LOGIN_FAIL', { subject: hashEmail(emailLower), reason }, { ip: req.ip, status: 'FAIL' })
      return res.status(401).json({ error: 'Email oder Passwort falsch' })
    }

    // Erstelle betterAuth Session direkt in der DB
    const { randomUUID } = await import('crypto')
    const sessionId = randomUUID()
    const sessionToken = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 Tage
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, user.id, sessionToken, expiresAt, req.ip, req.headers['user-agent'] || '', now, now)

    // Setze Session-Cookie (httpOnly, secure, sameSite)
    res.cookie('better-auth.session_token', sessionToken, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage
    })

    logger.info({ ip: req.ip, emailHash: hashEmail(emailLower), userId: user.id }, 'Admin eingeloggt')
    auditSecurity('LOGIN_SUCCESS', { userId: user.id }, { ip: req.ip })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: sanitize(err), ip: req.ip }, 'Admin-Auth-Fehler')
    res.status(500).json({ error: clientErrorMessage(err) })
  }
}

/** POST /admin/logout – Session beenden */
export async function adminLogout(req, res) {
  try {
    // Lösche Session aus DB (optional – Cookie-Expiry reicht auch)
    if (req.session?.id) {
      db.prepare('DELETE FROM session WHERE id = ?').run(req.session.id)
    }

    logger.info({ userId: req.session?.userId }, 'Admin ausgeloggt')
    auditSecurity('LOGOUT', { userId: req.session?.userId || 'unknown' }, { ip: req.ip })
    res.clearCookie('better-auth.session_token', { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: sanitize(err) }, 'Admin-Logout-Fehler')
    res.status(500).json({ error: clientErrorMessage(err) })
  }
}

/** Middleware: CSRF-Schutz – verhindert Form-basierte CSRF-Angriffe */
// CSRF-Header, den alle State-Changing-Requests vom eigenen Client mitschicken müssen.
// Ein Cross-Origin-Browser-Request kann diesen Header ohne Preflight nicht setzen
// (Custom-Header → non-simple → CORS-Preflight, der für fremde Origins fehlschlägt).
// Damit ist der Header eine echte zweite Verteidigung neben Content-Type und SameSite.
const CSRF_HEADER = 'x-requested-with'
const CSRF_HEADER_VALUE = 'signifikation-app'

function checkCsrfHeader(req, res) {
  const value = req.headers[CSRF_HEADER]
  if (value !== CSRF_HEADER_VALUE) {
    logger.warn(
      { method: req.method, url: req.originalUrl, header: value || null },
      'CSRF-Schutz: X-Requested-With fehlt oder ist ungueltig'
    )
    res.status(403).json({ error: 'CSRF-Header fehlt' })
    return false
  }
  return true
}

export function csrfProtect(req, res, next) {
  if (req.originalUrl?.startsWith('/api/v1/auth/')) {
    return next()
  }
  // Mollie-Webhook sendet application/x-www-form-urlencoded – kein CSRF nötig,
  // da kein Browser-Cookie beteiligt ist (Server→Server-Aufruf)
  if (req.originalUrl?.startsWith('/api/v1/payments/webhook')) {
    return next()
  }
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.includes('application/json')) {
      logger.warn({ method: req.method, contentType }, 'CSRF-Schutz: falscher Content-Type')
      return res.status(403).json({ error: 'Ungültiger Content-Type' })
    }
    if (!checkCsrfHeader(req, res)) return
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
    if (!checkCsrfHeader(req, res)) return
  }
  next()
}

/** Middleware: prüft betterAuth Session (Admin muss role=admin haben) */
export async function requireAuth(req, res, next) {
  try {
    // Hole Session-Token aus Cookie oder betterAuth req.session
    let sessionId, userId, sessionToken

    if (req.session?.userId) {
      // betterAuth setzt req.session automatisch (für /api/v1/auth routes)
      sessionId = req.session.id
      userId = req.session.userId
    } else {
      // Manuell validieren für /admin routes
      sessionToken = req.cookies['better-auth.session_token']
      if (!sessionToken) {
        logger.warn({ ip: req.ip }, 'Admin-Zugriff ohne Session-Token')
        return res.status(401).json({ error: 'Nicht autorisiert' })
      }

      // Finde Session in DB
      const session = db.prepare('SELECT id, userId FROM session WHERE token = ? AND expiresAt > ?').get(
        sessionToken,
        new Date().toISOString()
      )

      if (!session) {
        logger.warn({ ip: req.ip }, 'Admin-Zugriff mit ungültigem Session-Token')
        return res.status(401).json({ error: 'Nicht autorisiert' })
      }

      sessionId = session.id
      userId = session.userId
    }

    // Prüfe Admin-Role
    const profile = db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(userId)

    if (!profile || profile.role !== 'admin') {
      logger.warn({ ip: req.ip, userId }, 'Admin-Zugriff ohne Admin-Role')
      return res.status(403).json({ error: 'Nicht berechtigt' })
    }

    req.adminSessionId = sessionId
    req.session = { id: sessionId, userId }
    next()
  } catch (err) {
    logger.error({ err: sanitize(err), ip: req.ip }, 'requireAuth-Fehler')
    res.status(500).json({ error: clientErrorMessage(err) })
  }
}

/**
 * Fehlerausgabe – delegiert an sendErrorResponse (server/error-handling.js).
 * Einheitliches Format: { error, code, details? }.
 *
 * Legacy-Wrapper: Neue Routen sollten `throw new AppError(...)` mit asyncHandler
 * verwenden statt direkt serverError aufzurufen.
 */
export function serverError(res, err) {
  sendErrorResponse(res, err)
}

/**
 * Admin-Fehlerausgabe – wie serverError, markiert aber den Admin-Pfad,
 * damit sendErrorResponse Details auch in Production preisgibt.
 *
 * Akzeptiert zwei Signaturen für Rückwärtskompatibilität:
 *   adminError(res, err)
 *   adminError(res, status, message, err)  – legacy 4-arg-Form
 */
export function adminError(res, errOrStatus, message, errArg) {
  let err
  if (typeof errOrStatus === 'number') {
    // Legacy: adminError(res, 500, 'msg', err) → message+err zusammenführen
    const base = errArg instanceof Error ? errArg : new Error(String(errArg ?? message))
    err = message ? new Error(`${message}: ${base.message}`) : base
    if (errArg?.stack) err.stack = errArg.stack
  } else {
    err = errOrStatus
  }
  // adminError wird ausschließlich aus Handlern HINTER requireAuth gerufen
  // (alle Aufrufer stehen im try/catch einer bereits authentifizierten Admin-
  // Route) → authenticated bewusst true, damit Details auch in Production
  // sichtbar bleiben.
  sendErrorResponse(res, err, { path: '/admin', authenticated: true })
}

export { IS_PROD }
