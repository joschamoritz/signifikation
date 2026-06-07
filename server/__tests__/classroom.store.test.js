import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import db from '../db.js'
import { randomUUID } from 'crypto'
import {
  createSession,
  startSession,
  finishSession,
  deleteSession,
  pauseSession,
  resumeSession,
  touchSessionActivity,
  autoEndStaleSessions,
  getSessionById,
  addAssignment,
  addAssignments,
  nextAssignment,
  getCurrentAssignment,
  listAssignments,
  removeAssignment,
  joinByCode,
  heartbeatParticipant,
  leaveParticipant,
  kickParticipant,
  findParticipantByToken,
  submitAnswer,
  getDashboard,
  getSessionResults,
  listTeacherSessions,
  hasCapability,
  DEFAULT_AUTO_END_IDLE_MS,
  runClassroomRetention,
  DEFAULT_NAME_ANONYMIZE_MS,
  DEFAULT_HARD_DELETE_MS,
  ANONYMIZED_DISPLAY_NAME,
} from '../classroom/store.js'

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

describe('classroom/store', () => {
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

    it('deleteSession entfernt die Session inkl. Assignments (CASCADE), nur Eigentuemer', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      // Fremder Lehrer darf nicht loeschen
      expect(deleteSession({ sessionId: session.id, teacherUserId: TEACHER_B }).error).toBe('FORBIDDEN')
      expect(getSessionById(session.id)).toBeTruthy()
      // Eigentuemer loescht → Session weg, Assignments per CASCADE entfernt
      const r = deleteSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.ok).toBe(true)
      expect(getSessionById(session.id)).toBeFalsy()
      expect(listAssignments(session.id)).toHaveLength(0)
      // Nicht-existente Session
      expect(deleteSession({ sessionId: 'does-not-exist', teacherUserId: TEACHER_A }).error).toBe('NOT_FOUND')
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

    it('W2-T2: mehrere Assignments behalten ihre Reihenfolge (position 0,1,2)', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'], contentSnapshot: KOLL_SNAPSHOT,
      })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'wortzwilling', lemmaIds: ['lemma-2'], contentSnapshot: {},
      })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'zeitenwende', lemmaIds: ['lemma-3'], contentSnapshot: {},
      })
      const list = listAssignments(session.id)
      expect(list.map((a) => a.position)).toEqual([0, 1, 2])
      expect(list.map((a) => a.mode)).toEqual(['kollokationen', 'wortzwilling', 'zeitenwende'])
    })

    it('W2-T2: addAssignments legt Bloecke atomar in Reihenfolge an', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = addAssignments({
        sessionId: session.id, teacherUserId: TEACHER_A,
        blocks: [
          { mode: 'kollokationen', lemmaIds: ['lemma-1'], contentSnapshot: KOLL_SNAPSHOT },
          { mode: 'wortzwilling',  lemmaIds: ['lemma-2'], contentSnapshot: {} },
        ],
      })
      expect(r.error).toBeUndefined()
      expect(r.assignments).toHaveLength(2)
      expect(r.assignments.map((a) => a.position)).toEqual([0, 1])
    })

    it('W2-T2: erzwingt max 5 Modus-Bloecke pro Session', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = addAssignments({
        sessionId: session.id, teacherUserId: TEACHER_A,
        blocks: Array.from({ length: 6 }, () => ({
          mode: 'kollokationen', lemmaIds: ['lemma-1'], contentSnapshot: {},
        })),
      })
      expect(r.error).toBe('TOO_MANY_ASSIGNMENTS')
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

    it('kickParticipant: Besitzer entfernt Teilnehmer (left_at gesetzt)', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'Trollo' })
      const r = kickParticipant({ sessionId: session.id, participantId: j.participant.id, teacherUserId: TEACHER_A })
      expect(r.ok).toBe(true)
      const row = db.prepare(`SELECT left_at, connected FROM classroom_participant WHERE id = ?`).get(j.participant.id)
      expect(row.left_at).not.toBeNull()
      expect(row.connected).toBe(0)
      // Token ist damit entwertet (requireParticipantAuth lehnt leftAt ab).
      expect(findParticipantByToken(j.participant.token)?.leftAt).not.toBeNull()
    })

    it('kickParticipant: fremder Teacher → FORBIDDEN', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'Lena' })
      const r = kickParticipant({ sessionId: session.id, participantId: j.participant.id, teacherUserId: TEACHER_B })
      expect(r.error).toBe('FORBIDDEN')
    })

    it('kickParticipant: Teilnehmer gehört nicht zur Session → NOT_FOUND', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = kickParticipant({ sessionId: session.id, participantId: 'gibt-es-nicht', teacherUserId: TEACHER_A })
      expect(r.error).toBe('NOT_FOUND')
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

  // ── nextAssignment (W2-T2, sequenzielle Modi) ──────────────────
  describe('nextAssignment', () => {
    function setupMultiSession() {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignments({
        sessionId: session.id, teacherUserId: TEACHER_A,
        blocks: [
          { mode: 'kollokationen', lemmaIds: ['lemma-1'], contentSnapshot: KOLL_SNAPSHOT },
          { mode: 'wortzwilling',  lemmaIds: ['lemma-2'], contentSnapshot: {} },
        ],
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      return { session }
    }

    it('startet beim ersten Assignment (index 0)', () => {
      const { session } = setupMultiSession()
      const current = getCurrentAssignment(session.id)
      expect(current.position).toBe(0)
      expect(current.mode).toBe('kollokationen')
    })

    it('rueckt auf das naechste Assignment vor', () => {
      const { session } = setupMultiSession()
      const r = nextAssignment({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBeUndefined()
      expect(r.done).toBeUndefined()
      expect(r.index).toBe(1)
      expect(r.total).toBe(2)
      expect(r.assignment.mode).toBe('wortzwilling')
      expect(getCurrentAssignment(session.id).position).toBe(1)
    })

    it('beendet die Session nach dem letzten Block (done: true)', () => {
      const { session } = setupMultiSession()
      nextAssignment({ sessionId: session.id, teacherUserId: TEACHER_A }) // → index 1 (letzter)
      const r = nextAssignment({ sessionId: session.id, teacherUserId: TEACHER_A }) // → ended
      expect(r.error).toBeUndefined()
      expect(r.done).toBe(true)
      expect(r.session.status).toBe('finished')
    })

    it('verweigert Wechsel im Pause-Zustand', () => {
      const { session } = setupMultiSession()
      pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = nextAssignment({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBe('SESSION_PAUSED')
    })

    it('verweigert fremden Teacher', () => {
      const { session } = setupMultiSession()
      const r = nextAssignment({ sessionId: session.id, teacherUserId: TEACHER_B })
      expect(r.error).toBe('FORBIDDEN')
    })
  })

  // ── Submission-Zuordnung zum aktiven Assignment (W2-T2) ────────
  describe('submitAnswer Assignment-Routing', () => {
    function setupTwoBlocksRunning() {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = addAssignments({
        sessionId: session.id, teacherUserId: TEACHER_A,
        blocks: [
          { mode: 'kollokationen', lemmaIds: ['lemma-1'], contentSnapshot: KOLL_SNAPSHOT },
          { mode: 'kollokationen', lemmaIds: ['lemma-1'], contentSnapshot: KOLL_SNAPSHOT },
        ],
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'X' })
      return { session, blockA: r.assignments[0], blockB: r.assignments[1], participant: j.participant }
    }

    it('nimmt Submission fuer das aktive Assignment an', () => {
      const { session, blockA, participant } = setupTwoBlocksRunning()
      const r = submitAnswer({
        participantId: participant.id, sessionId: session.id,
        assignmentId: blockA.id, lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      expect(r.error).toBeUndefined()
      expect(r.score).toBeGreaterThan(0)
    })

    it('lehnt Submission fuer noch nicht aktives Assignment ab', () => {
      const { session, blockB, participant } = setupTwoBlocksRunning()
      const r = submitAnswer({
        participantId: participant.id, sessionId: session.id,
        assignmentId: blockB.id, lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      expect(r.error).toBe('ASSIGNMENT_NOT_ACTIVE')
    })

    it('lehnt Submission fuer bereits abgeschlossenes Assignment ab', () => {
      const { session, blockA, participant } = setupTwoBlocksRunning()
      nextAssignment({ sessionId: session.id, teacherUserId: TEACHER_A }) // blockA abgeschlossen
      const r = submitAnswer({
        participantId: participant.id, sessionId: session.id,
        assignmentId: blockA.id, lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      expect(r.error).toBe('ASSIGNMENT_NOT_ACTIVE')
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

    it('W4-S4 (3.3): Runden-Fortschritt pro Teilnehmer + done-Flag bei mehreren Lemmata', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const snap2 = {
        byLemma: {
          'lemma-1': KOLL_SNAPSHOT.byLemma['lemma-1'],
          'lemma-2': KOLL_SNAPSHOT.byLemma['lemma-1'],
        },
      }
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1', 'lemma-2'],
        contentSnapshot: snap2,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const alice = joinByCode({ code: session.code, displayName: 'Alice' })
      const bob   = joinByCode({ code: session.code, displayName: 'Bob' })

      // Alice gibt beide Lemmata ab → fertig. Bob nur das erste.
      for (const lemmaId of ['lemma-1', 'lemma-2']) {
        submitAnswer({
          participantId: alice.participant.id,
          sessionId: session.id, assignmentId: assignment.id,
          lemmaId, roundIndex: 0, rawAnswer: { selected: ['stark', 'groß', 'klein'] },
        })
      }
      submitAnswer({
        participantId: bob.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0, rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })

      const dash = getDashboard({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(dash.lemmataPerAssignment).toBe(2)
      const byName = Object.fromEntries(dash.participants.map((p) => [p.displayName, p]))
      expect(byName.Alice.submittedLemmata).toBe(2)
      expect(byName.Alice.done).toBe(true)
      expect(byName.Bob.submittedLemmata).toBe(1)
      expect(byName.Bob.done).toBe(false)
      expect(dash.aggregate.doneCount).toBe(1)
    })
  })

  // ── getSessionResults (W2-T4) ──────────────────────────────────
  describe('getSessionResults', () => {
    function setupFinishedKollSession() {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const j1 = joinByCode({ code: session.code, displayName: 'Alice' })
      const j2 = joinByCode({ code: session.code, displayName: 'Bob' })
      const j3 = joinByCode({ code: session.code, displayName: 'Charlie' })
      // j1: stark/groß/klein → 3+3+3 +Bonus = 10, keine Distraktoren
      submitAnswer({
        participantId: j1.participant.id, sessionId: session.id,
        assignmentId: assignment.id, lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      // j2: weit/tief/leise → 2+1+1 = 4; Distraktoren: weit, tief, leise
      submitAnswer({
        participantId: j2.participant.id, sessionId: session.id,
        assignmentId: assignment.id, lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['weit', 'tief', 'leise'] },
      })
      // j3: weit/hoch/laut → 2+2+1 = 5; Distraktoren: weit, hoch, laut
      submitAnswer({
        participantId: j3.participant.id, sessionId: session.id,
        assignmentId: assignment.id, lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['weit', 'hoch', 'laut'] },
      })
      finishSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      return { session, assignment }
    }

    it('berechnet Trefferquote, Ø-Score und häufigsten Distraktor korrekt', () => {
      const { session } = setupFinishedKollSession()
      const r = getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBeUndefined()
      expect(r.hasSubmissions).toBe(true)
      expect(r.totals.participants).toBe(3)
      expect(r.totals.submissions).toBe(3)
      expect(r.byLemma).toHaveLength(1)

      const card = r.byLemma[0]
      expect(card.lemmaId).toBe('lemma-1')
      expect(card.mode).toBe('kollokationen')
      expect(card.participants).toBe(3)
      expect(card.submissions).toBe(3)
      // (10 + 4 + 5) / 30 = 63.33 → 63 %
      expect(card.hitRatePct).toBe(63)
      // (10 + 4 + 5) / 3 = 6.33 → 6.3
      expect(card.avgScore).toBe(6.3)
      expect(card.maxScore).toBe(10)
      // 'weit' wurde 2× als nicht-optimal gewählt → häufigster Distraktor
      expect(card.topDistractor).toEqual({ label: 'weit', count: 2 })
    })

    it('listet auffälligste Fragen (Top 3 niedrigste Quote) rein aggregiert', () => {
      const { session } = setupFinishedKollSession()
      const r = getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.trickiest.length).toBeGreaterThanOrEqual(1)
      const t = r.trickiest[0]
      expect(t).toHaveProperty('lemma')
      expect(t).toHaveProperty('hitRatePct')
      // Keine Teilnehmer-Identität in den auffälligsten Fragen
      expect(t).not.toHaveProperty('participantId')
      expect(t).not.toHaveProperty('displayName')
    })

    it('ist pseudonymisiert — keine Klarnamen oder Teilnehmer-IDs im Ergebnis', () => {
      const { session } = setupFinishedKollSession()
      const r = getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_A })
      const serialized = JSON.stringify(r)
      // Anzeigenamen der Teilnehmer dürfen nirgends auftauchen
      expect(serialized).not.toContain('Alice')
      expect(serialized).not.toContain('Bob')
      expect(serialized).not.toContain('Charlie')
      // Keine Namens-/Identitätsfelder in den Lemma-Karten
      for (const card of r.byLemma) {
        expect(card).not.toHaveProperty('participantId')
        expect(card).not.toHaveProperty('displayName')
        expect(card).not.toHaveProperty('participants_list')
      }
    })

    it('liefert Empty State, wenn keine Submissions vorliegen', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      finishSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBeUndefined()
      expect(r.hasSubmissions).toBe(false)
      expect(r.byLemma).toEqual([])
      expect(r.trickiest).toEqual([])
      expect(r.totals).toEqual({ participants: 0, submissions: 0 })
    })

    it('verweigert Auswertung für noch nicht beendete Session', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      // lobby
      expect(getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_A }).error)
        .toBe('SESSION_NOT_ENDED')
      // running
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_A }).error)
        .toBe('SESSION_NOT_ENDED')
    })

    it('verweigert fremdem Teacher Zugriff', () => {
      const { session } = setupFinishedKollSession()
      const r = getSessionResults({ sessionId: session.id, teacherUserId: TEACHER_B })
      expect(r.error).toBe('FORBIDDEN')
    })

    it('liefert NOT_FOUND für unbekannte Session', () => {
      const r = getSessionResults({ sessionId: 'does-not-exist', teacherUserId: TEACHER_A })
      expect(r.error).toBe('NOT_FOUND')
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

  // ── Pause / Resume (W2-T3, D8) ─────────────────────────────────
  describe('pauseSession / resumeSession', () => {
    function startedSession() {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      const started = startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      return { session, started: started.session }
    }

    it('pausiert eine laufende Session: abgeleiteter Status paused', () => {
      const { session } = startedSession()
      const r = pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBeUndefined()
      expect(r.session.status).toBe('paused')
      expect(r.session.paused).toBe(true)
      expect(r.session.pausedAt).toBeGreaterThan(0)
      // DB-Status bleibt 'running' (Code-Join bleibt gueltig) — nur abgeleitet.
      const raw = db.prepare(`SELECT status, paused_at FROM classroom_session WHERE id = ?`).get(session.id)
      expect(raw.status).toBe('running')
      expect(raw.paused_at).toBeGreaterThan(0)
    })

    it('setzt nach resume zurueck auf running', () => {
      const { session } = startedSession()
      pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = resumeSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBeUndefined()
      expect(r.session.status).toBe('running')
      expect(r.session.paused).toBe(false)
      expect(r.session.pausedAt).toBeNull()
      expect(getSessionById(session.id).status).toBe('running')
    })

    it('verweigert pause im lobby-State (INVALID_STATE)', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const r = pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBe('INVALID_STATE')
    })

    it('verweigert doppeltes pause (INVALID_STATE)', () => {
      const { session } = startedSession()
      pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r = pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBe('INVALID_STATE')
    })

    it('verweigert resume wenn nicht pausiert (INVALID_STATE)', () => {
      const { session } = startedSession()
      const r = resumeSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      expect(r.error).toBe('INVALID_STATE')
    })

    it('verweigert fremden teacher_user_id (FORBIDDEN)', () => {
      const { session } = startedSession()
      const r1 = pauseSession({ sessionId: session.id, teacherUserId: TEACHER_B })
      expect(r1.error).toBe('FORBIDDEN')
      pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const r2 = resumeSession({ sessionId: session.id, teacherUserId: TEACHER_B })
      expect(r2.error).toBe('FORBIDDEN')
    })

    it('NOT_FOUND fuer unbekannte Session', () => {
      expect(pauseSession({ sessionId: 'nope', teacherUserId: TEACHER_A }).error).toBe('NOT_FOUND')
      expect(resumeSession({ sessionId: 'nope', teacherUserId: TEACHER_A }).error).toBe('NOT_FOUND')
    })

    it('verweigert Submit waehrend Pause (SESSION_PAUSED), nach resume wieder ok', () => {
      const { session } = startedSession()
      const assignment = listAssignments(session.id)[0]
      const j = joinByCode({ code: session.code, displayName: 'X' })
      pauseSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const blocked = submitAnswer({
        participantId: j.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      expect(blocked.error).toBe('SESSION_PAUSED')
      resumeSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const ok = submitAnswer({
        participantId: j.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      expect(ok.error).toBeUndefined()
      expect(ok.score).toBe(10)
    })
  })

  // ── Auto-End nach Inaktivitaet (W2-T3, D8) ─────────────────────
  describe('autoEndStaleSessions', () => {
    function startedSession() {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      return session
    }

    it('beendet eine inaktive Session und revoked submission:write', () => {
      const session = startedSession()
      const j = joinByCode({ code: session.code, displayName: 'X' })
      expect(hasCapability({
        sessionId: session.id, subjectKind: 'participant',
        subjectId: j.participant.id, capability: 'submission:write',
      })).toBe(true)

      // now weit in der Zukunft → last_activity_at liegt > maxIdleMs zurueck.
      const future = Date.now() + DEFAULT_AUTO_END_IDLE_MS + 1000
      const { ended } = autoEndStaleSessions({ now: future })
      expect(ended.map((s) => s.id)).toContain(session.id)

      expect(getSessionById(session.id).status).toBe('finished')
      expect(hasCapability({
        sessionId: session.id, subjectKind: 'participant',
        subjectId: j.participant.id, capability: 'submission:write',
      })).toBe(false)
    })

    it('laesst eine frisch aktive Session unberuehrt', () => {
      const session = startedSession()
      const { ended } = autoEndStaleSessions() // now = jetzt, maxIdleMs = 90 Min
      expect(ended.map((s) => s.id)).not.toContain(session.id)
      expect(getSessionById(session.id).status).toBe('running')
    })

    it('touchSessionActivity verschiebt das Auto-End-Fenster', () => {
      const session = startedSession()
      // Aktivitaet kurz vor dem Pruefzeitpunkt → nicht mehr stale.
      const future = Date.now() + DEFAULT_AUTO_END_IDLE_MS + 1000
      // Erst Aktivitaet "in der Zukunft" simulieren ist nicht moeglich (nowMs
      // intern), daher pruefen wir: ohne erneute Aktivitaet wuerde sie enden,
      // mit maxIdleMs gross genug bleibt sie laufen.
      const { ended } = autoEndStaleSessions({ now: future, maxIdleMs: DEFAULT_AUTO_END_IDLE_MS * 10 })
      expect(ended.map((s) => s.id)).not.toContain(session.id)
      expect(getSessionById(session.id).status).toBe('running')
    })

    it('ignoriert nicht-laufende Sessions (lobby/finished)', () => {
      const { session: lobby } = createSession({ teacherUserId: TEACHER_A })
      const finished = startedSession()
      finishSession({ sessionId: finished.id, teacherUserId: TEACHER_A })
      const future = Date.now() + DEFAULT_AUTO_END_IDLE_MS + 1000
      const { ended } = autoEndStaleSessions({ now: future })
      const ids = ended.map((s) => s.id)
      expect(ids).not.toContain(lobby.id)
      expect(ids).not.toContain(finished.id)
    })
  })

  describe('runClassroomRetention (E1/D9)', () => {
    // WICHTIG: Die Tests laufen gegen die echte signifikation.db (kein APP_DB).
    // Damit der Sweep NIE reale Sessions trifft, altern wir finished_at auf
    // einen winzigen Epoch-Wert und waehlen `now` klein. Bedingung ist
    // `finished_at <= threshold`; reale Zeilen (finished_at ~1.7e12) liegen weit
    // ueber jeder hier abgeleiteten Schwelle und werden so nie erfasst.
    const AGED = 1_000_000 // ~1970, beliebig „alt"

    // Beendete Session mit 1 Teilnehmer (Klarname) + 1 Submission; finished_at
    // wird auf `agedAt` zurueckdatiert.
    function finishedSessionWithData(displayName = 'Max Mustermann', agedAt = AGED) {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      const { assignment } = addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName })
      submitAnswer({
        participantId: j.participant.id,
        sessionId: session.id, assignmentId: assignment.id,
        lemmaId: 'lemma-1', roundIndex: 0,
        rawAnswer: { selected: ['stark', 'groß', 'klein'] },
      })
      finishSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      db.prepare(`UPDATE classroom_session SET finished_at = ? WHERE id = ?`)
        .run(agedAt, session.id)
      return { session, participant: j.participant }
    }

    const nameOf = (participantId) =>
      db.prepare(`SELECT display_name FROM classroom_participant WHERE id = ?`)
        .get(participantId)?.display_name

    it('Stufe A: anonymisiert display_name nach 48 h, ohne zu loeschen', () => {
      const { session, participant } = finishedSessionWithData()
      expect(nameOf(participant.id)).toBe('Max Mustermann')

      // now = AGED + 48 h + 1 s → Stufe A greift, Stufe B (30 Tage) nicht.
      const res = runClassroomRetention({ now: AGED + DEFAULT_NAME_ANONYMIZE_MS + 1000 })
      expect(res.anonymized).toBeGreaterThanOrEqual(1)
      expect(res.deleted).toBe(0)

      expect(nameOf(participant.id)).toBe(ANONYMIZED_DISPLAY_NAME)
      // Session + Daten bleiben erhalten.
      expect(getSessionById(session.id)).toBeTruthy()
    })

    it('laesst Sessions juenger als 48 h unberuehrt', () => {
      const { session, participant } = finishedSessionWithData('Erika')
      // now nur 1 h nach (gekuenstelt-altem) Ende → kein Fenster erreicht.
      const res = runClassroomRetention({ now: AGED + 60 * 60 * 1000 })
      expect(res.anonymized).toBe(0)
      expect(res.deleted).toBe(0)
      expect(nameOf(participant.id)).toBe('Erika')
      expect(getSessionById(session.id)).toBeTruthy()
    })

    it('ist idempotent: zweiter Sweep anonymisiert nichts erneut', () => {
      const { participant } = finishedSessionWithData('Klaus')
      const now = AGED + DEFAULT_NAME_ANONYMIZE_MS + 1000
      const first = runClassroomRetention({ now })
      expect(first.anonymized).toBeGreaterThanOrEqual(1)
      const second = runClassroomRetention({ now })
      // Bereits anonymisierte Zeile (== Platzhalter) wird nicht erneut angefasst.
      expect(second.anonymized).toBe(0)
      expect(nameOf(participant.id)).toBe(ANONYMIZED_DISPLAY_NAME)
    })

    it('Stufe B: loescht Session + Teilnehmer + Submissions nach 30 Tagen (CASCADE)', () => {
      const { session, participant } = finishedSessionWithData('Lösch Mich')
      const submCountBefore = db
        .prepare(`SELECT COUNT(1) AS c FROM classroom_submission WHERE session_id = ?`)
        .get(session.id).c
      expect(submCountBefore).toBeGreaterThanOrEqual(1)

      const res = runClassroomRetention({ now: AGED + DEFAULT_HARD_DELETE_MS + 1000 })
      expect(res.deleted).toBeGreaterThanOrEqual(1)

      expect(getSessionById(session.id)).toBeNull()
      const partLeft = db
        .prepare(`SELECT COUNT(1) AS c FROM classroom_participant WHERE id = ?`)
        .get(participant.id).c
      const submLeft = db
        .prepare(`SELECT COUNT(1) AS c FROM classroom_submission WHERE session_id = ?`)
        .get(session.id).c
      expect(partLeft).toBe(0)
      expect(submLeft).toBe(0)
    })

    it('ruehrt laufende (nicht beendete) Sessions nicht an', () => {
      const { session } = createSession({ teacherUserId: TEACHER_A })
      addAssignment({
        sessionId: session.id, teacherUserId: TEACHER_A,
        mode: 'kollokationen', lemmaIds: ['lemma-1'],
        contentSnapshot: KOLL_SNAPSHOT,
      })
      startSession({ sessionId: session.id, teacherUserId: TEACHER_A })
      const j = joinByCode({ code: session.code, displayName: 'Aktiv' })

      // Laufende Session hat kein finished_at → Status-Filter schuetzt sie,
      // unabhaengig von `now` (klein gehalten, damit reale Sessions unberuehrt).
      const res = runClassroomRetention({ now: AGED + DEFAULT_HARD_DELETE_MS * 2 })
      expect(getSessionById(session.id).status).toBe('running')
      expect(nameOf(j.participant.id)).toBe('Aktiv')
      expect(res.deleted).toBe(0)
    })
  })
})
