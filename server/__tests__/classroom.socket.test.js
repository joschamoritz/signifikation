/**
 * server/__tests__/classroom.socket.test.js
 *
 * Realtime-Tests fuer Classroom (T-3.1 / T-3.2 / T-3.3).
 * Mitigation fuer R-2 (Race-Conditions im Socket-Layer): die Race-Pfade
 * unter „Reconnect-Window“ sind hier explizit abgesichert.
 *
 * Test-Strategie:
 *   - Echter Socket.io-Server auf Random-Port pro Suite
 *   - reconnectWindowMs auf 200 ms gesetzt, damit Timeouts in <1 s feuern
 *   - x-dev-user-id-Header fuer Lehrer-Auth (ALLOW_DEV_AUTH=1 in vitest.setup.js)
 *   - Bearer-Token in handshake.auth.token fuer Schueler-Auth
 *   - clearAllTimers() in afterEach gegen Cross-Test-Leakage
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import { Server as IoServer } from 'socket.io'
import { io as ioClient } from 'socket.io-client'
import { randomUUID } from 'crypto'
import db from '../db.js'

// Better-Auth Session-Mock — Tests fokussieren auf Capability-Logik,
// nicht auf Cookie-Handling. Tatsaechliche Auth laeuft ueber Dev-Header.
vi.mock('../auth/index.js', () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}))

const {
  setupClassroomSocket, clearAllTimers, __getTimerCountForTests,
  pruneConnectAttempts, __seedConnectAttemptForTests, __getConnectAttemptCountForTests,
} = await import('../realtime/classroomSocket.js')
const {
  createSession,
  addAssignment,
  startSession,
  finishSession,
  joinByCode,
  revokeCapability,
  findParticipantByToken,
} = await import('../classroom/store.js')

function countActiveParticipants(sessionId) {
  return db.prepare(
    'SELECT COUNT(1) AS c FROM classroom_participant WHERE session_id = ? AND left_at IS NULL',
  ).get(sessionId).c
}

const RECONNECT_WINDOW_MS = 200
const TEACHER = `cr2-sock-teacher-${randomUUID()}`

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function cleanupTeacher(id) {
  const sessions = db.prepare(`SELECT id FROM classroom_session WHERE teacher_user_id = ?`).all(id)
  for (const s of sessions) {
    db.prepare(`DELETE FROM classroom_session WHERE id = ?`).run(s.id)
  }
}

const KOLL_SNAPSHOT = {
  byLemma: { 'lemma-1': {
    kollokatoren: [
      { wort: 'stark', rang: 1 }, { wort: 'groß', rang: 2 }, { wort: 'klein', rang: 3 },
      { wort: 'weit', rang: 4 }, { wort: 'tief', rang: 8 }, { wort: 'leise', rang: 10 },
    ],
  }},
}

/** Setzt eine vollstaendige Session inkl. Assignment + Schueler-Join auf. */
function setupSessionWithStudent() {
  const { session } = createSession({ teacherUserId: TEACHER })
  addAssignment({
    sessionId: session.id, teacherUserId: TEACHER,
    mode: 'kollokationen', lemmaIds: ['lemma-1'],
    contentSnapshot: KOLL_SNAPSHOT,
  })
  startSession({ sessionId: session.id, teacherUserId: TEACHER })
  const j = joinByCode({ code: session.code, displayName: 'Schueler' })
  return { session, participant: j.participant }
}

function connectTeacher(baseUrl, sessionId, opts = {}) {
  return ioClient(`${baseUrl}/cr2`, {
    transports: ['websocket'],
    forceNew: true,
    auth: { sessionId },
    extraHeaders: { 'x-dev-user-id': opts.teacherId || TEACHER },
    timeout: 4000,
  })
}

function connectStudent(baseUrl, token) {
  return ioClient(`${baseUrl}/cr2`, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token },
    timeout: 4000,
  })
}

