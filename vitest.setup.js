// Globale Test-Umgebung
// Aktiviert die Dev-Header-Auth (x-dev-user-id), die im Produktionscode
// zusätzlich zu NODE_ENV !== 'production' jetzt ALLOW_DEV_AUTH=1 verlangt.
process.env.ALLOW_DEV_AUTH = '1'

// Migrationen in der Test-DB anwenden (idempotent).
// Notwendig in CI, wo die DB jedes Mal frisch ist: store.js registriert
// Prepared Statements auf Modulebene, die sofort beim Import laufen —
// die cr2_*-Tabellen müssen also vor dem ersten Test-File-Import existieren.
// Lokal ist die Migration bereits angewendet, der zweite Lauf überspringt sie.
import { runMigrations } from './server/migrate-runner.js'
await runMigrations()
