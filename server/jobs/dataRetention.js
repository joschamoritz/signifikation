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
 * custom_lemma_usage (Audit 2026-06-15): wächst mit ~1 Zeile pro Account/Tag,
 * an dem das „Eigene Lemma“ gespielt wird — unbegrenzt, ohne Cleanup. Das
 * Tageskontingent prüft nur das HEUTIGE Datum, alles Ältere ist toter Ballast.
 * Gleiche 24-Monats-Frist wie oben. payments wird BEWUSST nicht angefasst
 * (Buchhaltung/Belegpflicht).
 *
 * Täglicher Sweep, gleiches Muster wie classroomRetention: neustart-fest
 * (rechnet gegen persistierte Zeitstempel), idempotent (Mehrfach-Läufe
 * löschen nichts doppelt). Der Delete läuft einmal täglich als Scan —
 * eigene Indizes nur dafür lohnen sich nicht.
 */

import { join, dirname } from 'path'
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs'
import db, { DB_PATH } from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { compactOldUserStats } from '../store.js'

export const DEFAULT_RETENTION_MS = 730 * 24 * 60 * 60 * 1000 // 24 Monate (730 Tage)
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'

// audit_log.timestamp ist ISO-String, classroom_telemetry.ts Unix-Millis.
const deleteOldAuditStmt = db.prepare(`DELETE FROM audit_log WHERE timestamp < ?`)
const deleteOldTelemetryStmt = db.prepare(`DELETE FROM classroom_telemetry WHERE ts < ?`)
// custom_lemma_usage.date ist ein Berlin-YYYY-MM-DD-String → lexikografischer
// Vergleich gegen das Cutoff-Datum (gleiches Format, gleiche Zeitzone).
const deleteOldCustomLemmaUsageStmt = db.prepare(`DELETE FROM custom_lemma_usage WHERE date < ?`)

export const STATS_COMPACT_AFTER_DAYS = 180

// W4-U2: Legacy-CSV-Exports aus der Klassenraum-v1-Aera (Tabelle
// classroom_exports wurde in Migration 0006 gedroppt; aktueller Code schreibt
// NICHTS mehr hierher). Auf dem Hetzner-Volume koennen aber noch Alt-CSVs
// liegen. Defensiver Prune: ueberfaellige Dateien loeschen, leeres Verzeichnis
// abraeumen. Existiert das Verzeichnis nicht (Normalfall), passiert nichts.
const LEGACY_EXPORT_DIR = join(dirname(DB_PATH), 'classroom-exports')

function pruneLegacyExports(cutoffMs) {
  if (!existsSync(LEGACY_EXPORT_DIR)) return 0
  let removed = 0
  try {
    const entries = readdirSync(LEGACY_EXPORT_DIR)
    for (const name of entries) {
      const full = join(LEGACY_EXPORT_DIR, name)
      try {
        const st = statSync(full)
        if (st.isFile() && st.mtimeMs < cutoffMs) {
          unlinkSync(full)
          removed += 1
        }
      } catch (err) {
        logger.warn({ err, file: name }, 'Legacy-CSV-Prune: Datei konnte nicht geprueft/geloescht werden')
      }
    }
    // Leeres Relikt-Verzeichnis abraeumen (best effort, schlaegt fehl wenn noch Dateien drin).
    if (readdirSync(LEGACY_EXPORT_DIR).length === 0) {
      try { rmdirSync(LEGACY_EXPORT_DIR) } catch { /* nicht leer / Race — egal */ }
    }
  } catch (err) {
    logger.warn({ err }, 'Legacy-CSV-Prune fehlgeschlagen')
  }
  return removed
}

export function runDataRetention({ now = Date.now(), retentionMs = DEFAULT_RETENTION_MS } = {}) {
  const cutoffMs = now - retentionMs
  const cutoffIso = new Date(cutoffMs).toISOString()
  // Berlin-Datum des Cutoffs (YYYY-MM-DD) — passend zum Speicherformat von
  // custom_lemma_usage.date. en-CA liefert genau dieses Format.
  const cutoffDate = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(cutoffMs))

  const audit = deleteOldAuditStmt.run(cutoffIso)
  const telemetry = deleteOldTelemetryStmt.run(cutoffMs)
  const customLemmaUsage = deleteOldCustomLemmaUsageStmt.run(cutoffDate)

  // Stats-Kompaktierung (D-H1): per-User-Zeilen aelter 180 Tage in die
  // anonyme Aggregat-Zeile falten — deckelt die groesste wachsende Tabelle,
  // Admin-Statistiken (Summen/Verteilungen) bleiben exakt.
  const statsCompacted = compactOldUserStats(STATS_COMPACT_AFTER_DAYS)

  // Legacy-CSV-Exports nach derselben 24-Monats-Frist abraeumen.
  const legacyExportsRemoved = pruneLegacyExports(cutoffMs)

  const result = {
    auditDeleted: audit.changes,
    telemetryDeleted: telemetry.changes,
    customLemmaUsageDeleted: customLemmaUsage.changes,
    statsCompacted,
    legacyExportsRemoved,
  }
  if (result.auditDeleted > 0 || result.telemetryDeleted > 0 || result.customLemmaUsageDeleted > 0 || result.statsCompacted > 0 || result.legacyExportsRemoved > 0) {
    logger.info(result, 'Retention-Sweep: alte Eintraege geloescht/kompaktiert')
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
      // Stiller Job-Tod = unbegrenzt wachsende Log-Tabellen ohne Vorwarnung —
      // darum laut alerten (30-min-Cooldown verhindert Alert-Sturm).
      reportAlert('data_retention_failed', `Daten-Retention-Sweep fehlgeschlagen: ${err?.message || err}`)
    }
  }

  run() // beim Start: holt waehrend Downtime faellig gewordene Loeschungen nach
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startDataRetention