/** Wartet bis Socket connected ist oder lehnt mit Fehler ab. */
function awaitConnect(socket, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), timeoutMs)
    socket.once('connect', () => { clearTimeout(timer); resolve() })
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err) })
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

describe('classroom socket (T-3.1 / T-3.2 / T-3.3)', () => {
  let server
  let io
  let baseUrl
  const openSockets = []

  beforeAll(async () => {
    ensureUser(TEACHER)
    const app = express()
    server = createServer(app)
    io = new IoServer(server, { path: '/socket.io' })
    setupClassroomSocket(io, {
      reconnectWindowMs: RECONNECT_WINDOW_MS,
      connectRateLimit:  0, // Tests sollen nicht am Rate-Limit haengen
    })
    await new Promise((resolve) => server.listen(0, resolve))
    const addr = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    clearAllTimers()
    io.close()
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  })

  beforeEach(() => {
    cleanupTeacher(TEACHER)
  })

  afterEach(async () => {
    while (openSockets.length) {
      const s = openSockets.pop()
      try { s.removeAllListeners(); s.disconnect() } catch {}
    }
    clearAllTimers()
    // Kurz warten, damit pending disconnects in der IO-Adapter-Map aufraeumen
    await sleep(20)
  })

  // ── T-3.1: Auth-Reject ─────────────────────────────────────────

  it('lehnt Connect ohne Cookie/Token ab (UNAUTHORIZED)', async () => {
    const socket = ioClient(`${baseUrl}/cr2`, {
      transports: ['websocket'],
      forceNew: true,
      timeout: 2000,
    })
    openSockets.push(socket)
    await expect(awaitConnect(socket)).rejects.toThrow(/UNAUTHORIZED/)
  })

  it('lehnt Lehrer-Connect ohne session:read-Capability ab (FORBIDDEN)', async () => {
    // Anderer User probiert, eine fremde Session zu lauschen
    const { session } = createSession({ teacherUserId: TEACHER })
    const otherTeacher = `${TEACHER}-foreign`
    ensureUser(otherTeacher)

    const socket = ioClient(`${baseUrl}/cr2`, {
      transports: ['websocket'],
      forceNew: true,
      auth: { sessionId: session.id },
      extraHeaders: { 'x-dev-user-id': otherTeacher },
      timeout: 2000,
    })
    openSockets.push(socket)
    await expect(awaitConnect(socket)).rejects.toThrow(/FORBIDDEN/)
  })

  it('lehnt Schueler-Connect ohne view:student-Capability ab (FORBIDDEN)', async () => {
    const { session, participant } = setupSessionWithStudent()
    // Capability wegnehmen — Token bleibt, Cap revoked
    revokeCapability({
      sessionId:   session.id,
      subjectKind: 'participant',
      subjectId:   participant.id,
    })

    const socket = connectStudent(baseUrl, participant.token)
    openSockets.push(socket)
    await expect(awaitConnect(socket)).rejects.toThrow(/FORBIDDEN/)
  })

  it('Lehrer mit gueltigem Grant joint Teacher-Room', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    const socket = connectTeacher(baseUrl, session.id)
    openSockets.push(socket)
    await awaitConnect(socket)
    // Connect OK — Capability greift
  })

  it('Schueler mit gueltigem Token joint Students-Room und bekommt view:updated', async () => {
    const { participant } = setupSessionWithStudent()
    const socket = connectStudent(baseUrl, participant.token)
    openSockets.push(socket)

    const view = new Promise((resolve) => socket.once('view:updated', resolve))
    await awaitConnect(socket)
    const payload = await view
    expect(payload).toMatchObject({ reason: expect.any(String) })
  })

  // ── T-3.2: Broadcasts ──────────────────────────────────────────

  it('Zwei Lehrer in derselben Session bekommen denselben Broadcast', async () => {
    const { session, participant } = setupSessionWithStudent()

    const tA = connectTeacher(baseUrl, session.id)
    const tB = connectTeacher(baseUrl, session.id)
    openSockets.push(tA, tB)
    await Promise.all([awaitConnect(tA), awaitConnect(tB)])

    const heardA = new Promise((resolve) => tA.once('student:joined', resolve))
    const heardB = new Promise((resolve) => tB.once('student:joined', resolve))

    // Importiere notify direkt — simuliert was die /join-Route tut.
    const { notifyStudentJoined } = await import('../realtime/classroomSocket.js')
    notifyStudentJoined(session.id, {
      participantId: participant.id,
      displayName:   'Schueler',
      joinedAt:      Date.now(),
    })

    const [a, b] = await Promise.all([heardA, heardB])
    expect(a.participantId).toBe(participant.id)
    expect(b.participantId).toBe(participant.id)
  })

  it('session:finished erreicht Schueler-Room', async () => {
    const { session, participant } = setupSessionWithStudent()

    const student = connectStudent(baseUrl, participant.token)
    openSockets.push(student)
    await awaitConnect(student)

    const heard = new Promise((resolve) => student.once('session:finished', resolve))
    const { notifySessionFinished } = await import('../realtime/classroomSocket.js')
    notifySessionFinished(session.id, { sessionId: session.id, finishedAt: Date.now() })

    const payload = await heard
    expect(payload.sessionId).toBe(session.id)
  })

  // ── W4-S2: Dual-Namespace (/classroom neu + /cr2 Legacy) ───────

  it('Client auf dem neuen /classroom-Namespace kann verbinden', async () => {
    const { session } = setupSessionWithStudent()
    const teacher = ioClient(`${baseUrl}/classroom`, {
      transports: ['websocket'], forceNew: true,
      auth: { sessionId: session.id },
      extraHeaders: { 'x-dev-user-id': TEACHER },
      timeout: 4000,
    })
    openSockets.push(teacher)
    await expect(awaitConnect(teacher)).resolves.toBeUndefined()
  })

  it('Broadcast erreicht Lehrer auf /classroom UND Schueler auf /cr2 (Cross-Namespace)', async () => {
    const { session, participant } = setupSessionWithStudent()

    // Lehrer auf NEUEM Namespace, Schueler auf LEGACY-Namespace — wie waehrend
    // eines Deploys (alt-gecachter Schueler-Client, frisch geladener Lehrer).
    const teacher = ioClient(`${baseUrl}/classroom`, {
      transports: ['websocket'], forceNew: true,
      auth: { sessionId: session.id },
      extraHeaders: { 'x-dev-user-id': TEACHER },
      timeout: 4000,
    })
    const student = connectStudent(baseUrl, participant.token) // /cr2
    openSockets.push(teacher, student)
    await Promise.all([awaitConnect(teacher), awaitConnect(student)])

    const teacherHeard = new Promise((resolve) => teacher.once('student:joined', resolve))
    const studentHeard = new Promise((resolve) => student.once('session:finished', resolve))

    const { notifyStudentJoined, notifySessionFinished } = await import('../realtime/classroomSocket.js')
    notifyStudentJoined(session.id, { participantId: participant.id, displayName: 'Schueler', joinedAt: Date.now() })
    notifySessionFinished(session.id, { sessionId: session.id, finishedAt: Date.now() })

    const [t, s] = await Promise.all([teacherHeard, studentHeard])
    expect(t.participantId).toBe(participant.id)
    expect(s.sessionId).toBe(session.id)
  })

  // ── T-3.3: Reconnect-Window ────────────────────────────────────

  it('Schueler-Reconnect innerhalb 300s liefert KEIN student:left an Lehrer', async () => {
    const { session, participant } = setupSessionWithStudent()

    const teacher = connectTeacher(baseUrl, session.id)
    openSockets.push(teacher)
    await awaitConnect(teacher)

    let leftCount = 0
    teacher.on('student:left', () => { leftCount++ })

    // Schueler connect → disconnect → reconnect innerhalb des Windows
    let student = connectStudent(baseUrl, participant.token)
    openSockets.push(student)
    await awaitConnect(student)
    await sleep(20)

    student.disconnect()
    // Halbiertes Window abwarten — Timer laeuft, ist aber noch nicht abgelaufen
    await sleep(RECONNECT_WINDOW_MS / 2)

    student = connectStudent(baseUrl, participant.token)
    openSockets.push(student)
    await awaitConnect(student)

    // Volles Window plus Puffer verstreichen lassen — falls der Timer NICHT
    // gecleart wurde, kaeme der student:left jetzt durch.
    await sleep(RECONNECT_WINDOW_MS + 100)
    expect(leftCount).toBe(0)
  })

  it('Schueler-Disconnect ohne Reconnect: nach Window student:left mit reason:"timeout"', async () => {
    const { session, participant } = setupSessionWithStudent()

    const teacher = connectTeacher(baseUrl, session.id)
    openSockets.push(teacher)
    await awaitConnect(teacher)

    const leftEvent = new Promise((resolve) => teacher.once('student:left', resolve))

    const student = connectStudent(baseUrl, participant.token)
    openSockets.push(student)
    await awaitConnect(student)
    student.disconnect()

    // Auf Timeout warten — Window + Puffer
    const evt = await Promise.race([
      leftEvent,
      sleep(RECONNECT_WINDOW_MS + 500).then(() => null),
    ])
    expect(evt).toBeTruthy()
    expect(evt.participantId).toBe(participant.id)
    expect(evt.reason).toBe('timeout')
  })

  it('Race: Reconnect kurz vor Timer-Feuern → Timer wird gecleart, kein left', async () => {
    const { session, participant } = setupSessionWithStudent()

    const teacher = connectTeacher(baseUrl, session.id)
    openSockets.push(teacher)
    await awaitConnect(teacher)

    let leftCount = 0
    teacher.on('student:left', () => { leftCount++ })

    let student = connectStudent(baseUrl, participant.token)
    openSockets.push(student)
    await awaitConnect(student)
    student.disconnect()

    // Knapp vor Timer-Feuern reconnecten. Bei 200ms Window sind 150ms noch
    // sicher davor (Node-Timer-Jitter typisch <10ms).
    await sleep(Math.max(0, RECONNECT_WINDOW_MS - 50))
    student = connectStudent(baseUrl, participant.token)
    openSockets.push(student)
    await awaitConnect(student)

    // Genug Zeit lassen, damit der ALTE Timer gefeuert haette
    await sleep(RECONNECT_WINDOW_MS + 200)
    expect(leftCount).toBe(0)
    // Map ist sauber — connected, kein pending timer.
    expect(__getTimerCountForTests()).toBe(0)
  })

  it('Mehrere Tabs: zweiter Tab schliessen startet KEIN left-Timer solange erster offen ist', async () => {
    const { session, participant } = setupSessionWithStudent()

    const teacher = connectTeacher(baseUrl, session.id)
    openSockets.push(teacher)
    await awaitConnect(teacher)

    let leftCount = 0
    teacher.on('student:left', () => { leftCount++ })

    const tabA = connectStudent(baseUrl, participant.token)
    const tabB = connectStudent(baseUrl, participant.token)
    openSockets.push(tabA, tabB)
    await Promise.all([awaitConnect(tabA), awaitConnect(tabB)])
    await sleep(20)

    tabB.disconnect()
    await sleep(RECONNECT_WINDOW_MS + 200)
    // tabA war die ganze Zeit offen → kein Timer, kein left
    expect(leftCount).toBe(0)
  })

  it('finishSession revoked submission:write — Socket-Connect bleibt zulaessig (D6, view:student unangetastet)', async () => {
    const { session, participant } = setupSessionWithStudent()
    finishSession({ sessionId: session.id, teacherUserId: TEACHER })

    const socket = connectStudent(baseUrl, participant.token)
    openSockets.push(socket)
    await awaitConnect(socket) // view:student wurde NICHT revoked → Connect OK
  })

  // ── W2-T5: Reconnect-Robustheit ────────────────────────────────

  describe('W2-T5 Reconnect-Robustheit', () => {
    it('Reconnect bindet denselben participant — kein Duplikat in der DB', async () => {
      const { session, participant } = setupSessionWithStudent()
      expect(countActiveParticipants(session.id)).toBe(1)

      let student = connectStudent(baseUrl, participant.token)
      openSockets.push(student)
      await awaitConnect(student)
      await sleep(20)

      // Abbruch + Wiederanmeldung mit DEMSELBEN Token, innerhalb des Windows.
      student.disconnect()
      await sleep(RECONNECT_WINDOW_MS / 2)
      student = connectStudent(baseUrl, participant.token)
      openSockets.push(student)
      await awaitConnect(student)
      await sleep(20)

      // Kein neuer Teilnehmer: weder ein zweiter classroom_participant noch
      // ein verlorener Platz. Der Token zeigt weiterhin auf dieselbe id.
      expect(countActiveParticipants(session.id)).toBe(1)
      const resolved = findParticipantByToken(participant.token)
      expect(resolved?.id).toBe(participant.id)
      expect(resolved?.leftAt).toBeFalsy()
    })

    it('Ablauf des Reconnect-Fensters entfernt den Teilnehmer endgueltig (left_at gesetzt)', async () => {
      const { session, participant } = setupSessionWithStudent()

      const student = connectStudent(baseUrl, participant.token)
      openSockets.push(student)
      await awaitConnect(student)
      await sleep(20)
      expect(countActiveParticipants(session.id)).toBe(1)

      student.disconnect()
      // Window + Puffer abwarten — Timer feuert, leaveParticipant setzt left_at.
      await sleep(RECONNECT_WINDOW_MS + 150)

      const resolved = findParticipantByToken(participant.token)
      expect(resolved?.leftAt).toBeTruthy()
      expect(countActiveParticipants(session.id)).toBe(0)
    })

    it('Reconnect NACH abgelaufenem Fenster wird abgelehnt (leftAt-Gate)', async () => {
      const { session, participant } = setupSessionWithStudent()

      let student = connectStudent(baseUrl, participant.token)
      openSockets.push(student)
      await awaitConnect(student)
      await sleep(20)

      student.disconnect()
      await sleep(RECONNECT_WINDOW_MS + 150) // endgueltig entfernt

      // Erneuter Connect-Versuch mit demselben (nun ungueltigen) Token.
      student = connectStudent(baseUrl, participant.token)
      openSockets.push(student)
      await expect(awaitConnect(student)).rejects.toThrow(/UNAUTHORIZED/)
      // Session-Konsistenz: weiterhin niemand aktiv.
      expect(countActiveParticipants(session.id)).toBe(0)
    })
  })
})

describe('connectAttempts-Pruning (Memory-Leak-Schutz)', () => {
  it('entfernt abgelaufene Fenster, behaelt frische', () => {
    clearAllTimers() // leert auch connectAttempts
    const now = Date.now()
    __seedConnectAttemptForTests('10.0.0.1', now - 10 * 60_000) // abgelaufen
    __seedConnectAttemptForTests('10.0.0.2', now - 9 * 60_000)  // abgelaufen
    __seedConnectAttemptForTests('10.0.0.3', now - 1_000)       // frisch
    expect(__getConnectAttemptCountForTests()).toBe(3)

    const pruned = pruneConnectAttempts(now)

    expect(pruned).toBe(2)
    expect(__getConnectAttemptCountForTests()).toBe(1)
    clearAllTimers()
  })
})
