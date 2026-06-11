// Startet den Express-Server fuer Playwright mit isolierter, frisch
// geseedeter Datenbank (WP 3.1, Review 2026-06-11 T-H2):
// Vorher erwartete die E2E-Suite einen manuell angelegten Admin-Account
// und vorhandene Tagesdaten — auf frischem Checkout schlug der Login fehl.
//
// Ablauf: Temp-DB → Migrationen+Admin (setup-admin.js) → Tagesinhalte
// (seed-dev.js) → ein Audit-Eintrag (deterministischer Filter-Test) →
// Server-Start. Wird von playwright.config.js als webServer.command genutzt.
import { execFileSync } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const dbDir = process.env.PLAYWRIGHT_DB_DIR || join(tmpdir(), 'signifikation-e2e')
rmSync(dbDir, { recursive: true, force: true })
mkdirSync(dbDir, { recursive: true })
process.env.APP_DB = join(dbDir, 'e2e.db')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@signifikation.de'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dev-only'

const childEnv = { ...process.env }

// Migrationen laufen als Import-Seiteneffekt von db.js in beiden Skripten.
execFileSync(process.execPath, [join(root, 'server/setup-admin.js'), ADMIN_EMAIL, ADMIN_PASSWORD], {
  env: childEnv,
  stdio: 'inherit',
})
execFileSync(process.execPath, [join(root, 'server/seed-dev.js')], {
  env: childEnv,
  stdio: 'inherit',
})

// Ein deterministischer CREATE-Audit-Eintrag fuer admin-audit-filter.spec.js
// (Seeding via store schreibt keine Audit-Zeilen).
{
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(process.env.APP_DB)
  db.prepare(`
    INSERT INTO audit_log (timestamp, action, resource, resource_id, changes_json, admin_key_last4, ip, status, error, entry_hash)
    VALUES (?, 'CREATE', 'kalender', 'e2e-seed', '{}', 'e2e ', '127.0.0.1', 'OK', NULL, 'e2e-seed')
  `).run(new Date().toISOString())
  db.close()
}

await import(join(root, 'server/index.js'))
