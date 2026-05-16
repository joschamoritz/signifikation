/**
 * scheduler.js – Täglicher Push-Notification-Job
 *
 * Sendet täglich um 08:00 Europe/Berlin an alle User mit aktiver Subscription.
 * Einzelne Fehler brechen den Job nicht ab.
 */
import cron from 'node-cron'
import db from '../db.js'
import logger from '../logger.js'
import { sendPushToUser } from './sender.js'

const getActiveUserIdsStmt = db.prepare(`
  SELECT DISTINCT user_id
  FROM push_subscriptions
`)

/**
 * Führt den Push-Job für alle Subscriber durch.
 */
async function runPushJob() {
  const date = new Date()
  logger.info({ date: date.toISOString() }, 'Push-Job gestartet')

  const rows = getActiveUserIdsStmt.all()
  if (!rows.length) {
    logger.info('Push-Job: keine aktiven Subscriptions – abgebrochen')
    return
  }

  logger.info({ count: rows.length }, 'Push-Job: sende an User')

  let totalSent = 0
  let totalFailed = 0

  for (const { user_id } of rows) {
    try {
      const { sent, failed } = await sendPushToUser(user_id, date)
      totalSent   += sent
      totalFailed += failed
    } catch (err) {
      logger.error({ err, userId: user_id }, 'Push-Job: Fehler bei User – übersprungen')
      totalFailed++
    }
  }

  logger.info({ totalSent, totalFailed, users: rows.length }, 'Push-Job abgeschlossen')
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
