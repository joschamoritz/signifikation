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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { berlinTag, plusTage } from '../server/date-utils.js'

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
  // Ein normales Konto (Rolle Basis) fuer admin-users-bulk.spec.js: Admin-Konten haben in der
  // Nutzerliste kein Auswahlkaestchen, mit dem Admin allein liesse sich die Auswahl nicht pruefen.
  const jetzt = new Date().toISOString()
  db.prepare(`
    INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
    VALUES ('e2e-probe-konto', 'E2E Probe', 'e2e-probe@example.test', 1, NULL, ?, ?)
  `).run(jetzt, jetzt)
  // Ein zweites Konto, das nur admin-bestaetigung.spec.js wirklich loescht (Konto loeschen ueber die Rueckfrage);
  // das erste muss fuer die anderen Specs stehen bleiben.
  db.prepare(`
    INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
    VALUES ('e2e-loesch-konto', 'E2E Loeschen', 'e2e-loesch@example.test', 1, NULL, ?, ?)
  `).run(jetzt, jetzt)
  // Spieldaten der letzten 20 Tage (Berliner Tage) für die Auswertung: je Tag vier Modi, ein Teil mit Konto
  {
    const einfuegen = db.prepare(`
      INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(datum, spiel, user_id) DO UPDATE SET plays = excluded.plays, scoreSum = excluded.scoreSum, maxSum = excluded.maxSum, dist = excluded.dist
    `)
    // Kalendertage rückwärts (plusTage), nicht "jetzt minus n x 24 h": An Tagen der Zeitumstellung hat der Tag 23/25 Stunden
    const heute = berlinTag()
    for (let tag = 0; tag < 20; tag += 1) {
      const datum = plusTage(heute, -tag)
      for (const [i, spiel] of ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller'].entries()) {
        const spiele = 3 + ((tag * 7 + i * 3) % 9)
        const dist = Array(11).fill(0)
        dist[4 + i] = spiele - 1
        dist[9] = 1
        einfuegen.run(datum, spiel, '', spiele, spiele * (5 + i), spiele * 10, JSON.stringify(dist))
      }
      einfuegen.run(datum, 'kollokationen', 'e2e-probe-konto', 1, 8, 10, JSON.stringify([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]))
    }
  }
  db.close()
}

// pathToFileURL wegen Windows: import('D:\\...') schlaegt fehl, file://-URL noetig.
await import(pathToFileURL(join(root, 'server/index.js')).href)
