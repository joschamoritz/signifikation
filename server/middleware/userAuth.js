import logger from '../logger.js'
import { fromNodeHeaders } from 'better-auth/node'
import db from '../db.js'
import { auth } from '../auth/index.js'

const IS_PROD = process.env.NODE_ENV === 'production'

// Dev-Header-Auth (x-dev-user-id / x-dev-user-role) ist eine doppelt
// gesicherte Backdoor: NODE_ENV muss !== 'production' sein UND
// ALLOW_DEV_AUTH muss explizit auf '1' stehen. Damit ist ein PM2-Misconfig
// (NODE_ENV nicht gesetzt) kein Sicherheits-Bypass mehr.
const DEV_AUTH_ENABLED = !IS_PROD && process.env.ALLOW_DEV_AUTH === '1'

function normalizeRole(role) {
  if (role === 'premium') return 'premium'
  if (role === 'admin') return 'admin'
  return 'user'
}

// Einzige Quelle der Wahrheit fuer "gilt als Premium" (premium- oder admin-Rolle).
// Vorher an drei Stellen unabhaengig dupliziert (account.js, customLemmaQuota.js,
// admin-product-metrics.js) - account.js hatte dabei 'admin' vergessen.
export function isPremiumRole(role) {
  return role === 'premium' || role === 'admin'
}

function getDevUserFromHeaders(req) {
  const id = req.headers['x-dev-user-id']
  if (!id || typeof id !== 'string' || !id.trim()) return null
  const role = normalizeRole(req.headers['x-dev-user-role'])
  return { id: id.trim(), role, source: 'dev-header' }
}

const ensureProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, 'user', ?, ?)
  ON CONFLICT(user_id) DO NOTHING
`)

const getProfileRoleStmt = db.prepare(`
  SELECT role
  FROM user_profiles
  WHERE user_id = ?
`)

function resolveRoleForUser(userId) {
  try {
    const now = Date.now()
    ensureProfileStmt.run(userId, now, now)
  } catch (err) {
    logger.warn({ err, userId }, 'Konnte user_profiles nicht initialisieren')
  }
  const row = getProfileRoleStmt.get(userId)
  return normalizeRole(row?.role)
}

function getAuthUser(req) {
  if (req.user && typeof req.user === 'object' && req.user.id) {
    return { id: String(req.user.id), role: normalizeRole(req.user.role), source: 'auth-context' }
  }
  if (DEV_AUTH_ENABLED) {
    const devUser = getDevUserFromHeaders(req)
    if (devUser) return devUser
  }
  return null
}

async function getAuthUserFromSession(req) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  const sessionUser = session?.user
  if (!sessionUser?.id) return null
  const userId = String(sessionUser.id)
  const role = resolveRoleForUser(userId)
  return {
    id: userId,
    role,
    source: 'better-auth-session',
  }
}

export async function requireAuthUser(req, res, next) {
  try {
    const sessionUser = await getAuthUserFromSession(req)
    const user = sessionUser || getAuthUser(req)
    if (!user) return res.status(401).json({ error: 'Nicht autorisiert' })
    req.user = user
    if (user.source === 'dev-header') {
      logger.debug({ userId: user.id, role: user.role }, 'Dev-Header-Auth verwendet')
    }
    return next()
  } catch (err) {
    logger.error({ err }, 'Session-Aufloesung fehlgeschlagen')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
}

export async function optionalAuthUser(req, res, next) {
  try {
    const sessionUser = await getAuthUserFromSession(req)
    const user = sessionUser || getAuthUser(req)
    if (user) {
      req.user = user
      if (user.source === 'dev-header') {
        logger.debug({ userId: user.id, role: user.role }, 'Dev-Header-Auth verwendet')
      }
    }
    return next()
  } catch (err) {
    logger.warn({ err }, 'Optionale Session-Auflösung fehlgeschlagen – fahre ohne User fort')
    return next()
  }
}

export async function requirePremium(req, res, next) {
  try {
    const sessionUser = await getAuthUserFromSession(req)
    const user = sessionUser || getAuthUser(req)
    if (!user) return res.status(401).json({ error: 'Nicht autorisiert' })
    if (!isPremiumRole(user.role)) return res.status(403).json({ error: 'Premium-Berechtigung erforderlich' })
    req.user = user
    if (user.source === 'dev-header') {
      logger.debug({ userId: user.id }, 'Dev-Header-Premium-Auth verwendet')
    }
    return next()
  } catch (err) {
    logger.error({ err }, 'Session-Aufloesung fehlgeschlagen')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
}
