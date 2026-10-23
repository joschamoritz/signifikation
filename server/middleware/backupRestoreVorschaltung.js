import express from 'express'
import { adminLimiter } from './rateLimiter.js'
import { requireAuth, csrfProtect } from './auth.js'

/** Größtes Sicherungsdokument, das /admin/backup/restore(/pruefen) annimmt. */
export const BACKUP_RESTORE_BODY_LIMIT = '10mb'

/**
 * Vorgeschaltet vor /admin/backup/restore und /admin/backup/restore/pruefen (server/index.js).
 *
 * Reihenfolge ist Absicht: Rate-Limit → Anmeldung (Cookie, Sitzung, Admin-Rolle; braucht keinen Body) →
 * CSRF (Content-Type und Header; braucht ebenfalls keinen Body) → erst dann der 10-MB-JSON-Parser.
 * Wer nicht angemeldet ist, bekommt 401 und lässt keinen Body parsen; ein ungültiges JSON mit fremdem
 * Cookie liefert 401 statt 400. Das Rate-Limit zählt hier einmal; die beiden Routen zählen nicht noch einmal.
 */
export const backupRestoreVorschaltung = [
  adminLimiter,
  requireAuth,
  csrfProtect,
  express.json({ limit: BACKUP_RESTORE_BODY_LIMIT }),
]
