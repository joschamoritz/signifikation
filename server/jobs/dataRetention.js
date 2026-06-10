/**
 * server/jobs/dataRetention.js
 *
 * Retention für unbegrenzt wachsende Log-Tabellen (Review-Finding Mittel,
 * 2026-06-10): audit_log (jede Admin-Aktion + jedes Security-Event) und
 * classroom_telemetry (eine Zeile pro Schüler-Submission) hatten kein
 * Aufräumen — nach Jahren wären das die größten Tabellen der DB.
 *
 * Frist: 24 Monate für beide (User-Entscheid 2026-06-10). Die §14-Metriken
 * der Telemetrie nutzen nur 30-Tage-Fenster, ältere Daten tragen nichts bei;
 * der Audit-Trail bleibt 2 Jahre für Forensik nachvollziehbar.
 *
 * Täglicher Sweep, gleiches Muster wie classroomRetention: neustart-fest
 * (rechnet gegen persistierte Zeitstempel), idempotent (Mehrfach-Läufe
 * löschen nichts doppelt). Der Delete läuft einmal täglich als Scan —
 * eigene Indizes nur dafür lohnen sich nicht.
 */

import db from '../db.js'
import logger from '../logger.js'

export const DEFAULT_RETENTION_MS = 730 * 24 * 60 * 60 * 1000 // 24 Monate (730 Tage)
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

// audit_log.timestamp ist ISO-String, classroom_telemetry.ts Unix-Millis.
const deleteOldAuditStmt = db.prepare(`DELETE FROM audit_log WHERE timestamp < ?`)
const deleteOldTelemetryStmt = db.prepare(`DELETE FROM classroom_telemetry WHERE ts < ?`)

export function runDataRetention({ now = Date.now(), retentionMs = DEFAULT_RETENTION_MS } = {}) {
  const cutoffMs = now - retentionMs
  const cutoffIso = new Date(cutoffMs).toISOString()

  const audit = deleteOldAuditStmt.run(cutoffIso)
  const telemetry = deleteOldTelemetryStmt.run(cutoffMs)

  const result = { auditDeleted: audit.changes, telemetryDeleted: telemetry.changes }
  if (result.auditDeleted > 0 || result.telemetryDeleted > 0) {
    logger.info(result, 'Retention-Sweep: alte Log-Eintraege geloescht')
  }
  return result
}

export function startDataRetention(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS

  const run = () => {
    try {
      runDataRetention(options)
    } catch (err) {
      logger.warn({ err }, 'Retention-Sweep fehlgeschlagen')
    }
  }

  run() // beim Start: holt waehrend Downtime faellig gewordene Loeschungen nach
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startDataRetention
