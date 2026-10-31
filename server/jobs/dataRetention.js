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
 * Gleiche 24-Monats-Frist wie oben.
 *
 * payments (2026-10-19): Buchungsbelege, 8 Jahre ab Ende des Kalenderjahres
 * (§ 147 Abs. 3 und 4 AO seit 2025). Geloescht werden nur Zeilen ohne Konto
 * (user_id NULL nach Kontoloeschung, Migration 0020). Solange das Konto besteht,
 * ist die Zeile Lizenznachweis und Sperre gegen Cross-Account-Replay (iap.js).
 *
 * Täglicher Sweep, gleiches Muster wie classroomRetention: neustart-fest
 * (rechnet gegen persistierte Zeitstempel), idempotent (Mehrfach-Läufe
 * löschen nichts doppelt). Der Delete läuft einmal täglich als Scan —
 * eigene Indizes nur dafür lohnen sich nicht.
 */

import { join, dirname, basename } from 'path'
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs'
import db, { DB_PATH } from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { compactOldUserStats } from '../store.js'
import { STATS_KONTO_ZEILEN_TAGE } from '../store-stats.js'
import { loescheAlteZusatzSicherungen } from './sqliteBackup.js'

export const DEFAULT_RETENTION_MS = 730 * 24 * 60 * 60 * 1000 // 24 Monate (730 Tage)
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'

// audit_log.timestamp ist ISO-String, classroom_telemetry.ts Unix-Millis.
const deleteOldAuditStmt = db.prepare(`DELETE FROM audit_log WHERE timestamp < ?`)
// IP-Adressen im Audit-Log nur 30 Tage (Erkennen von Angriffen braucht sie kurz,
// die Ereignisse selbst bleiben 24 Monate). entry_hash dient nur der Dublettenpruefung
// beim Legacy-Import und muss dafuer nicht nachgezogen werden.
export const AUDIT_IP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export const PAYMENT_RETENTION_YEARS = 8
// Nur bezahlte Zeilen gelöschter Konten: Sperreinträge ('gesperrt') und erstattete Käufe bleiben, sonst ließe
// sich ein alter Beleg nach der Frist wieder einlösen (Security-Audit run-2). Sie tragen kein Konto.
const deleteOldOrphanPaymentsStmt = db.prepare(`DELETE FROM payments WHERE user_id IS NULL AND status = 'paid' AND processed_at < ?`)

// Erster Moment des Jahres (aktuelles Berliner Jahr - 8) als Unix-Millis. Alles davor
// gehoert zu einem Kalenderjahr, dessen Frist abgelaufen ist (Beleg 2025 → bis 31.12.2033).
// Berliner Mitternacht am 1.1. ist 23:00 UTC des Vortags (Winterzeit).
export function paymentCutoffMs(now) {
  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric' }).format(new Date(now)))
  return Date.UTC(year - PAYMENT_RETENTION_YEARS, 0, 1) - 60 * 60 * 1000
}
const clearOldAuditIpStmt = db.prepare(`UPDATE audit_log SET ip = NULL WHERE ip IS NOT NULL AND timestamp < ?`)
const deleteOldTelemetryStmt = db.prepare(`DELETE FROM classroom_telemetry WHERE ts < ?`)
// custom_lemma_usage.date ist ein Berlin-YYYY-MM-DD-String → lexikografischer
// Vergleich gegen das Cutoff-Datum (gleiches Format, gleiche Zeitzone).
const deleteOldCustomLemmaUsageStmt = db.prepare(`DELETE FROM custom_lemma_usage WHERE date < ?`)

const STATS_COMPACT_AFTER_DAYS = STATS_KONTO_ZEILEN_TAGE

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

// Pre-Deploy-Snapshots (deploy.yml legt `<DB>.pre-deploy-<Zeit>` an und haelt
// die letzten drei). Ohne Deploy blieben sie beliebig alt liegen – mit
// geloeschten Konten darin. Deshalb zusaetzlich nach Alter: nicht aelter als die
// naechtlichen Sicherungen (SQLITE_BACKUP_KEEP Tage, Default 7). Der Rollback
// braucht nur den Snapshot des laufenden Deploys, und der ist immer frisch.
const SNAPSHOT_PREFIX = `${basename(DB_PATH)}.pre-deploy-`
export const SNAPSHOT_MAX_AGE_MS =
  Math.max(1, parseInt(process.env.SQLITE_BACKUP_KEEP ?? '7', 10) || 7) * 24 * 60 * 60 * 1000

function pruneDeploySnapshots(now, maxAgeMs = SNAPSHOT_MAX_AGE_MS) {
  const dir = dirname(DB_PATH)
  let removed = 0
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(SNAPSHOT_PREFIX)) continue
      const full = join(dir, name)
      try {
        const st = statSync(full)
        if (st.isFile() && st.mtimeMs < now - maxAgeMs) {
          unlinkSync(full)
          removed += 1
        }
      } catch (err) {
        logger.warn({ err, file: name }, 'Snapshot-Prune: Datei konnte nicht geprueft/geloescht werden')
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Snapshot-Prune fehlgeschlagen')
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
  const auditIps = clearOldAuditIpStmt.run(new Date(now - AUDIT_IP_RETENTION_MS).toISOString())
  const payments = deleteOldOrphanPaymentsStmt.run(paymentCutoffMs(now))
  const telemetry = deleteOldTelemetryStmt.run(cutoffMs)
  const customLemmaUsage = deleteOldCustomLemmaUsageStmt.run(cutoffDate)

  // Stats-Kompaktierung (D-H1): per-User-Zeilen aelter 180 Tage in die
  // anonyme Aggregat-Zeile falten — deckelt die groesste wachsende Tabelle,
  // Admin-Statistiken (Summen/Verteilungen) bleiben exakt.
  const statsCompacted = compactOldUserStats(STATS_COMPACT_AFTER_DAYS)

  // Legacy-CSV-Exports nach derselben 24-Monats-Frist abraeumen.
  const legacyExportsRemoved = pruneLegacyExports(cutoffMs)

  // Pre-Deploy-Snapshots nach eigener, kuerzerer Frist (siehe oben).
  const deploySnapshotsRemoved = pruneDeploySnapshots(now)

  // Handsicherungen und Kopien vor dem Wiederherstellen: dieselbe Frist.
  const zusatzSicherungenRemoved = loescheAlteZusatzSicherungen({ now })

  const result = {
    auditDeleted: audit.changes,
    auditIpsCleared: auditIps.changes,
    paymentsDeleted: payments.changes,
    telemetryDeleted: telemetry.changes,
    customLemmaUsageDeleted: customLemmaUsage.changes,
    statsCompacted,
    legacyExportsRemoved,
    deploySnapshotsRemoved,
    zusatzSicherungenRemoved,
  }
  if (Object.values(result).some((n) => n > 0)) {
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
