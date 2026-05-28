import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import db from '../db.js'
import { randomUUID } from 'crypto'
import {
  createSession,
  startSession,
  finishSession,
  addAssignment,
  listAssignments,
  removeAssignment,
  joinByCode,
  heartbeatParticipant,
  leaveParticipant,
  findParticipantByToken,
  submitAnswer,
  getDashboard,
  listTeacherSessions,
  hasCapability,
} from '../classroom-v2/store.js'

const TEACHER_A = `test-store-teacher-A-${randomUUID()}`
const TEACHER_B = `test-store-teacher-B-${randomUUID()}`

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function cleanup() {
  for (const t of [TEACHER_A, TEACHER_B]) {
    const sessions = db.prepare(`SELECT id FROM classroom_session WHERE teacher_user_id = ?`).all(t)
    for (const s of sessions) {
      db.prepare(`DELETE FROM classroom_session WHERE id = ?`).run(s.id)
    }
  }
}

const KOLL_SNAPSHOT = {
  byLemma: {
    'lemma-1': {
      kollokatoren: [
        { wort: 'stark', rang: 1 },
        { wort: 'groß',  rang: 2 },
        { wort: 'klein', rang: 3 },
        { wort: 'weit',  rang: 4 },
        { wort: 'hoch',  rang: 6 },
        { wort: 'tief',  rang: 8 },
        { wort: 'laut',  rang: 9 },
        { wort: 'leise', rang: 10 },
        { wort: 'fern',  rang: 11 },
        { wort: 'nah',   rang: 12 },
      ],
    },
  },
}

