import { beforeEach, describe, expect, it } from 'vitest'
import db from '../db.js'
import { runDataRetention, DEFAULT_RETENTION_MS } from '../jobs/dataRetention.js'

const NOW = Date.parse('2026-06-10T12:00:00.000Z')
const OLD_MS = NOW - DEFAULT_RETENTION_MS - 24 * 60 * 60 * 1000 // 1 Tag über der Frist
const FRESH_MS = NOW - 24 * 60 * 60 * 1000                      // gestern

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
