#!/usr/bin/env node
/**
 * invalidate-all-sessions.js
 *
 * Notfall-Pfad bei DB-Leak-Verdacht oder Sicherheitsvorfall:
 * löscht ALLE aktiven Sessions auf einen Schlag. Alle User
 * (Admin + Premium + normale Konten) müssen sich danach neu
 * einloggen.
 *
 * Begleitendes ADR: docs/adr/0006-session-token-im-klartext.md
 *
 * Aufruf:
 *   node server/invalidate-all-sessions.js
 *
 * Optionaler Modus: --user <userId>  → invalidiert nur Sessions
 * eines bestimmten Users (z.B. nach kompromittiertem Admin-Account).
 */
import './env.js'
import db from './db.js'
import logger from './logger.js'
import { auditSecurity } from './audit.js'

const args = process.argv.slice(2)
const userIdxIdx = args.indexOf('--user')
const targetUserId = userIdxIdx >= 0 ? args[userIdxIdx + 1] : null

if (userIdxIdx >= 0 && !targetUserId) {
  console.error('--user erwartet einen User-ID-Wert')
  process.exit(1)
}

try {
  let result
  if (targetUserId) {
    result = db.prepare('DELETE FROM session WHERE userId = ?').run(targetUserId)
    console.log(`Sessions für User ${targetUserId} gelöscht: ${result.changes}`)
    auditSecurity(
      'SESSIONS_INVALIDATED',
      { scope: 'single-user', userId: targetUserId, deleted: result.changes },
      { ip: 'cli', status: 'SUCCESS' }
    )
  } else {
    result = db.prepare('DELETE FROM session').run()
    console.log(`Alle Sessions gelöscht: ${result.changes}`)
    auditSecurity(
      'SESSIONS_INVALIDATED',
      { scope: 'all', deleted: result.changes },
      { ip: 'cli', status: 'SUCCESS' }
    )
  }
  logger.info({ scope: targetUserId ? 'single-user' : 'all', changes: result.changes }, 'Session-Invalidate ausgeführt')
} catch (err) {
  console.error('Fehler beim Session-Invalidate:', err.message)
  logger.error({ err }, 'Session-Invalidate fehlgeschlagen')
  process.exit(1)
} finally {
  db.close()
}
