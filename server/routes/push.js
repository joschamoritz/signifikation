/**
 * push.js – Push-Notification-Endpunkte
 *
 * POST   /api/v1/push/subscribe        – Subscription speichern/updaten
 * DELETE /api/v1/push/unsubscribe      – Subscription löschen
 * GET    /api/v1/push/status           – Subscription-Status des eingeloggten Users
 * GET    /api/v1/push/vapid-public-key – VAPID Public Key (öffentlich)
 */
import express from 'express'
import { z } from 'zod/v3'
import { randomUUID } from 'crypto'
import { optionalAuthUser } from '../middleware/userAuth.js'
import { validate } from '../middleware/validate.js'
import { pushSubscribeLimiter } from '../middleware/rateLimiter.js'
import db from '../db.js'
import logger from '../logger.js'
import { isApnsConfigured } from '../notifications/sender.js'

const router = express.Router()

// ── Endpoint-Whitelist (Push-Provider) ───────────────────────────────────────
// Verhindert SSRF / Spam-Subscribes auf beliebige URLs
const ALLOWED_PUSH_HOSTS = [
  /\.googleapis\.com$/i,           // FCM
  /\.push\.apple\.com$/i,          // APNs
  /\.notify\.windows\.com$/i,      // WNS
  /\.push\.services\.mozilla\.com$/i, // Mozilla autopush
]

function isAllowedPushEndpoint(urlStr) {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'https:') return false
    return ALLOWED_PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

// ── Zod-Schemata ─────────────────────────────────────────────────────────────

const webSubscribeSchema = z.object({
  platform: z.literal('web'),
  endpoint: z.string().url('endpoint muss eine gültige URL sein').max(2048)
    .refine(isAllowedPushEndpoint, 'endpoint stammt nicht von einem bekannten Push-Provider'),
  p256dh:   z.string().min(1, 'p256dh erforderlich').max(256),
  auth:     z.string().min(1, 'auth erforderlich').max(64),
})

const iosSubscribeSchema = z.object({
  platform:   z.literal('ios'),
  apns_token: z.string().min(32, 'apns_token zu kurz').max(256),
})

const subscribeSchema = z.discriminatedUnion('platform', [
  webSubscribeSchema,
  iosSubscribeSchema,
])

const webUnsubscribeSchema = z.object({
  endpoint: z.string().url('endpoint muss eine gültige URL sein').max(2048)
    .refine(isAllowedPushEndpoint, 'endpoint stammt nicht von einem bekannten Push-Provider'),
})

const iosUnsubscribeSchema = z.object({
  apns_token: z.string().min(32, 'apns_token zu kurz').max(256),
})

const unsubscribeSchema = z.union([webUnsubscribeSchema, iosUnsubscribeSchema])

// ── Prepared Statements ───────────────────────────────────────────────────────

const findByEndpointStmt = db.prepare(`SELECT id, user_id FROM push_subscriptions WHERE endpoint = ?`)
const insertWebSubStmt = db.prepare(`
  INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, apns_token, created_at, updated_at)
  VALUES (?, ?, 'web', ?, ?, ?, NULL, ?, ?)
`)
const updateWebSubStmt = db.prepare(`
  UPDATE push_subscriptions SET user_id=?, p256dh=?, auth=?, updated_at=? WHERE endpoint=?
`)

const findByApnsTokenStmt = db.prepare(`SELECT id, user_id FROM push_subscriptions WHERE apns_token = ?`)
const insertIosSubStmt = db.prepare(`
  INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, apns_token, created_at, updated_at)
  VALUES (?, ?, 'ios', NULL, NULL, NULL, ?, ?, ?)
`)
const updateIosSubStmt = db.prepare(`
  UPDATE push_subscriptions SET user_id=?, updated_at=? WHERE apns_token=?
`)

// Lösch-Statements mit Owner-Filter: entweder anonym (user_id IS NULL) ODER
// passend zum Aufrufer. Verhindert, dass beliebige bekannte Endpoints/Tokens
// fremde Subscriptions entfernen.
const deleteByEndpointAnonStmt = db.prepare(`
  DELETE FROM push_subscriptions
  WHERE endpoint = ? AND user_id IS NULL
`)
const deleteByEndpointOwnerStmt = db.prepare(`
  DELETE FROM push_subscriptions
  WHERE endpoint = ? AND (user_id = ? OR user_id IS NULL)
`)

const deleteByApnsTokenAnonStmt = db.prepare(`
  DELETE FROM push_subscriptions
  WHERE apns_token = ? AND user_id IS NULL
`)
const deleteByApnsTokenOwnerStmt = db.prepare(`
  DELETE FROM push_subscriptions
  WHERE apns_token = ? AND (user_id = ? OR user_id IS NULL)
`)

const getStatusStmt = db.prepare(`
  SELECT platform
  FROM push_subscriptions
  WHERE user_id = ?
  ORDER BY updated_at DESC
  LIMIT 1
`)

// ── Endpunkte ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/push/vapid-public-key
 * Öffentlicher Endpunkt – kein Auth erforderlich.
 */
