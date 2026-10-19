import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { join, dirname, basename } from 'path'
import { mkdirSync, writeFileSync, utimesSync, existsSync, rmSync } from 'fs'
import db, { DB_PATH } from '../db.js'
import { runDataRetention, DEFAULT_RETENTION_MS, SNAPSHOT_MAX_AGE_MS, AUDIT_IP_RETENTION_MS } from '../jobs/dataRetention.js'

const NOW = Date.parse('2026-06-10T12:00:00.000Z')
const OLD_MS = NOW - DEFAULT_RETENTION_MS - 24 * 60 * 60 * 1000 // 1 Tag über der Frist
const FRESH_MS = NOW - 24 * 60 * 60 * 1000                      // gestern

const LEGACY_EXPORT_DIR = join(dirname(DB_PATH), 'classroom-exports')

const MARKER = 'retention-test'

function insertAudit(timestampMs, suffix) {
  db.prepare(`
    INSERT INTO audit_log (timestamp, action, resource, resource_id, changes_json, admin_key_last4, ip, status, error, entry_hash)
    VALUES (?, 'TEST', ?, ?, '{}', 'test', NULL, 'SUCCESS', NULL, ?)
  `).run(new Date(timestampMs).toISOString(), MARKER, `${MARKER}-${suffix}`, `${MARKER}-${suffix}-${timestampMs}`)
}

function insertTelemetry(tsMs, suffix) {
  db.prepare(`
    INSERT INTO classroom_telemetry (ts, event, session_id, teacher_id, payload_json)
    VALUES (?, ?, NULL, NULL, '{}')
  `).run(tsMs, `${MARKER}-${suffix}`)
}

