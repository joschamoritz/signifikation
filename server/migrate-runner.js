/**
 * migrate-runner.js – Schema-Migrations-Runner für signifikation.db
 *
 * Liest server/migrations/NNNN_*.sql|.js, vergleicht mit Tabelle
 * _schema_migrations, führt fehlende Migrationen in numerischer Reihenfolge
 * aus. Jede Migration läuft in einer eigenen db.transaction(), damit
 * Teil-Anwendungen sauber zurückgerollt werden.
 *
 * Wird einmal beim Server-Start nach den Baseline-hasColumn-Migrationen in
 * db.js aufgerufen.
 */

import { readdirSync, readFileSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import db from './db.js'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

// Tracking-Tabelle anlegen (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS _schema_migrations (
    name        TEXT PRIMARY KEY,
    applied_at  INTEGER NOT NULL
  )
`)

// Baseline-Marker: alles vor 0001 wird in db.js durch hasColumn-Checks
// abgedeckt. Wir tragen einen Dummy-Eintrag ein, damit der Runner danach
// nur noch nummerierte Migrationen anpackt.
db.prepare(
  `INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)`
).run('0000_baseline', Date.now())

const isApplied = db.prepare(
  `SELECT 1 FROM _schema_migrations WHERE name = ?`
)
const markApplied = db.prepare(
  `INSERT INTO _schema_migrations (name, applied_at) VALUES (?, ?)`
)

function listMigrationFiles() {
  let entries
  try {
    entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /^\d{4}_.*\.(sql|js)$/i.test(name))
    .sort() // lexikographisch == numerisch dank Zero-Padding
}

async function runOne(filename) {
  const filePath = join(MIGRATIONS_DIR, filename)
  const ext = extname(filename).toLowerCase()
  const name = filename.replace(/\.(sql|js)$/i, '')

  if (isApplied.get(name)) {
    logger.debug({ name }, 'Migration bereits angewendet, übersprungen')
    return false
  }

  logger.info({ name }, 'Migration wird angewendet')
  const start = Date.now()

  try {
    if (ext === '.sql') {
      const sql = readFileSync(filePath, 'utf8')
      const run = db.transaction(() => {
        db.exec(sql)
        markApplied.run(name, Date.now())
      })
      run()
    } else if (ext === '.js') {
      const mod = await import(pathToFileURL(filePath).href)
      if (typeof mod.default !== 'function') {
        throw new Error(`Migration ${name}: kein default-export function(db)`)
      }
      // Contract: JS-Migrationen sind SYNCHRON (better-sqlite3-Transaktionen
      // koennen kein await). Migration + Marker laufen in EINER Transaktion —
      // ein Crash dazwischen kann die Migration sonst beim naechsten Boot
      // erneut ausfuehren (frueherer Kommentar behauptete Atomaritaet, der
      // Code hatte sie nicht).
      const run = db.transaction(() => {
        const result = mod.default(db)
        if (result && typeof result.then === 'function') {
          throw new Error(
            `Migration ${name}: default-export muss synchron sein ` +
            '(db.transaction kann kein Promise abwarten)'
          )
        }
        markApplied.run(name, Date.now())
      })
      run()
    } else {
      throw new Error(`Migration ${name}: unbekannte Extension ${ext}`)
    }
    logger.info({ name, durationMs: Date.now() - start }, 'Migration erfolgreich')
    return true
  } catch (err) {
    logger.error({ err, name }, 'Migration fehlgeschlagen – Abbruch')
    throw err
  }
}

export async function runMigrations() {
  const files = listMigrationFiles()
  if (files.length === 0) {
    logger.debug('Keine Migrations-Dateien gefunden')
    return { applied: [], skipped: 0 }
  }
  const applied = []
  let skipped = 0
  for (const f of files) {
    const wasApplied = await runOne(f)
    if (wasApplied) applied.push(f)
    else skipped += 1
  }
  if (applied.length > 0) {
    logger.info({ count: applied.length, files: applied }, 'Migrationen angewendet')
  }
  return { applied, skipped }
}

export default runMigrations
