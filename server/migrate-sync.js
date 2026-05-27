/**
 * migrate-sync.js – Synchroner SQL-only Migrations-Runner
 *
 * Wird von db.js am Modul-Load direkt aufgerufen, damit alle Schema-
 * Migrationen anliegen, bevor andere Module ihre Prepared Statements
 * auf Modul-Ebene registrieren (z.B. server/classroom-v2/store.js).
 *
 * Bewusst keine JS-Migrationen (die brauchen async import()). Der
 * async migrate-runner.js läuft danach im Server-IIFE und kümmert sich
 * um JS-Migrationen; bereits angewandte SQL-Migrationen überspringt er.
 *
 * Nimmt `db` als Parameter — kein Import aus db.js, sonst Zirkel.
 */

import { readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, 'migrations')

export function runSqlMigrationsSync(db) {
  // Tracking-Tabelle (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  INTEGER NOT NULL
    )
  `)
  // Baseline-Marker (gleicher Eintrag wie in migrate-runner.js)
  db.prepare(
    `INSERT OR IGNORE INTO _schema_migrations (name, applied_at) VALUES (?, ?)`
  ).run('0000_baseline', Date.now())

  const isApplied = db.prepare(
    `SELECT 1 FROM _schema_migrations WHERE name = ?`
  )
  const markApplied = db.prepare(
    `INSERT INTO _schema_migrations (name, applied_at) VALUES (?, ?)`
  )

  let entries
  try {
    entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return { applied: [], skipped: 0 }
    throw err
  }

  // Nur SQL-Migrationen — JS bleiben dem async runner überlassen
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /^\d{4}_.*\.sql$/i.test(name))
    .sort()

  const applied = []
  let skipped = 0
  for (const f of files) {
    const name = f.replace(/\.sql$/i, '')
    if (isApplied.get(name)) {
      skipped += 1
      continue
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    const tx = db.transaction(() => {
      db.exec(sql)
      markApplied.run(name, Date.now())
    })
    tx()
    applied.push(f)
  }
  return { applied, skipped }
}

export default runSqlMigrationsSync
