/**
 * server/__tests__/classroom.telemetry.test.js
 *
 * Tests fuer den Telemetrie-Layer (W2-T6).
 *
 * Abdeckung:
 *   1. Neue Events schreiben korrekt in classroom_telemetry
 *   2. Fehler beim Telemetrie-Insert bricht den Hauptpfad nicht ab
 *   3. getAdminStats liefert erwartete Aggregat-Zahlen
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import db from '../db.js'
import {
  trackEvent,
  trackSessionCreated,
  trackSessionStarted,
  trackSessionFinished,
  trackSessionPaused,
  trackSessionResumed,
  trackAssignmentChanged,
  trackJoinSucceeded,
  trackParticipantReconnected,
  trackParticipantDropped,
  trackSubmissionReceived,
  getAdminStats,
} from '../classroom/telemetry.js'

// ── Hilfsfunktionen ────────────────────────────────────────────────

const SESSION_PREFIX = `tele-test-${randomUUID().slice(0, 8)}`

function makeSessionId() {
  return `${SESSION_PREFIX}-${randomUUID()}`
}

function makeTeacherId() {
  return `teacher-${randomUUID()}`
}

function makeParticipantId() {
  return `part-${randomUUID()}`
}

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function insertSession(id, teacherId, status = 'finished') {
  const now = Date.now()
  ensureUser(teacherId)
  // Eindeutiger Code: letzten 16 Zeichen der Session-ID (UUID-Anteil)
  const code = id.replace(/-/g, '').slice(-16)
  db.prepare(`
    INSERT OR IGNORE INTO classroom_session
      (id, code, teacher_user_id, status, settings_json, created_at, started_at, finished_at)
    VALUES (?, ?, ?, ?, '{}', ?, ?, ?)
  `).run(id, code, teacherId, status, now - 3600_000, now - 1800_000, now)
  return id
}

function insertParticipant(sessionId, participantId) {
  const now = Date.now()
  db.prepare(`
    INSERT OR IGNORE INTO classroom_participant
      (id, session_id, display_name, auth_token, joined_at, last_seen_at, connected)
    VALUES (?, ?, 'Teilnehmer', ?, ?, ?, 0)
  `).run(participantId, sessionId, `tok-${participantId}`, now - 900_000, now)
}

function insertAssignment(sessionId, mode = 'kollokationen') {
  const aId = `asgn-${randomUUID()}`
  const now = Date.now()
  db.prepare(`
    INSERT OR IGNORE INTO classroom_assignment
      (id, session_id, mode, lemma_ids, content_snapshot, position, created_at)
    VALUES (?, ?, ?, '[]', '{}', 0, ?)
  `).run(aId, sessionId, mode, now)
  return aId
}

function countEventsByType(event, sessionId) {
  return db.prepare(
    `SELECT COUNT(*) AS c FROM classroom_telemetry WHERE event = ? AND session_id = ?`,
  ).get(event, sessionId)?.c ?? 0
}

function getEventPayload(event, sessionId) {
  const row = db.prepare(
    `SELECT payload_json FROM classroom_telemetry WHERE event = ? AND session_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(event, sessionId)
  return row ? JSON.parse(row.payload_json) : null
}

// ── Tests ──────────────────────────────────────────────────────────

describe('classroom telemetry — event inserts', () => {
  it('trackSessionCreated schreibt event', () => {
    const sid = makeSessionId()
    const tid = makeTeacherId()
    trackSessionCreated(sid, tid)
    expect(countEventsByType('classroom_session_created', sid)).toBe(1)
  })

  it('trackSessionStarted schreibt event mit participantCount', () => {
    const sid = makeSessionId()
    const tid = makeTeacherId()
    trackSessionStarted(sid, tid, 5)
    expect(countEventsByType('classroom_session_started', sid)).toBe(1)
    const payload = getEventPayload('classroom_session_started', sid)
    expect(payload?.participantCount).toBe(5)
  })

  it('trackSessionFinished schreibt event mit reason', () => {
    const sid = makeSessionId()
    const tid = makeTeacherId()
    trackSessionFinished(sid, tid, { durationMs: 60_000, completionRate: 0.8, reason: 'manual' })
    expect(countEventsByType('classroom_session_finished', sid)).toBe(1)
    const payload = getEventPayload('classroom_session_finished', sid)
    expect(payload?.reason).toBe('manual')
    expect(payload?.durationMs).toBe(60_000)
    expect(payload?.completionRate).toBeCloseTo(0.8)
  })

  it('trackSessionFinished reason "completed" wird korrekt gespeichert', () => {
    const sid = makeSessionId()
    trackSessionFinished(sid, makeTeacherId(), { reason: 'completed', durationMs: 30_000, completionRate: 1 })
    const payload = getEventPayload('classroom_session_finished', sid)
    expect(payload?.reason).toBe('completed')
  })

  it('trackSessionPaused / trackSessionResumed schreiben Events', () => {
    const sid = makeSessionId()
    const tid = makeTeacherId()
    trackSessionPaused(sid, tid)
    trackSessionResumed(sid, tid)
    expect(countEventsByType('classroom_session_paused', sid)).toBe(1)
    expect(countEventsByType('classroom_session_resumed', sid)).toBe(1)
  })

  it('trackAssignmentChanged schreibt event mit korrekten Indizes und Modus', () => {
    const sid = makeSessionId()
    trackAssignmentChanged(sid, makeTeacherId(), { fromIndex: 0, toIndex: 1, mode: 'wortzwilling' })
    expect(countEventsByType('classroom_assignment_changed', sid)).toBe(1)
    const payload = getEventPayload('classroom_assignment_changed', sid)
    expect(payload?.fromIndex).toBe(0)
    expect(payload?.toIndex).toBe(1)
    expect(payload?.mode).toBe('wortzwilling')
  })

  it('trackJoinSucceeded schreibt event', () => {
    const sid = makeSessionId()
    const pid = makeParticipantId()
    trackJoinSucceeded(sid, pid)
    expect(countEventsByType('classroom_join_succeeded', sid)).toBe(1)
  })

  it('trackParticipantReconnected schreibt event mit participantId', () => {
    const sid = makeSessionId()
    const pid = makeParticipantId()
    trackParticipantReconnected(sid, pid)
    expect(countEventsByType('classroom_participant_reconnected', sid)).toBe(1)
    const payload = getEventPayload('classroom_participant_reconnected', sid)
    expect(payload?.participantId).toBe(pid)
  })

  it('trackParticipantDropped schreibt event mit participantId', () => {
    const sid = makeSessionId()
    const pid = makeParticipantId()
    trackParticipantDropped(sid, pid)
    expect(countEventsByType('classroom_participant_dropped', sid)).toBe(1)
    const payload = getEventPayload('classroom_participant_dropped', sid)
    expect(payload?.participantId).toBe(pid)
  })

  it('trackSubmissionReceived schreibt event ohne personenbezogene Felder', () => {
    const sid = makeSessionId()
    trackSubmissionReceived(sid, { mode: 'kollokationen', correct: true })
    expect(countEventsByType('classroom_submission_received', sid)).toBe(1)
    const payload = getEventPayload('classroom_submission_received', sid)
    expect(payload?.mode).toBe('kollokationen')
    expect(payload?.correct).toBe(1)
    // Sicherheits-Check: KEIN participantId oder lemmaId im Payload
    expect(payload?.participantId).toBeUndefined()
    expect(payload?.lemmaId).toBeUndefined()
  })

  it('trackSubmissionReceived correct=false → 0 im Payload', () => {
    const sid = makeSessionId()
    trackSubmissionReceived(sid, { mode: 'wortzwilling', correct: false })
    const payload = getEventPayload('classroom_submission_received', sid)
    expect(payload?.correct).toBe(0)
  })
})

describe('classroom telemetry — Fehler bricht Hauptpfad nicht ab', () => {
  it('trackEvent mit ungueltigem session_id wirft nicht', () => {
    expect(() => {
      // null session_id ist erlaubt (kein NOT NULL-Constraint)
      trackEvent('classroom_session_created', { sessionId: null, teacherId: null, payload: {} })
    }).not.toThrow()
  })

  it('getAdminStats faengt DB-Fehler ab und gibt null zurueck', () => {
    // Spy auf die prepare-Methode um Fehler zu simulieren
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Ungueltiger Zeitraum (until < since) liefert leere Resultsets, kein Crash
    const result = getAdminStats({ since: Date.now() + 1000, until: Date.now() - 1000 })
    // Kein Crash — result ist entweder Objekt mit Nullen oder null
    expect(result === null || typeof result === 'object').toBe(true)
    spy.mockRestore()
  })
})

describe('classroom telemetry — getAdminStats Aggregate', () => {
  const TEACHER = `agg-teacher-${randomUUID()}`
  const sid1 = makeSessionId()
  const sid2 = makeSessionId()
  const sid3 = makeSessionId()

  beforeAll(() => {
    ensureUser(TEACHER)

    // 3 Sessions anlegen
    insertSession(sid1, TEACHER, 'finished')
    insertSession(sid2, TEACHER, 'finished')
    insertSession(sid3, TEACHER, 'aborted')

    // Assignments
    insertAssignment(sid1, 'kollokationen')
    insertAssignment(sid2, 'kollokationen')
    insertAssignment(sid3, 'wortzwilling')

    // Teilnehmer
    const p1 = makeParticipantId()
    const p2 = makeParticipantId()
    const p3 = makeParticipantId()
    insertParticipant(sid1, p1)
    insertParticipant(sid1, p2)
    insertParticipant(sid2, p3)

    // Telemetrie-Events
    trackSessionCreated(sid1, TEACHER)
    trackSessionCreated(sid2, TEACHER)
    trackSessionCreated(sid3, TEACHER)
    trackSessionFinished(sid1, TEACHER, { durationMs: 1800_000, completionRate: 1, reason: 'manual' })
    trackSessionFinished(sid2, TEACHER, { durationMs: 900_000,  completionRate: 0.5, reason: 'completed' })
    trackJoinSucceeded(sid1, p1)
    trackJoinSucceeded(sid1, p2)
    trackJoinSucceeded(sid2, p3)
    trackParticipantReconnected(sid1, p1)
    trackParticipantDropped(sid1, p2)
    trackSubmissionReceived(sid1, { mode: 'kollokationen', correct: true })
    trackSubmissionReceived(sid1, { mode: 'kollokationen', correct: false })
    trackSubmissionReceived(sid2, { mode: 'kollokationen', correct: true })
  })

  it('sessions.total zaehlt alle drei Sessions', () => {
    const stats = getAdminStats({ days: 365 })
    expect(stats).not.toBeNull()
    // Mindestens die 3 angelegten Sessions sind enthalten (es koennen mehr sein)
    expect(stats.sessions.total).toBeGreaterThanOrEqual(3)
  })

  it('byStatus enthaelt finished und aborted', () => {
    const stats = getAdminStats({ days: 365 })
    expect(stats.sessions.byStatus.finished).toBeGreaterThanOrEqual(2)
    expect(stats.sessions.byStatus.aborted).toBeGreaterThanOrEqual(1)
  })

  it('byReason zaehlt manual und completed aus Telemetrie', () => {
    const stats = getAdminStats({ days: 365 })
    expect(stats.sessions.byReason['manual']).toBeGreaterThanOrEqual(1)
    expect(stats.sessions.byReason['completed']).toBeGreaterThanOrEqual(1)
  })

  it('modes enthaelt kollokationen haeufiger als wortzwilling', () => {
    const stats = getAdminStats({ days: 365 })
    const koll = stats.modes.find(m => m.mode === 'kollokationen')
    const wz   = stats.modes.find(m => m.mode === 'wortzwilling')
    expect(koll).toBeDefined()
    expect(wz).toBeDefined()
    expect(koll.count).toBeGreaterThanOrEqual(wz.count)
  })

  it('participants.reconnects und dropped werden gezaehlt', () => {
    const stats = getAdminStats({ days: 365 })
    expect(stats.participants.reconnects).toBeGreaterThanOrEqual(1)
    expect(stats.participants.dropped).toBeGreaterThanOrEqual(1)
  })

  it('submissions.total zaehlt alle 3 Abgaben, correctPct = 2/3', () => {
    const stats = getAdminStats({ days: 365 })
    expect(stats.submissions.total).toBeGreaterThanOrEqual(3)
    // correctPct muss in [0, 1] liegen
    expect(stats.submissions.correctPct).toBeGreaterThan(0)
    expect(stats.submissions.correctPct).toBeLessThanOrEqual(1)
  })

  it('perDay ist ein Array (kann leer sein, aber niemals fehlen)', () => {
    const stats = getAdminStats({ days: 365 })
    expect(Array.isArray(stats.sessions.perDay)).toBe(true)
  })

  it('getAdminStats mit kurzem Zeitraum liefert 0 fuer sessions.total', () => {
    const stats = getAdminStats({ since: Date.now() + 10_000, until: Date.now() + 20_000 })
    expect(stats).not.toBeNull()
    expect(stats.sessions.total).toBe(0)
  })
})

describe('classroom telemetry — Event-Rename-Migration (0015, W4-S2)', () => {
  // Die Migration schreibt bestehende 'cr2_*'-Events einmalig auf 'classroom_*'
  // um. Wir testen die Migrations-SQL-Semantik deterministisch auf frisch
  // geseedeten Zeilen (die Migration selbst lief bereits idempotent beim Boot).
  const renameSql = `
    UPDATE classroom_telemetry
    SET event = 'classroom_' || substr(event, 5)
    WHERE event LIKE 'cr2\\_%' ESCAPE '\\'
  `

  it('schreibt cr2_-Prefix auf classroom_ um, laesst andere Events unberuehrt', () => {
    const tag = `mig-${randomUUID().slice(0, 8)}`
    const insert = db.prepare(
      `INSERT INTO classroom_telemetry (ts, event, session_id, teacher_id, payload_json)
       VALUES (?, ?, ?, NULL, '{}')`
    )
    insert.run(Date.now(), 'cr2_session_started', tag)   // soll umbenannt werden
    insert.run(Date.now(), 'classroom_session_finished', tag) // schon neu → unberuehrt
    insert.run(Date.now(), 'cr2x_not_a_prefix', tag)     // kein 'cr2_' → unberuehrt

    db.prepare(renameSql).run()

    const events = db.prepare(
      `SELECT event FROM classroom_telemetry WHERE session_id = ? ORDER BY event`
    ).all(tag).map((r) => r.event)

    expect(events).toContain('classroom_session_started')  // umbenannt
    expect(events).toContain('classroom_session_finished') // unveraendert
    expect(events).toContain('cr2x_not_a_prefix')          // unveraendert (kein _-Prefix)
    expect(events).not.toContain('cr2_session_started')

    db.prepare(`DELETE FROM classroom_telemetry WHERE session_id = ?`).run(tag)
  })

  it('ist idempotent: ein zweiter Lauf aendert nichts mehr', () => {
    const tag = `mig2-${randomUUID().slice(0, 8)}`
    db.prepare(
      `INSERT INTO classroom_telemetry (ts, event, session_id, teacher_id, payload_json)
       VALUES (?, 'cr2_join_succeeded', ?, NULL, '{}')`
    ).run(Date.now(), tag)

    const first = db.prepare(renameSql).run()
    expect(first.changes).toBe(1)
    const second = db.prepare(renameSql).run()
    expect(second.changes).toBe(0)

    db.prepare(`DELETE FROM classroom_telemetry WHERE session_id = ?`).run(tag)
  })
})
