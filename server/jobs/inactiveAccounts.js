/**
 * server/jobs/inactiveAccounts.js
 *
 * Löschfrist für inaktive Konten (Entscheidung 2026-10-19, Verzeichnis von
 * Verarbeitungstätigkeiten im Repo unterricht.signifikation, V4a):
 *   - 24 Monate ohne Anmeldung → Konto wird gelöscht (deleteUserTx, wie die
 *     Löschung in der App; der Zahlungsnachweis bleibt getrennt bestehen).
 *   - 30 Tage vorher geht eine Warnmail raus. Ohne verschickte Warnung wird nie
 *     gelöscht; meldet sich die Person an, hebt touchUserActivity die Warnung auf.
 *   - Admin-Konten sind ausgenommen.
 *
 * Grundlage ist user_activity.last_active_at (Migration 0024), ersatzweise
 * user.createdAt. Täglicher Sweep, neustart-fest und idempotent wie die
 * anderen Retention-Jobs.
 */

import db from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { deleteUserTx, ADMIN_DELETE_BLOCKED } from '../routes/admin-users-data.js'
import { isMailConfigured, sendInactivityWarningMail } from '../mailer.js'

const TAG_MS = 24 * 60 * 60 * 1000
export const INACTIVE_DAYS = 730
export const WARNING_LEAD_DAYS = 30
const MAX_WARNINGS_PER_RUN = 50
const DEFAULT_SWEEP_INTERVAL_MS = TAG_MS

const lastActive = `COALESCE(a.last_active_at, u.createdAt)`
const notAdmin = `COALESCE((SELECT role FROM user_profiles p WHERE p.user_id = u.id), 'user') <> 'admin'`

const toWarnStmt = db.prepare(`
  SELECT u.id, u.name, u.email, ${lastActive} AS lastActive
  FROM user u LEFT JOIN user_activity a ON a.user_id = u.id
  WHERE ${lastActive} < ? AND a.inactivity_warned_at IS NULL AND ${notAdmin}
  LIMIT ${MAX_WARNINGS_PER_RUN}
`)

const markWarnedStmt = db.prepare(`
  INSERT INTO user_activity (user_id, last_active_at, inactivity_warned_at) VALUES (@id, @lastActive, @now)
  ON CONFLICT(user_id) DO UPDATE SET inactivity_warned_at = excluded.inactivity_warned_at
`)

const toDeleteStmt = db.prepare(`
  SELECT u.id
  FROM user u JOIN user_activity a ON a.user_id = u.id
  WHERE a.inactivity_warned_at IS NOT NULL AND a.inactivity_warned_at < ?
    AND ${lastActive} < ? AND ${notAdmin}
`)

export async function runInactiveAccounts({ now = Date.now(), sendMail = sendInactivityWarningMail, mailReady = isMailConfigured() } = {}) {
  const result = { warned: 0, deleted: 0 }
  if (!mailReady) {
    logger.warn('Inaktive Konten: kein Mailversand konfiguriert – keine Warnungen, also auch keine Löschung')
    return result
  }

  // 1. Löschen: gewarnt vor mindestens 30 Tagen und seitdem nicht aktiv.
  const deleteBefore = new Date(now - INACTIVE_DAYS * TAG_MS).toISOString()
  const warnedBefore = new Date(now - WARNING_LEAD_DAYS * TAG_MS).toISOString()
  for (const { id } of toDeleteStmt.all(warnedBefore, deleteBefore)) {
    try {
      deleteUserTx(id)
    } catch (err) {
      // Admin-Konten werden nie geloescht (zentraler Schutz in deleteUserTx); der Sweep laeuft weiter
      if (err?.code !== ADMIN_DELETE_BLOCKED) throw err
      logger.warn({ userId: id }, 'Inaktive Konten: Admin-Konto uebersprungen')
      continue
    }
    result.deleted += 1
    logger.info({ userId: id }, `Konto nach ${INACTIVE_DAYS} Tagen ohne Anmeldung geloescht`)
  }

  // 2. Warnen: 30 Tage vor Ablauf der Frist.
  const warnBefore = new Date(now - (INACTIVE_DAYS - WARNING_LEAD_DAYS) * TAG_MS).toISOString()
  for (const u of toWarnStmt.all(warnBefore)) {
    const deleteOn = new Date(Math.max(now + WARNING_LEAD_DAYS * TAG_MS, Date.parse(u.lastActive) + INACTIVE_DAYS * TAG_MS))
    const info = await sendMail({ to: u.email, name: u.name, deleteOn })
    if (!info) continue // nächster Lauf versucht es wieder
    markWarnedStmt.run({ id: u.id, lastActive: u.lastActive, now: new Date(now).toISOString() })
    result.warned += 1
  }

  if (result.warned || result.deleted) logger.info(result, 'Inaktive Konten: Sweep')
  return result
}

export function startInactiveAccounts(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
  const run = () => {
    runInactiveAccounts(options).catch((err) => {
      logger.warn({ err }, 'Inaktive Konten: Sweep fehlgeschlagen')
      reportAlert('inactive_accounts_failed', `Sweep inaktiver Konten fehlgeschlagen: ${err?.message || err}`)
    })
  }
  run()
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startInactiveAccounts
