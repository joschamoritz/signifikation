import { cleanupExpiredSessions } from '../classroom-store.js'
import logger from '../logger.js'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000

export function runClassroomRetention() {
  const result = cleanupExpiredSessions()
  if (result.deletedSessions > 0) {
    logger.info({ deletedSessions: result.deletedSessions }, 'Classroom-Retention hat Sessions geloescht')
  }
  return result
}

export function startClassroomRetentionJob(intervalMs = DEFAULT_INTERVAL_MS) {
  const timer = setInterval(() => {
    try {
      runClassroomRetention()
    } catch (err) {
      logger.error({ err }, 'Classroom-Retention Job fehlgeschlagen')
    }
  }, intervalMs)
  timer.unref()
  logger.info({ intervalMs }, 'Classroom-Retention Job gestartet')
  return timer
}
