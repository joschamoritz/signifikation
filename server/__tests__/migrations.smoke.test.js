// Migrations-Smoke (Review 2026-06-11, WP 1.8 / T-M1):
// Eine voellig frische DB muss durch Baseline (db.js) + alle nummerierten
// Migrationen booten, das erwartete Schema liefern und beim zweiten Lauf
// alles ueberspringen (Idempotenz). Faengt ausserdem den Fall, dass eine
// Migration nicht-synchron ist (Marker-Atomaritaet, migrate-runner.js).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'signifikation-migration-smoke-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Migrations-Smoke: frische DB', () => {
  it('bootstrappt eine leere DB vollstaendig und idempotent', async () => {
    vi.stubEnv('APP_DB', join(dir, 'fresh.db'))
    vi.resetModules()

    // db.js-Import fuehrt Baseline + Inline-Migrationen + SQL-Sync aus
    const { default: freshDb } = await import('../db.js')
    const { runMigrations } = await import('../migrate-runner.js')

    const first = await runMigrations()
    // Frische DB: je nach Bootpfad wendet bereits db.js (runSqlMigrationsSync)
    // die SQL-Migrationen an — entscheidend ist, dass danach ALLE als
    // angewendet getrackt sind.
    const tracked = freshDb
      .prepare('SELECT name FROM _schema_migrations ORDER BY name')
      .all()
      .map((r) => r.name)
    expect(tracked).toContain('0000_baseline')
    expect(tracked).toContain('0004_remove_classroom_v2_flag')
    expect(tracked).toContain('0012_drop_redundant_stats_indices')
    expect(tracked.length).toBeGreaterThanOrEqual(13)

    // Zweiter Lauf: nichts mehr anzuwenden
    const second = await runMigrations()
    expect(second.applied).toEqual([])
    expect(second.skipped).toBeGreaterThanOrEqual(12)
    expect(first.applied.length + first.skipped).toBe(second.skipped)

    // Schluessel-Tabellen existieren
    const tables = new Set(
      freshDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name)
    )
    for (const t of [
      'user', 'session', 'account', 'verification',
      'user_entitlements', 'user_profiles', 'payments',
      'lemmata', 'kalender', 'wortzwilling', 'zeitenwende', 'spezialwochen',
      'stats', 'audit_log', 'push_subscriptions', 'custom_lemma_usage',
      'classroom_session', 'classroom_participant', 'classroom_assignment',
      'classroom_submission', 'classroom_capability_grant', 'classroom_telemetry',
      '_schema_migrations',
    ]) {
      expect(tables, `Tabelle ${t} fehlt`).toContain(t)
    }

    // Wichtige Indizes der Migrationen vorhanden (Stichprobe)
    const indices = new Set(
      freshDb
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((r) => r.name)
    )
    expect([...indices].some((i) => i.includes('classroom'))).toBe(true)

    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
