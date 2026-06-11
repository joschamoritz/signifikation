// Globales Vitest-Setup: isoliert die Test-Datenbank von der Dev-DB.
//
// Läuft im Hauptprozess, BEVOR Worker gestartet werden — nur so ist
// garantiert, dass APP_DB gesetzt ist, bevor irgendein Worker server/db.js
// importiert (db.js liest APP_DB beim Modul-Load und migriert sofort).
// In vitest.setup.js wäre das zu spät: ESM-Hoisting evaluiert den
// migrate-runner-Import dort vor jeder Env-Zuweisung.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default function globalSetup() {
  // Respektiere ein explizit gesetztes APP_DB (z. B. CI mit eigenem Pfad).
  if (process.env.APP_DB) return

  const dir = mkdtempSync(join(tmpdir(), 'signifikation-test-'))
  process.env.APP_DB = join(dir, 'app.db')

  // Teardown: Temp-DB inkl. -wal/-shm entfernen.
  return () => {
    rmSync(dir, { recursive: true, force: true })
  }
}
