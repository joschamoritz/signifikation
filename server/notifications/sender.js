/**
 * sender.js – Push-Benachrichtigungen versenden
 *
 * Unterstützt Web Push (via web-push) und iOS APNs (via node-apn).
 * VAPID- und APNs-Konfiguration werden beim Modul-Load aus den Env-Variablen initialisiert.
 */
import webpush from 'web-push'
import apn from 'node-apn'
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

// ── APNs-Initialisierung ──────────────────────────────────────────────────────

const APNS_KEY_ID   = process.env.APNS_KEY_ID
const APNS_TEAM_ID  = process.env.APNS_TEAM_ID
const APNS_KEY_PATH = process.env.APNS_KEY_PATH
const APNS_BUNDLE_ID = 'de.signifikation.app'

let apnsProvider = null

if (APNS_KEY_ID && APNS_TEAM_ID && APNS_KEY_PATH) {
  try {
    apnsProvider = new apn.Provider({
      token: {
        key:    APNS_KEY_PATH,
        keyId:  APNS_KEY_ID,
        teamId: APNS_TEAM_ID,
      },
      production: true,
    })
    logger.info('APNs-Provider initialisiert')
  } catch (err) {
    logger.error({ err }, 'APNs-Provider konnte nicht initialisiert werden')
  }
} else {
  logger.warn('APNS_KEY_ID / APNS_TEAM_ID / APNS_KEY_PATH nicht gesetzt – iOS Push deaktiviert')
}

// ── APNs ──────────────────────────────────────────────────────────────────────

/**
 * Sendet eine APNs-Notification an ein iOS-Gerät.
 * Bei ungültigem Token (BadDeviceToken, Unregistered) wird die Subscription gelöscht.
 *
 * @param {{ id: string, apns_token: string }} sub
 * @param {object} payload
 * @returns {Promise<boolean>}
 */
async function sendApnsPush(sub, payload) {
  if (!apnsProvider) {
    logger.warn({ subId: sub.id }, 'APNs nicht konfiguriert – Nachricht übersprungen')
    return false
  }

  const note = new apn.Notification()
  note.expiry       = Math.floor(Date.now() / 1000) + 3600
  note.badge        = 1
  note.sound        = 'default'
  note.alert        = { title: payload.title, body: payload.body }
  note.topic        = APNS_BUNDLE_ID
  note.pushType     = 'alert'

  try {
    const result = await apnsProvider.send(note, sub.apns_token)

    if (result.sent.length > 0) {
      logger.debug({ subId: sub.id }, 'APNs-Push gesendet')
      return true
    }

    const failed = result.failed[0]
    const reason = failed?.response?.reason ?? 'unknown'
    logger.warn({ subId: sub.id, reason }, 'APNs-Push fehlgeschlagen')

    if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
      try { deleteSubscriptionByIdStmt.run(sub.id) } catch { /* ignore */ }
      logger.info({ subId: sub.id, reason }, 'APNs-Subscription gelöscht')
    }

    return false
  } catch (err) {
    logger.warn({ err, subId: sub.id }, 'APNs-Push Ausnahme')
    return false
  }
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
    if (ok) { sent++ } else { failed++ }
  }

  logger.debug({ userId, sent, failed }, 'Push-Benachrichtigungen für User abgeschlossen')
  return { sent, failed }
}
