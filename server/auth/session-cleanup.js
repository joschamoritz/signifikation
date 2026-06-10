import db from '../db.js'
import logger from '../logger.js'

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // täglich

export function startSessionCleanup() {
  const run = () => {
    try {
      const nowIso = new Date().toISOString()
      const sessions = db.prepare('DELETE FROM session WHERE expiresAt < ?').run(nowIso)
      // Abgelaufene Verification-Tokens (E-Mail-Verifizierung, Passwort-Reset)
      // wurden nie aufgeraeumt — der Index idx_verification_expiresAt lief ins
      // Leere (Review 2026-06-10).
      const verifications = db.prepare('DELETE FROM verification WHERE expiresAt < ?').run(nowIso)
      if (sessions.changes > 0 || verifications.changes > 0) {
        logger.info(
          { sessions: sessions.changes, verifications: verifications.changes },
          'Abgelaufene Sessions/Verification-Tokens bereinigt',
        )
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
