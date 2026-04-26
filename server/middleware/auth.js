import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config as _loadEnv } from 'dotenv'
import logger from '../logger.js'
import db from '../db.js'

// Load .env relative to this file — works regardless of PM2 cwd or process.env.DOTENV_CONFIG_PATH
_loadEnv({
  path: join(dirname(fileURLToPath(import.meta.url)), '../../.env'),
  override: false,
})

const IS_PROD = process.env.NODE_ENV === 'production'

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

    // Finde User
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(emailLower)

    if (!user) {
      logger.warn({ ip: req.ip, email: emailLower }, 'Admin-Login fehlgeschlagen (User nicht gefunden)')
      return res.status(401).json({ error: 'Email oder Passwort falsch' })
    }

    // Prüfe Admin-Role zuerst (fail-fast)
    const profile = db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(user.id)

    if (!profile || profile.role !== 'admin') {
      logger.warn({ ip: req.ip, email: emailLower, userId: user.id }, 'Admin-Login fehlgeschlagen (keine Admin-Role)')
      return res.status(401).json({ error: 'Email oder Passwort falsch' })
    }

    // Validiere Passwort (bcryptjs-Hash)
    const account = db.prepare('SELECT password FROM account WHERE userId = ? AND providerId = ?').get(user.id, 'credential')

    if (!account || !account.password) {
      logger.warn({ ip: req.ip, email: emailLower, userId: user.id }, 'Admin-Login fehlgeschlagen (kein Passwort)')
      return res.status(401).json({ error: 'Email oder Passwort falsch' })
    }

    // Timing-safe Passwort-Vergleich
    const { default: bcryptjs } = await import('bcryptjs')
    const passwordMatch = await bcryptjs.compare(String(password), account.password)
    if (!passwordMatch) {
      logger.warn({ ip: req.ip, email: emailLower, userId: user.id }, 'Admin-Login fehlgeschlagen (Passwort falsch)')
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

    logger.info({ ip: req.ip, email: emailLower, userId: user.id }, 'Admin eingeloggt')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: sanitize(err), ip: req.ip }, 'Admin-Auth-Fehler')
    res.status(500).json({ error: IS_PROD ? 'Interner Fehler' : err.message })
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
    res.clearCookie('better-auth.session_token', { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err: sanitize(err) }, 'Admin-Logout-Fehler')
    res.status(500).json({ error: IS_PROD ? 'Interner Fehler' : err.message })
  }
}

/** Middleware: CSRF-Schutz – verhindert Form-basierte CSRF-Angriffe */
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
    res.status(500).json({ error: IS_PROD ? 'Interner Fehler' : err.message })
  }
}

/** Fehlerausgabe: in Produktion keine internen Details preisgeben */
export function serverError(res, err) {
  logger.error({ err }, 'Server-Fehler')
  res.status(500).json({ error: IS_PROD ? 'Interner Serverfehler' : err.message })
}

/** Admin-seitige Fehlerausgabe: bereinigt Dateipfade, kein Stack an Client */
export function adminError(res, err) {
  logger.error({ err: sanitize(err instanceof Error ? { message: err.message, stack: err.stack } : err) }, 'Admin-Fehler')
  if (IS_PROD) {
    return res.status(500).json({ error: 'Interner Admin-Fehler' })
  }
  const rawMsg = err.message || String(err)
  const cleanMsg = rawMsg.replace(/(?:\/[\w.-]+)+/g, '[path]').replace(/(?:[A-Z]:\\[\w\\.-]+)/gi, '[path]')
  res.status(500).json({ error: cleanMsg })
}

export { IS_PROD }