function countAudit() {
  return db.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE resource = ?`).get(MARKER).c
}

function countTelemetry() {
  return db.prepare(`SELECT COUNT(*) AS c FROM classroom_telemetry WHERE event LIKE ?`).get(`${MARKER}-%`).c
}

describe('dataRetention (audit_log + classroom_telemetry)', () => {
  beforeEach(() => {
    db.prepare(`DELETE FROM audit_log WHERE resource = ?`).run(MARKER)
    db.prepare(`DELETE FROM classroom_telemetry WHERE event LIKE ?`).run(`${MARKER}-%`)
  })

  it('löscht Einträge älter als 24 Monate, behält jüngere', () => {
    insertAudit(OLD_MS, 'alt')
    insertAudit(FRESH_MS, 'frisch')
    insertTelemetry(OLD_MS, 'alt')
    insertTelemetry(FRESH_MS, 'frisch')

    const result = runDataRetention({ now: NOW })

    expect(result.auditDeleted).toBeGreaterThanOrEqual(1)
    expect(result.telemetryDeleted).toBeGreaterThanOrEqual(1)
    expect(countAudit()).toBe(1)
    expect(countTelemetry()).toBe(1)
  })

  it('ist idempotent: zweiter Lauf löscht nichts mehr', () => {
    insertAudit(OLD_MS, 'alt')
    insertTelemetry(OLD_MS, 'alt')

    runDataRetention({ now: NOW })
    const second = runDataRetention({ now: NOW })

    expect(second.auditDeleted).toBe(0)
    expect(second.telemetryDeleted).toBe(0)
  })

  it('respektiert ein abweichendes retentionMs', () => {
    insertAudit(FRESH_MS, 'frisch')
    insertTelemetry(FRESH_MS, 'frisch')

    // Frist 1 h → auch die frischen Einträge (gestern) fallen weg
    runDataRetention({ now: NOW, retentionMs: 60 * 60 * 1000 })

    expect(countAudit()).toBe(0)
    expect(countTelemetry()).toBe(0)
  })
})

describe('dataRetention (Legacy-CSV-Prune, W4-U2)', () => {
  afterEach(() => {
    if (existsSync(LEGACY_EXPORT_DIR)) rmSync(LEGACY_EXPORT_DIR, { recursive: true, force: true })
  })

  it('loescht ueberfaellige CSVs, behaelt frische', () => {
    mkdirSync(LEGACY_EXPORT_DIR, { recursive: true })
    const oldFile = join(LEGACY_EXPORT_DIR, 'session-alt.csv')
    const freshFile = join(LEGACY_EXPORT_DIR, 'session-frisch.csv')
    writeFileSync(oldFile, 'a;b;c\n')
    writeFileSync(freshFile, 'a;b;c\n')
    // mtime setzen (utimes erwartet Sekunden)
    utimesSync(oldFile, OLD_MS / 1000, OLD_MS / 1000)
    utimesSync(freshFile, FRESH_MS / 1000, FRESH_MS / 1000)

    const result = runDataRetention({ now: NOW })

    expect(result.legacyExportsRemoved).toBe(1)
    expect(existsSync(oldFile)).toBe(false)
    expect(existsSync(freshFile)).toBe(true)
  })

  it('raeumt ein vollstaendig geleertes Relikt-Verzeichnis ab', () => {
    mkdirSync(LEGACY_EXPORT_DIR, { recursive: true })
    const oldFile = join(LEGACY_EXPORT_DIR, 'nur-alt.csv')
    writeFileSync(oldFile, 'x\n')
    utimesSync(oldFile, OLD_MS / 1000, OLD_MS / 1000)

    runDataRetention({ now: NOW })

    // letzte Datei geloescht → leeres Verzeichnis wird mit abgeraeumt
    expect(existsSync(LEGACY_EXPORT_DIR)).toBe(false)
  })

  it('tut nichts, wenn das Verzeichnis fehlt (Normalfall)', () => {
    expect(existsSync(LEGACY_EXPORT_DIR)).toBe(false)
    const result = runDataRetention({ now: NOW })
    expect(result.legacyExportsRemoved).toBe(0)
  })
})

describe('dataRetention (Pre-Deploy-Snapshots)', () => {
  const dir = dirname(DB_PATH)
  const name = (stamp) => join(dir, `${basename(DB_PATH)}.pre-deploy-${stamp}`)
  const angelegt = []

  afterEach(() => {
    for (const f of angelegt) if (existsSync(f)) rmSync(f)
    angelegt.length = 0
  })

  it('loescht Snapshots aelter als die Sicherungsfrist, behaelt frische', () => {
    const alt = name('20260501-120000')
    const frisch = name('20260609-120000')
    for (const f of [alt, frisch]) { writeFileSync(f, 'x'); angelegt.push(f) }
    const altMs = NOW - SNAPSHOT_MAX_AGE_MS - 24 * 60 * 60 * 1000
    utimesSync(alt, altMs / 1000, altMs / 1000)
    utimesSync(frisch, FRESH_MS / 1000, FRESH_MS / 1000)

    const result = runDataRetention({ now: NOW })

    expect(result.deploySnapshotsRemoved).toBe(1)
    expect(existsSync(alt)).toBe(false)
    expect(existsSync(frisch)).toBe(true)
  })

  it('laesst andere Dateien im Datenverzeichnis in Ruhe', () => {
    const fremd = join(dir, 'retention-test-fremd.db')
    writeFileSync(fremd, 'x'); angelegt.push(fremd)
    const altMs = NOW - SNAPSHOT_MAX_AGE_MS - 24 * 60 * 60 * 1000
    utimesSync(fremd, altMs / 1000, altMs / 1000)

    runDataRetention({ now: NOW })

    expect(existsSync(fremd)).toBe(true)
  })
})

describe('dataRetention (IP im Audit-Log)', () => {
  const ipVon = (id) => db.prepare(`SELECT ip FROM audit_log WHERE resource_id = ?`).get(id)?.ip
  afterEach(() => { db.prepare(`DELETE FROM audit_log WHERE resource = ?`).run(`${MARKER}-ip`) })

  function mitIp(timestampMs, id) {
    db.prepare(`
      INSERT INTO audit_log (timestamp, action, resource, resource_id, changes_json, admin_key_last4, ip, status, error, entry_hash)
      VALUES (?, 'TEST', ?, ?, '{}', 'test', '203.0.113.7', 'SUCCESS', NULL, ?)
    `).run(new Date(timestampMs).toISOString(), `${MARKER}-ip`, id, `${id}-${timestampMs}`)
  }

  it('leert die IP nach 30 Tagen, der Eintrag bleibt', () => {
    mitIp(NOW - AUDIT_IP_RETENTION_MS - 24 * 60 * 60 * 1000, 'ip-alt')
    mitIp(NOW - 24 * 60 * 60 * 1000, 'ip-frisch')

    runDataRetention({ now: NOW })

    expect(ipVon('ip-alt')).toBe(null)
    expect(ipVon('ip-frisch')).toBe('203.0.113.7')
  })
})
