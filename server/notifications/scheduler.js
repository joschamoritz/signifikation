/**
 * scheduler.js – Täglicher Push-Notification-Job
 *
 * Sendet täglich um 08:00 Europe/Berlin eine Benachrichtigung an alle
 * registrierten Geräte. Das Payload wird einmal pro Tag erstellt, damit
 * alle Nutzer dieselbe Nachricht erhalten.
 *
 * Catch-up (Review 2026-06-11, B-M7): War der Prozess um 08:00 down
 * (Deploy/Crash), entfiel der Tages-Push frueher stillschweigend — im
 * Gegensatz zu den Sweep-Jobs, die gegen persistierte Timestamps nachholen.
 * Jetzt: app_state.push_last_sent merkt sich den letzten Versandtag; beim
 * Boot wird nachgeholt, falls es nach 08:00 ist und heute noch nichts raus
 * ging. Idempotent ueber das Berlin-Datum.
 */
import cron from 'node-cron'
import db from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { sendPushToAll } from './sender.js'
import { buildNotificationPayload } from './templates.js'

const TIMEZONE = 'Europe/Berlin'
const SEND_HOUR = 8

const getStateStmt = db.prepare('SELECT value FROM app_state WHERE key = ?')
const setStateStmt = db.prepare(`
  INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`)

export function berlinDateStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now)
}

function berlinHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).format(now)
  )
}

export function hasSentToday(now = new Date()) {
  return getStateStmt.get('push_last_sent')?.value === berlinDateStr(now)
}

function markSent(now = new Date()) {
  setStateStmt.run('push_last_sent', berlinDateStr(now), Date.now())
}

/**
 * Führt den Push-Job für alle Abonnenten durch und persistiert den
 * Versandtag (Catch-up-Marker).
 */
async function runPushJob(now = new Date()) {
  logger.info({ date: now.toISOString() }, 'Push-Job gestartet')

  const payload = buildNotificationPayload(now)
  const { sent, failed, total } = await sendPushToAll(payload)
  markSent(now)

  logger.info({ sent, failed, devices: total, title: payload.title }, 'Push-Job abgeschlossen')
}

/**
 * Boot-Catch-up: sendet den Tages-Push nach, wenn 08:00 Berlin verpasst
 * wurde. Exportiert (mit injizierbarem now) fuer Tests.
 * @returns {Promise<boolean>} true, wenn nachgesendet wurde
 */
export async function maybeCatchUpPush(now = new Date()) {
  if (berlinHour(now) < SEND_HOUR) return false
  if (hasSentToday(now)) return false
  logger.info('Push-Catch-up: 08:00-Versand wurde verpasst, hole nach')
  await runPushJob(now)
  return true
}

/**
 * Startet den täglichen Push-Scheduler (08:00 Europe/Berlin) inkl.
 * Boot-Catch-up. Gibt das cron-Task-Objekt zurück.
 */
export function startPushScheduler() {
  const task = cron.schedule(`0 ${SEND_HOUR} * * *`, () => {
    runPushJob().catch(err => {
      logger.error({ err }, 'Push-Job unerwarteter Fehler')
      reportAlert('push_job_failed', `Taeglicher Push-Job fehlgeschlagen: ${err?.message || err}`)
    })
  }, {
    timezone: TIMEZONE,
  })

  maybeCatchUpPush().catch(err => {
    logger.error({ err }, 'Push-Catch-up fehlgeschlagen')
    reportAlert('push_job_failed', `Push-Catch-up fehlgeschlagen: ${err?.message || err}`)
  })

  logger.info('Push-Scheduler gestartet (täglich 08:00 Europe/Berlin, mit Boot-Catch-up)')
  return task
}
