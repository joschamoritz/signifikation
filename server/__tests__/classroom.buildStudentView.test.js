/**
 * Isolierter Unit-Test für buildStudentView() (server/classroom/store.js).
 *
 * Hintergrund (Architektur-Review 2026-07-24): buildStudentView setzt die
 * wichtigste Sicherheitsinvariante der App durch (R1) — Schüler:innen dürfen
 * NIEMALS Lösungsdaten sehen (rang, periode, zuordnung, kollokator). Die
 * Funktion lag bisher in server/routes/classroom.js (Transport-Schicht) und
 * hatte NUR Integrationstests über HTTP (classroom.routes.test.js, T-6.4).
 * Dieser Test prüft die Whitelist-Invariante direkt an der Funktion, ohne
 * Express/HTTP — verschoben in die Domänenschicht (classroom/store.js).
 *
 * classroom.routes.test.js bleibt als End-to-End-Regressionsschutz bestehen.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import db from '../db.js'
import { randomUUID } from 'crypto'
import {
  createSession,
  addAssignment,
  joinByCode,
  getSessionById,
  buildStudentView,
  buildSafePrompt,
} from '../classroom/store.js'

const TEACHER = `test-bsv-teacher-${randomUUID()}`

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function cleanup() {
  const sessions = db.prepare(`SELECT id FROM classroom_session WHERE teacher_user_id = ?`).all(TEACHER)
  for (const s of sessions) db.prepare(`DELETE FROM classroom_session WHERE id = ?`).run(s.id)
}

const insertSubmissionStmt = db.prepare(`
  INSERT INTO classroom_submission
    (id, session_id, assignment_id, participant_id, lemma_id, round_index, raw_answer, submitted_at, client_ms)
  VALUES (@id, @session_id, @assignment_id, @participant_id, @lemma_id, @round_index, @raw_answer, @submitted_at, @client_ms)
`)

function insertSubmission({ sessionId, assignmentId, participantId, lemmaId, roundIndex = 0 }) {
  insertSubmissionStmt.run({
    id: randomUUID(),
    session_id: sessionId,
    assignment_id: assignmentId,
    participant_id: participantId,
    lemma_id: lemmaId,
    round_index: roundIndex,
    raw_answer: '{}',
    submitted_at: Date.now(),
    client_ms: null,
  })
}

// Snapshots im echten content_snapshot-Format (byLemma), inkl. der Felder,
// die buildSafePrompt/buildStudentView NIEMALS an Schüler:innen ausliefern
// dürfen (rang, periode, zuordnung, kollokator).
const KOLLOKATIONEN_SNAPSHOT = {
  byLemma: {
    'lemma-koll': {
      lemma: 'stark', ipa: '', definition: '',
      kollokatoren: [
        { wort: 'Kaffee', rang: 1, log_dice: 9.5 },
        { wort: 'Motor',  rang: 2, log_dice: 8.1 },
      ],
    },
  },
}

const ZEITENWENDE_SNAPSHOT = {
  byLemma: {
    'lemma-zw': {
      lemma: 'Postkutsche', ipa: '', definition: '',
      words: [
        { wort: 'Postkutsche', periode: 'pre' },
        { wort: 'Smartphone',  periode: 'post' },
      ],
    },
  },
}

const WORTZWILLING_SNAPSHOT = {
  byLemma: {
    'wz:test-pair': {
      lemma: 'groß ↔ klein', ipa: '', definition: '',
      wortA: 'groß', wortB: 'klein',
      kollokatoren: [
        { wort: 'Haus',    zuordnung: 'A' },
        { wort: 'Wohnung', zuordnung: 'B' },
      ],
    },
  },
}

const LUECKENFUELLER_SNAPSHOT = {
  byLemma: {
    'lemma-lf': {
      lemma: 'stark', ipa: '', definition: '',
      rounds: [
        { type: 'choice', satzMitLuecke: 'Der Kaffee ist sehr ___.', optionen: ['stark', 'schwach'], kollokator: 'stark' },
        { type: 'free',   satzMitLuecke: 'Der Motor ist sehr ___.',  kollokator: 'stark' },
      ],
    },
  },
}

describe('classroom/store buildStudentView (R1-Whitelist, isoliert von HTTP)', () => {
  let sessionId
  let teacherUserId
  let participant
  let session

  beforeAll(() => {
    ensureUser(TEACHER)
  })
  beforeEach(() => {
    cleanup()
    teacherUserId = TEACHER
    const created = createSession({ teacherUserId, title: 'BSV-Test' })
    sessionId = created.session.id
    session = getSessionById(sessionId)
    const joined = joinByCode({ code: created.session.code, displayName: 'Test-Schüler' })
    participant = joined.participant
  })

  it('Kollokationen: liefert niemals rang/log_dice, nur Wort-Strings', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'kollokationen', lemmaIds: ['lemma-koll'],
      contentSnapshot: KOLLOKATIONEN_SNAPSHOT,
    })
    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    const json = JSON.stringify(view)
    expect(json).not.toContain('rang')
    expect(json).not.toContain('log_dice')
    expect(view.currentLemma.prompt.words).toEqual(expect.arrayContaining(['Kaffee', 'Motor']))
  })

  it('Zeitenwende: liefert niemals periode, nur Wort-Strings', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'zeitenwende', lemmaIds: ['lemma-zw'],
      contentSnapshot: ZEITENWENDE_SNAPSHOT,
    })
    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    const json = JSON.stringify(view)
    expect(json).not.toContain('periode')
    expect(json).not.toContain('pre')
    expect(json).not.toContain('post')
    expect(view.currentLemma.prompt.words).toEqual(expect.arrayContaining(['Postkutsche', 'Smartphone']))
  })

  it('Wort-Zwilling: liefert wortA/wortB + Wort-Strings, niemals zuordnung', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'wortzwilling', lemmaIds: ['wz:test-pair'],
      contentSnapshot: WORTZWILLING_SNAPSHOT,
    })
    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    const json = JSON.stringify(view)
    expect(json).not.toContain('zuordnung')
    expect(view.currentLemma.prompt.wortA).toBe('groß')
    expect(view.currentLemma.prompt.wortB).toBe('klein')
    expect(view.currentLemma.prompt.words).toEqual(expect.arrayContaining(['Haus', 'Wohnung']))
  })

  it('Lückenfüller: liefert niemals kollokator und niemals alle Runden auf einmal', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'lueckenfueller', lemmaIds: ['lemma-lf'],
      contentSnapshot: LUECKENFUELLER_SNAPSHOT,
    })
    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    const json = JSON.stringify(view)
    expect(json).not.toContain('kollokator')
    // Nur currentRound, das komplette rounds-Array darf nicht mitgeliefert werden.
    expect(view.currentLemma.prompt.rounds).toBeUndefined()
    expect(view.currentLemma.prompt.currentRound).toMatchObject({ type: 'choice', options: ['stark', 'schwach'] })
    expect(view.currentLemma.prompt.roundIndex).toBe(0)
  })

  it('zeigt das nächste offene Lemma und markiert bereits abgegebene als erledigt', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'kollokationen',
      lemmaIds: ['lemma-koll', 'lemma-koll-2'],
      contentSnapshot: {
        byLemma: {
          'lemma-koll':   KOLLOKATIONEN_SNAPSHOT.byLemma['lemma-koll'],
          'lemma-koll-2': { lemma: 'schnell', ipa: '', definition: '', kollokatoren: [{ wort: 'Auto', rang: 1 }] },
        },
      },
    })
    insertSubmission({ sessionId, assignmentId: assignment.id, participantId: participant.id, lemmaId: 'lemma-koll' })

    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    expect(view.currentLemma.id).toBe('lemma-koll-2')
    expect(view.progress).toEqual({ submittedCount: 1, totalLemmata: 2, done: false })
  })

  it('progress.done ist true und currentLemma ist null, wenn alle Lemmata abgegeben sind', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'kollokationen', lemmaIds: ['lemma-koll'],
      contentSnapshot: KOLLOKATIONEN_SNAPSHOT,
    })
    insertSubmission({ sessionId, assignmentId: assignment.id, participantId: participant.id, lemmaId: 'lemma-koll' })

    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    expect(view.currentLemma).toBeNull()
    expect(view.progress).toEqual({ submittedCount: 1, totalLemmata: 1, done: true })
  })

  it('GF-4: Lückenfüller-Lemma ohne Runden gilt als erledigt und wird übersprungen', () => {
    const { assignment } = addAssignment({
      sessionId, teacherUserId, mode: 'lueckenfueller',
      lemmaIds: ['lemma-leer', 'lemma-lf'],
      contentSnapshot: {
        byLemma: {
          'lemma-leer': { lemma: 'leer', ipa: '', definition: '', rounds: [] },
          'lemma-lf':   LUECKENFUELLER_SNAPSHOT.byLemma['lemma-lf'],
        },
      },
    })
    const view = buildStudentView(participant, session, assignment, { index: 0, total: 1 })
    // lemma-leer wird als erledigt gezaehlt, obwohl nie eingereicht wurde
    expect(view.currentLemma.id).toBe('lemma-lf')
    expect(view.progress.submittedCount).toBe(1)
  })

  it('buildSafePrompt liefert {} für ein leeres/fehlendes Snapshot statt zu crashen', () => {
    expect(buildSafePrompt('kollokationen', null)).toEqual({})
    expect(buildSafePrompt('kollokationen', undefined)).toEqual({})
    expect(buildSafePrompt('unbekannter-modus', { kollokatoren: [] })).toEqual({})
  })
})
