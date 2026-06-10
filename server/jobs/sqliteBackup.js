/**
 * server/jobs/sqliteBackup.js
 *
 * Tägliches dateibasiertes Backup der App-Datenbank (signifikation.db).
 *
 * Hintergrund (Review-Finding 2026-06-10): Das alte Gist-Backup sicherte nur
 * Spieldaten — user, account (Passwort-Hashes), payments, user_entitlements
 * und alle classroom_*-Tabellen waren ungesichert. Dieses Backup sichert die
 * KOMPLETTE Datei und ist damit die einzige Absicherung gegen Totalverlust.
 *
 * Technik:
 *   - better-sqlite3 Online-Backup-API (`db.backup()`): liest über die offene
 *     Verbindung und ist damit trotz WAL-Mode konsistent, ohne Writer zu
 *     blockieren. Ein simples `cp` der .db-Datei wäre bei WAL INKONSISTENT.
 *   - Danach gzip (SQLite-Dateien komprimieren typisch auf ~20–30 %).
 *   - Rotation: die letzten SQLITE_BACKUP_KEEP Stände bleiben liegen,
 *     gleicher Tag wird überschrieben (idempotent bei Deploy-Neustarts).
 *
 * belege.db / wortprofil.db sind bewusst NICHT enthalten: groß und aus der
 * Korpus-Pipeline reproduzierbar — signifikation.db ist es nicht.
 *
 * Grenze: Die Backups liegen per Default auf demselben Volume wie die DB
 * (schützt gegen App-Fehler/versehentliches Löschen, nicht gegen
 * Volume-Verlust). Für Offsite: SQLITE_BACKUP_DIR auf einen anderen Mount
 * zeigen lassen oder das Verzeichnis extern wegsynchronisieren.
 */

import { mkdirSync, createReadStream, createWriteStream, readdirSync, statSync, unlinkSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { join, dirname } from 'node:path'
import db, { DB_PATH } from '../db.js'
import logger from '../logger.js'

const BACKUP_DIR  = process.env.SQLITE_BACKUP_DIR || join(dirname(DB_PATH), 'backups')
const KEEP_COUNT  = Math.max(1, parseInt(process.env.SQLITE_BACKUP_KEEP ?? '14', 10) || 14)
const FILE_PATTERN = /^signifikation-\d{4}-\d{2}-\d{2}\.db\.gz$/

// Einmal pro Tag — Spieldaten ändern sich täglich, Käufe/Accounts selten genug,
// dass 24 h maximaler Datenverlust akzeptabel ist.
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000

let running = false

export async function runSqliteBackup({ dir = BACKUP_DIR, keep = KEEP_COUNT } = {}) {
  if (running) return { skipped: true }
  running = true
  try {
    mkdirSync(dir, { recursive: true })

    const stamp     = new Date().toISOString().slice(0, 10)
    const tmpPath   = join(dir, `signifikation-${stamp}.db.tmp`)
    const finalPath = join(dir, `signifikation-${stamp}.db.gz`)

    const started = Date.now()
    await db.backup(tmpPath)
    await pipeline(createReadStream(tmpPath), createGzip(), createWriteStream(finalPath))
    unlinkSync(tmpPath)

    // Rotation: nur eigene Backup-Dateien anfassen, älteste zuerst löschen
    const files = readdirSync(dir).filter(f => FILE_PATTERN.test(f)).sort()
    const toDelete = files.slice(0, Math.max(0, files.length - keep))
    for (const f of toDelete) {
      try { unlinkSync(join(dir, f)) } catch { /* Rotation darf das Backup nie scheitern lassen */ }
    }

    const sizeBytes = statSync(finalPath).size
    const result = { file: finalPath, sizeBytes, durationMs: Date.now() - started, deleted: toDelete.length }
    logger.info(result, 'SQLite-Backup erstellt')
    return result
  } finally {
    running = false
  }
}

export function listSqliteBackups({ dir = BACKUP_DIR } = {}) {
  let files = []
  try {
    files = readdirSync(dir).filter(f => FILE_PATTERN.test(f)).sort().reverse()
  } catch {
    return [] // Verzeichnis existiert noch nicht — noch kein Backup gelaufen
  }
  return files.map(f => {
    const { size, mtimeMs } = statSync(join(dir, f))
    return { file: f, sizeBytes: size, modifiedAt: new Date(mtimeMs).toISOString() }
  })
}

export function startSqliteBackup(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS

  const run = () => {
    runSqliteBackup(options).catch(err => {
      logger.error({ err }, 'SQLite-Backup fehlgeschlagen')
    })
  }

  run() // direkt beim Start: deckt auch Server, die selten 24 h durchlaufen
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startSqliteBackup
