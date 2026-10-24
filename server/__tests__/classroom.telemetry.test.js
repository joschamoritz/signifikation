/**
 * server/__tests__/classroom.telemetry.test.js
 *
 * Tests fuer den Telemetrie-Layer (W2-T6).
 *
 * Abdeckung:
 *   1. Neue Events schreiben korrekt in classroom_telemetry
 *   2. Fehler beim Telemetrie-Insert bricht den Hauptpfad nicht ab
 *   3. Markierung von Admin-Sitzungen und Aufgabe an der Antwort (für die Auswertung)
 *   Die Aggregate (getKlassenraumAuswertung) prüft classroom.auswertung.test.js.
 */

import { describe, expect, it } from 'vitest'
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
})

describe('classroom telemetry — Angaben für die Auswertung', () => {
  it('trackSessionCreated markiert Sitzungen von Admin-Konten (die Kennung wird nach 30 Tagen gelöscht, die Markierung bleibt)', () => {
    const adminId = makeTeacherId()
    ensureUser(adminId)
    const now = Date.now()
    db.prepare('INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)').run(adminId, 'admin', now, now)
    const sid = makeSessionId()
    trackSessionCreated(sid, adminId)
    expect(getEventPayload('classroom_session_created', sid)).toEqual({ admin: 1 })

    // normale Lehrkraft: keine Markierung
    const sid2 = makeSessionId()
    trackSessionCreated(sid2, makeTeacherId())
    expect(getEventPayload('classroom_session_created', sid2)).toEqual({})

    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(adminId)
  })

  it('trackSessionFinished schreibt reason "auto" für das Auto-Ende', () => {
    const sid = makeSessionId()
    trackSessionFinished(sid, makeTeacherId(), { reason: 'auto', durationMs: 5_400_000 })
    expect(getEventPayload('classroom_session_finished', sid)?.reason).toBe('auto')
  })

  it('trackSubmissionReceived merkt sich die Aufgabe (assignmentId), aber weiterhin keine Teilnehmer- oder Lemma-Kennung', () => {
    const sid = makeSessionId()
    trackSubmissionReceived(sid, { mode: 'zeitenwende', correct: true, assignmentId: 'asgn-1' })
    const payload = getEventPayload('classroom_submission_received', sid)
    expect(payload).toEqual({ mode: 'zeitenwende', correct: 1, assignmentId: 'asgn-1' })
    expect(payload.participantId).toBeUndefined()
    expect(payload.lemmaId).toBeUndefined()
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