router.get('/api/v1/push/vapid-public-key', (req, res) => {
  const requiredKeys = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_MAILTO']
  const missing = requiredKeys.filter((name) => !process.env[name]?.trim())
  const key = process.env.VAPID_PUBLIC_KEY?.trim()

  if (missing.length > 0 || !key) {
    logger.warn({ missing }, 'Push: VAPID-Konfiguration unvollständig')
    return res.status(503).json({ error: 'VAPID nicht konfiguriert', missing })
  }

  res.json({ key })
})

/**
 * GET /api/v1/push/status
 */
router.get('/api/v1/push/status', optionalAuthUser, (req, res) => {
  if (!req.user) {
    return res.json({ subscribed: false, platform: null })
  }
  try {
    const row = getStatusStmt.get(req.user.id)
    if (!row) {
      return res.json({ subscribed: false, platform: null })
    }
    return res.json({ subscribed: true, platform: row.platform })
  } catch (err) {
    logger.error({ err, userId: req.user.id }, 'Push-Status-Abfrage fehlgeschlagen')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

/**
 * POST /api/v1/push/subscribe
 */
router.post(
  '/api/v1/push/subscribe',
  pushSubscribeLimiter,
  optionalAuthUser,
  validate(subscribeSchema, 'body'),
  (req, res) => {
    const userId = req.user?.id ?? null
    const now = Date.now()

    try {
      if (req.body.platform === 'web') {
        const { endpoint, p256dh, auth } = req.body
        const existing = findByEndpointStmt.get(endpoint)
        if (existing) {
          // Owner-Check: Update nur erlaubt, wenn die Subscription anonym ist
          // (user_id IS NULL → wird übernommen) oder dem aktuellen Aufrufer gehört.
          if (existing.user_id && existing.user_id !== userId) {
            logger.warn(
              { endpoint, existingUserId: existing.user_id, callerUserId: userId },
              'Push-Subscribe abgelehnt: Endpoint gehört anderem Nutzer'
            )
            return res.status(403).json({ error: 'Endpoint gehört einem anderen Nutzer.' })
          }
          updateWebSubStmt.run(userId, p256dh, auth, now, endpoint)
        } else {
          insertWebSubStmt.run(randomUUID(), userId, endpoint, p256dh, auth, now, now)
        }
        logger.info({ userId, platform: 'web' }, 'Push-Subscription gespeichert (web)')
      } else {
        // Fail-fast: iOS-Subscriptions ablehnen wenn APNs serverseitig nicht konfiguriert ist.
        // Verhindert, dass User sich als "subscribed" sehen, aber nie Notifications erhalten.
        if (!isApnsConfigured()) {
          logger.warn({ userId }, 'iOS-Push-Subscribe abgelehnt: APNs nicht konfiguriert')
          return res.status(503).json({ error: 'iOS Push ist serverseitig nicht konfiguriert.' })
        }
        const { apns_token } = req.body
        const existing = findByApnsTokenStmt.get(apns_token)
        if (existing) {
          if (existing.user_id && existing.user_id !== userId) {
            logger.warn(
              { existingUserId: existing.user_id, callerUserId: userId },
              'Push-Subscribe abgelehnt: APNS-Token gehört anderem Nutzer'
            )
            return res.status(403).json({ error: 'APNS-Token gehört einem anderen Nutzer.' })
          }
          updateIosSubStmt.run(userId, now, apns_token)
        } else {
          insertIosSubStmt.run(randomUUID(), userId, apns_token, now, now)
        }
        logger.info({ userId, platform: 'ios' }, 'Push-Subscription gespeichert (ios)')
      }

      return res.status(201).json({ ok: true })
    } catch (err) {
      logger.error({ err, userId }, 'Push-Subscribe fehlgeschlagen')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  }
)

/**
 * DELETE /api/v1/push/unsubscribe
 */
router.delete(
  '/api/v1/push/unsubscribe',
  pushSubscribeLimiter,
  optionalAuthUser,
  validate(unsubscribeSchema, 'body'),
  (req, res) => {
    const userId = req.user?.id ?? null

    try {
      if (req.body.endpoint) {
        // Anonyme Aufrufer dürfen nur anonyme Subscriptions löschen.
        // Eingeloggte Aufrufer dürfen eigene + anonyme Subscriptions löschen.
        const result = userId
          ? deleteByEndpointOwnerStmt.run(req.body.endpoint, userId)
          : deleteByEndpointAnonStmt.run(req.body.endpoint)
        logger.info({ userId, changes: result.changes }, 'Push-Subscription gelöscht (web)')
      } else if (req.body.apns_token) {
        const result = userId
          ? deleteByApnsTokenOwnerStmt.run(req.body.apns_token, userId)
          : deleteByApnsTokenAnonStmt.run(req.body.apns_token)
        logger.info({ userId, changes: result.changes }, 'Push-Subscription gelöscht (ios)')
      } else {
        return res.status(400).json({ error: 'endpoint oder apns_token erforderlich' })
      }

      return res.json({ ok: true })
    } catch (err) {
      logger.error({ err, userId }, 'Push-Unsubscribe fehlgeschlagen')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  }
)

export default router
