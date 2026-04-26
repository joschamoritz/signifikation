import db from '../db.js'
import logger from '../logger.js'

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // täglich

export function startSessionCleanup() {
  const run = () => {
    try {
      const result = db.prepare('DELETE FROM session WHERE expiresAt < ?').run(new Date().toISOString())
      if (result.changes > 0) {
        logger.info({ deleted: result.changes }, 'Abgelaufene Sessions bereinigt')
      }
    } catch (err) {
      logger.warn({ err }, 'Session-Cleanup fehlgeschlagen')
    }
  }

  run() // direkt beim Start einmal ausführen
  const interval = setInterval(run, CLEANUP_INTERVAL_MS)
  interval.unref()
  return interval
}
