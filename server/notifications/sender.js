/**
 * sender.js – Push-Benachrichtigungen versenden
 *
 * Unterstützt Web Push (via web-push) und iOS APNs (Stub – wird vom iOS-Agent implementiert).
 * VAPID-Konfiguration wird beim Modul-Load aus den Env-Variablen initialisiert.
 */
import webpush from 'web-push'
import db from '../db.js'
import logger from '../logger.js'
import { buildNotificationPayload } from './templates.js'

// ── VAPID-Initialisierung ─────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_MAILTO      = process.env.VAPID_MAILTO

let vapidConfigured = false

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_MAILTO) {
  try {
    webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    vapidConfigured = true
    logger.info('VAPID-Konfiguration erfolgreich geladen')
  } catch (err) {
    logger.error({ err }, 'VAPID-Konfiguration fehlgeschlagen – Web Push deaktiviert')
  }
} else {
  logger.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_MAILTO nicht gesetzt – Web Push deaktiviert')
}

// ── Prepared Statements ───────────────────────────────────────────────────────

const getSubscriptionsStmt = db.prepare(`
  SELECT id, platform, endpoint, p256dh, auth, apns_token
  FROM push_subscriptions
  WHERE user_id = ?
`)

const deleteSubscriptionByIdStmt = db.prepare(`
  DELETE FROM push_subscriptions WHERE id = ?
`)

// ── Web Push ──────────────────────────────────────────────────────────────────

/**
 * Sendet eine Web-Push-Notification an eine einzelne Subscription.
 * Bei HTTP 410 (Gone) wird die Subscription automatisch gelöscht.
 *
 * @param {{ id: string, endpoint: string, p256dh: string, auth: string }} sub
 * @param {object} payload
 * @returns {Promise<boolean>} true bei Erfolg
 */
async function sendWebPush(sub, payload) {
  if (!vapidConfigured) {
    logger.warn({ subId: sub.id }, 'Web Push nicht konfiguriert – Nachricht übersprungen')
    return false
  }

  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth:   sub.auth,
    },
  }

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload))
    logger.debug({ subId: sub.id }, 'Web Push gesendet')
    return true
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription abgelaufen oder ungültig – löschen
      logger.info({ subId: sub.id, status: err.statusCode }, 'Web-Push-Subscription abgelaufen – wird gelöscht')
      try { deleteSubscriptionByIdStmt.run(sub.id) } catch { /* ignore */ }
    } else {
      logger.warn({ err, subId: sub.id }, 'Web Push fehlgeschlagen')
    }
    return false
  }
}

// ── APNs (Stub) ───────────────────────────────────────────────────────────────

/**
 * Stub für iOS APNs – wird vom iOS-Agent implementiert.
 *
 * @param {{ id: string, apns_token: string }} sub
 * @param {object} payload
 * @returns {Promise<boolean>}
 */
async function sendApnsPush(sub, payload) {
  logger.debug({ subId: sub.id, apnsToken: sub.apns_token?.slice(0, 8) + '…' }, 'APNs-Push (Stub) – noch nicht implementiert')
  return false
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Sendet eine Push-Benachrichtigung an alle aktiven Subscriptions eines Users.
 *
 * @param {string} userId
 * @param {Date} [date=new Date()]
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPushToUser(userId, date = new Date()) {
  const subscriptions = getSubscriptionsStmt.all(userId)
  if (!subscriptions.length) {
    return { sent: 0, failed: 0 }
  }

  const payload = buildNotificationPayload(date)
  let sent = 0
  let failed = 0

  for (const sub of subscriptions) {
    let ok = false
    if (sub.platform === 'web' && sub.endpoint) {
      ok = await sendWebPush(sub, payload)
    } else if (sub.platform === 'ios' && sub.apns_token) {
      ok = await sendApnsPush(sub, payload)
    } else {
      logger.warn({ subId: sub.id, platform: sub.platform }, 'Unbekannte Plattform oder fehlende Daten')
    }
    if (ok) sent++ else failed++
  }

  logger.debug({ userId, sent, failed }, 'Push-Benachrichtigungen für User abgeschlossen')
  return { sent, failed }
}