describe('classroom-v2/store', () => {
  beforeAll(() => {
    ensureUser(TEACHER_A)
    ensureUser(TEACHER_B)
  })
  beforeEach(() => {
    cleanup()
  })

  // ── createSession ──────────────────────────────────────────────
  describe('createSession', () => {
    it('legt Session im Status lobby an mit eindeutigem Code', () => {
      const r = createSession({ teacherUserId: TEACHER_A, title: 'Klasse 8b' })
      expect(r.session).toBeTruthy()
      expect(r.session.status).toBe('lobby')
      expect(r.session.code).toMatch(/^[a-z]+-[a-z]+$/)
      expect(r.session.teacherUserId).toBe(TEACHER_A)
    })

    it('grantet teacher das session:manage-Capability', () => {
      const r = createSession({ teacherUserId: TEACHER_A })
      expect(hasCapability({
        sessionId: r.session.id,
        subjectKind: 'teacher',
        subjectId: TEACHER_A,
        capability: 'session:manage',
      })).toBe(true)
    })
  })

  // ── Lifecycle / Assignments ────────────────────────────────────
  describe('Lifecycle', () => {
    it('verweigert startSession ohne Assignment', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBe('NO_ASSIGNMENT')
    })

    it('setzt locked_at beim Start (D4)', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      const r = startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.session.status).toBe('running')
      expect(r.session.lockedAt).toBeGreaterThan(0)
      expect(r.session.startedAt).toBeGreaterThan(0)
    })

    it('verweigert addAssignment im running-State', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'wortzwilling', lemmaIds: ['lemma-2'], contentSnapshot: {},
      })
      expect(r.error).toBe('INVALID_STATE')
    })

    it('erzwingt D2: nur 1 Assignment pro Session', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      const r = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'wortzwilling', lemmaIds: ['lemma-2'], contentSnapshot: {},
      })
      expect(r.error).toBe('ASSIGNMENT_EXISTS')
    })

    it('erzwingt D3: max 3 Lemmata pro Assignment', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['a','b','c','d'],
        contentSnapshot: {},
      })
      expect(r.error).toBe('TOO_MANY_LEMMATA')
    })

    it('finishSession revoked alle submission:write-Capabilities', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const joined = joinByCode({ code: session.code, displayName: 'Tina' })
      expect(hasCapability({
        sessionId: session.id, subjectKind: 'participant',
        subjectId: joined.participant.id, capability: 'submission:write',
      })).toBe(true)
      finishSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(hasCapability({
        sessionId: session.id, subjectKind: 'participant',
        subjectId: joined.participant.id, capability: 'submission:write',
      })).toBe(false)
    })

    it('verweigert fremden teacher_user_id beim start/finish', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r1 = startSession({ sessionId: session.id, teacherUserId: TEACHER_B })
      const r2 = finishSession({ sessionId: session.id, teacherUserId: TEACHER_B })
      expect(r1.error).toBe('FORBIDDEN')
      expect(r2.error).toBe('FORBIDDEN')
    })

    it('removeAssignment im running-State verboten', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = removeAssignment({
        sessionId: session.id, assignmentId: assignment.id, teacherUserId: TEACHER_A,
      })
      expect(r.error).toBe('INVALID_STATE')
    })
  })

  // ── joinByCode + heartbeat + leave ─────────────────────────────
  describe('Participant lifecycle', () => {
    it('joint mit gueltigem Code, liefert Klartext-Token', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = joinByCode({ code: session.code, displayName: 'Lena' })
      expect(r.error).toBeUndefined()
      expect(r.participant.id).toBeTruthy()
      expect(r.participant.token).toBeTruthy()
      expect(r.session.id).toBe(session.id)
      // Token NICHT im DB-Klartext gespeichert (HMAC, R-3)
      const tokenInDb = db.prepare(`SELECT auth_token FROM classroom_participant WHERE id = ?`).get(r.participant.id)
      expect(tokenInDb.auth_token).not.toBe(r.participant.token)
    })

    it('findParticipantByToken loest Klartext-Token auf', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'Lena' })
      const p = findParticipantByToken(j.participant.token)
      expect(p?.id).toBe(j.participant.id)
      expect(p?.displayName).toBe('Lena')
    })

    it('lehnt unbekannten Code ab', () => {
      const r = joinByCode({ code: 'nicht-existent', displayName: 'X' })
      expect(r.error).toBe('INVALID_CODE')
    })

    it('lehnt Code einer beendeten Session ab', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      finishSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = joinByCode({ code: session.code, displayName: 'Spaet' })
      expect(r.error).toBe('INVALID_CODE')
    })

    it('heartbeat reaktiviert auch nach Leave', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'Lena' })
      leaveParticipant(j.participant.id)
      heartbeatParticipant(j.participant.id)
      const row = db.prepare(`SELECT left_at, connected FROM classroom_participant WHERE id = ?`).get(j.participant.id)
      expect(row.left_at).toBeNull()
      expect(row.connected).toBe(1)
    })

    it('Default-Name wenn displayName leer', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: '   ' })
      expect(j.participant).toBeTruthy()
      const p = findParticipantByToken(j.participant.token)
      expect(p.displayName).toMatch(/Schueler:in/)
    })
  })

  // ── submitAnswer (server-autoritativ + idempotent) ─────────────
  describe('submitAnswer', () => {
    function setupRunningSession() {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'X' })
      return { session, assignment, participant: j.participant }
    }

    it('berechnet Score serverseitig (Client-score wird ignoriert)', () => {
      const { session, assignment, participant } = setupRunningSession()
      const r = submitAnswer({
        participantId: participant.id,
        sessionId: session.id,
        assignmentId: assignment.id,
        lemmaId: 'lemma-1',
        roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'], score: 9999 }, // score wird ignoriert
      })
      expect(r.score).toBe(10) // perfekte Kollokationen, Server-berechnet
      expect(r.maxScore).toBe(10)
      expect(r.correct).toBe(3)
    })

    it('ist idempotent: zweites Submit liefert denselben Score', () => {
      const { session, assignment, participant } = setupRunningSession()
      const r1 = submitAnswer({
        participantId: participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      const r2 = submitAnswer({
        participantId: participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['fern', 'nah', 'leise'] }, // andere Antwort
      })
      expect(r1.submissionId).toBe(r2.submissionId)
      expect(r2.score).toBe(r1.score) // erste Antwort gewinnt
    })

    it('verweigert Submit in lobby-State', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      const j = joinByCode({ code: session.code, displayName: 'X' })
      const r = submitAnswer({
        participantId: j.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark','groß','klein'] },
      })
      expect(r.error).toBe('INVALID_STATE')
    })

    it('verweigert nach finishSession (Capability revoked)', () => {
      const { session, assignment, participant } = setupRunningSession()
      finishSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = submitAnswer({
        participantId: participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark','groß','klein'] },
      })
      expect(r.error).toBe('INVALID_STATE')
    })

    it('begrenzt raw_answer-Payload (PAYLOAD_TOO_LARGE)', () => {
      const { session, assignment, participant } = setupRunningSession()
      const r = submitAnswer({
        participantId: participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { huge: 'x'.repeat(5000) },
      })
      expect(r.error).toBe('PAYLOAD_TOO_LARGE')
    })
  })

  // ── Dashboard ──────────────────────────────────────────────────
  describe('getDashboard', () => {
    it('konsolidiert participants + perLemma-Aggregat', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const j1 = joinByCode({ code: session.code, displayName: 'Alice' })
      const j2 = joinByCode({ code: session.code, displayName: 'Bob' })
      submitAnswer({
        participantId: j1.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] }, // 10
      })
      submitAnswer({
        participantId: j2.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['weit', 'tief', 'leise'] }, // 2+1+1 = 4
      })

      const dash = getDashboard({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(dash.error).toBeUndefined()
      expect(dash.participants).toHaveLength(2)
      expect(dash.aggregate.totalParticipants).toBe(2)
      expect(dash.aggregate.submittedTotal).toBe(2)
      expect(dash.aggregate.perLemma).toHaveLength(1)
      const lemmaAgg = dash.aggregate.perLemma[0]
      expect(lemmaAgg.lemmaId).toBe('lemma-1')
      expect(lemmaAgg.submitted).toBe(2)
      // (10 + 4) / 20 = 70%
      expect(lemmaAgg.correctPct).toBe(70)
    })

    it('verweigert fremdem Teacher Zugriff', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const dash = getDashboard({ sessionId: session.id, teacherUserId: TEACHER_B })
      expect(dash.error).toBe('FORBIDDEN')
    })
  })

  describe('listTeacherSessions', () => {
    it('liefert nur Sessions des Teachers', () => {
      createSession({ teacherUserId: TEACHER_A, title: 'S1' })
      createSession({ teacherUserId: TEACHER_A, title: 'S2' })
      createSession({ teacherUserId: TEACHER_B, title: 'Foreign' })
      const list = listTeacherSessions({ teacherUserId: TEACHER_A })
      expect(list.length).toBe(2)
      expect(list.every((s) => s.teacherUserId === TEACHER_A)).toBe(true)
    })
  })
})
