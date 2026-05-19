/**
 * scheduler.js – Täglicher Push-Notification-Job
 *
 * Sendet täglich um 08:00 Europe/Berlin eine Benachrichtigung an alle
 * registrierten Geräte. Das Payload wird einmal pro Tag erstellt, damit
 * alle Nutzer dieselbe Nachricht erhalten.
 */
import cron from 'node-cron'
import logger from '../logger.js'
import { sendPushToAll } from './sender.js'
import { buildNotificationPayload } from './templates.js'

/**
 * Führt den Push-Job für alle Abonnenten durch.
 */
async function runPushJob() {
  const date = new Date()
  logger.info({ date: date.toISOString() }, 'Push-Job gestartet')

  const payload = buildNotificationPayload(date)
  const { sent, failed, total } = await sendPushToAll(payload)

  logger.info({ sent, failed, devices: total, title: payload.title }, 'Push-Job abgeschlossen')
}

/**
 * Startet den täglichen Push-Scheduler (08:00 Europe/Berlin).
 * Gibt das cron-Task-Objekt zurück.
 */
export function startPushScheduler() {
  const task = cron.schedule('0 8 * * *', () => {
    runPushJob().catch(err => {
      logger.error({ err }, 'Push-Job unerwarteter Fehler')
    })
  }, {
    timezone: 'Europe/Berlin',
  })

  logger.info('Push-Scheduler gestartet (täglich 08:00 Europe/Berlin)')
  return task
}
