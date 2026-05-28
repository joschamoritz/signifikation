/**
 * server/__tests__/classroom-v2.routes.test.js
 *
 * Integration-Tests fuer den Classroom v2 API-Layer (T-2.1 bis T-2.10).
 *
 * Teststrategie (analog classroom.routes.test.js):
 *   - Echter SQLite (keine Mocks)
 *   - Dev-Header-Auth (x-dev-user-id / x-dev-user-role, ALLOW_DEV_AUTH=1 in vitest.setup.js)
 *   - Minimaler Express-App-Setup per Suite, Server auf Random-Port
 *
 * Abgedeckt:
 *   T-6.3  Happy-Path E2E: Teacher anlegen → Assignment → Start → Join →
 *            View → Submit → Finish
 *   T-6.4  Audit-Test /me/view Whitelist: kein notiz, rang, periode,
 *            zuordnung, kollokator, content_snapshot, raw_answer, notiz
 */

import express from 'express'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { randomUUID } from 'crypto'
import db from '../db.js'
import classroomV2Router from '../routes/classroom-v2.js'
import { createSession } from '../classroom-v2/store.js'

// ── Test-Infrastruktur ─────────────────────────────────────────

/** Lehrer-Header fuer Dev-Auth (ALLOW_DEV_AUTH=1 in vitest.setup.js) */
function teacherHeaders(id, role = 'admin') {
  return {
    'x-dev-user-id':   id,
    'x-dev-user-role': role,
    'content-type':    'application/json',
    // x-forwarded-for damit Rate-Limiter nicht null-Key generiert
    'x-forwarded-for': '127.0.0.1',
  }
}

/** Bearer-Header fuer Participant-Auth */
function participantHeaders(token) {
  return {
    authorization:     `Bearer ${token}`,
    'content-type':    'application/json',
    'x-forwarded-for': '127.0.0.1',
  }
}

/** User in DB anlegen (noetig fuer FK cr2_session.teacher_user_id) */
function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

/** Löscht alle cr2_session-Zeilen eines Lehrers (kaskadiert auf cr2_*) */
function cleanupTeacher(id) {
  const sessions = db.prepare('SELECT id FROM cr2_session WHERE teacher_user_id = ?').all(id)
  for (const s of sessions) {
    db.prepare('DELETE FROM cr2_session WHERE id = ?').run(s.id)
  }
}

/**
 * Legt ein Lemma in der lemmata-Tabelle an, das fuer Kollokationen-Tests
 * genutzt werden kann. Gibt die ID zurueck.
 */
function insertTestLemma(suffix = '') {
  const id = `test-lemma-${suffix || randomUUID()}`
  // Kollokatoren mit rang fuer Scoring-Tests
  const runden = JSON.stringify({
    kollokatoren: [
      { wort: 'stark', rang: 1 },
      { wort: 'groß',  rang: 2 },
      { wort: 'klein', rang: 3 },
      { wort: 'weit',  rang: 4 },
      { wort: 'hoch',  rang: 6 },
      { wort: 'tief',  rang: 8 },
      { wort: 'laut',  rang: 9 },
      { wort: 'leise', rang: 10 },
    ],
    notiz: 'GEHEIM – darf Schueler NIEMALS sehen',
  })
  db.prepare(`
    INSERT OR REPLACE INTO lemmata
      (id, lemma, pos, wortart, runden, rundenInfo, notiz, link, definition, ipa, definitionen)
    VALUES
      (?, 'Wasser', 'Substantiv', 'Substantiv', ?, '[]',
       'NOTIZ-INTERN-GEHEIM', '', 'H₂O-Verbindung', 'ˈvasɐ', '["H₂O-Verbindung"]')
  `).run(id, runden)
  return id
}

/**
 * Lemma fuer Wortzwilling-Tests.
 * runden.wortzwilling.kollokatoren enthaelt {wort, zuordnung} — zuordnung darf NIEMALS geleakt werden.
 */
function insertTestLemmaWortzwilling(suffix = '') {
  const id = `test-lemma-wz-${suffix || randomUUID()}`
  const runden = JSON.stringify({
    wortzwilling: {
      wortA: 'Wasser',
      wortB: 'Feuer',
      kollokatoren: [
        { wort: 'fließen', zuordnung: 'A' },
        { wort: 'brennen', zuordnung: 'B' },
        { wort: 'klar',    zuordnung: 'A' },
        { wort: 'heiß',    zuordnung: 'B' },
      ],
    },
  })
  db.prepare(`
    INSERT OR REPLACE INTO lemmata
      (id, lemma, pos, wortart, runden, rundenInfo, notiz, link, definition, ipa, definitionen)
    VALUES
      (?, 'Wasser', 'Substantiv', 'Substantiv', ?, '[]',
       'WZ-INTERN-GEHEIM', '', 'H₂O-Verbindung', 'ˈvasɐ', '["H₂O-Verbindung"]')
  `).run(id, runden)
  return id
}

/**
 * Lemma fuer Zeitenwende-Tests.
 * runden.zeitenwende.words enthaelt {wort, periode} — periode darf NIEMALS geleakt werden.
 */
function insertTestLemmaZeitenwende(suffix = '') {
  const id = `test-lemma-zw-${suffix || randomUUID()}`
  const runden = JSON.stringify({
    zeitenwende: {
      words: [
        { wort: 'digital', periode: 'post' },
        { wort: 'analog',  periode: 'pre'  },
        { wort: 'Netz',    periode: 'post' },
      ],
    },
  })
  db.prepare(`
    INSERT OR REPLACE INTO lemmata
      (id, lemma, pos, wortart, runden, rundenInfo, notiz, link, definition, ipa, definitionen)
    VALUES
      (?, 'Digital', 'Adjektiv', 'Adjektiv', ?, '[]',
       'ZW-INTERN-GEHEIM', '', 'Digitale Epoche', 'diˈɡiːtaːl', '["Digitale Epoche"]')
  `).run(id, runden)
  return id
}

/**
 * Lemma fuer Lueckenfueller-Tests.
 * lueckenfueller.rounds[*].kollokator darf NIEMALS geleakt werden.
 */
function insertTestLemmaLueckenfueller(suffix = '') {
  const id = `test-lemma-lf-${suffix || randomUUID()}`
  const runden = JSON.stringify({})
  const lueckenfueller = JSON.stringify({
    rounds: [
      {
        type:      'choice',
        sentence:  'Das Wasser fließt ___.',
        kollokator: 'sanft',
        punkte:    3,
        options:   ['sanft', 'laut', 'trocken', 'still'],
      },
    ],
  })
  db.prepare(`
    INSERT OR REPLACE INTO lemmata
      (id, lemma, pos, wortart, runden, rundenInfo, notiz, link, definition, ipa, definitionen, lueckenfueller)
    VALUES
      (?, 'Fluss', 'Substantiv', 'Substantiv', ?, '[]',
       'LF-INTERN-GEHEIM', '', 'Fließendes Gewässer', 'flʊs', '["Fließendes Gewässer"]', ?)
  `).run(id, runden, lueckenfueller)
  return id
}

// ── Server-Setup ───────────────────────────────────────────────

describe('classroom-v2 routes', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    // Minimal CSRF-Bypass fuer Tests (kein csrfProtect in Test-App)
    app.use('/', classroomV2Router)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })
    const addr = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
  })

  // ── T-6.3 Happy-Path ─────────────────────────────────────────

  describe('T-6.3 Happy-Path E2E', () => {
    const TEACHER_ID = `cr2-teacher-hp-${randomUUID()}`
    let lemmaId
    let sessionId
    let sessionCode
    let assignmentId
    let participantToken
    let participantId

    beforeAll(() => {
      ensureUser(TEACHER_ID)
      lemmaId = insertTestLemma('hp')
    })
    afterAll(() => cleanupTeacher(TEACHER_ID))

    it('T-2.1 Teacher legt Session an → 201 { id, code, status }', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ title: 'Happy-Path-Test' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.id).toBeTruthy()
      expect(body.code).toBeTruthy()
      expect(body.status).toBe('lobby')
      sessionId   = body.id
      sessionCode = body.code
    })

    it('T-2.3 Lemmata-Picker liefert items (kein notiz)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/lemmata?q=Wasser&limit=5`, {
        headers: teacherHeaders(TEACHER_ID),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.items)).toBe(true)
      // Sicherheitsprüfung: kein notiz-Feld in items
      for (const item of body.items) {
        expect(item).not.toHaveProperty('notiz')
        expect(item).not.toHaveProperty('runden')
        expect(item).not.toHaveProperty('rundenInfo')
        expect(item).not.toHaveProperty('lueckenfueller')
      }
    })

    it('T-2.2 Assignment hinzufügen → 201 { id, mode, lemmaCount }', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'kollokationen', lemmaIds: [lemmaId] }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.id).toBeTruthy()
      expect(body.mode).toBe('kollokationen')
      expect(body.lemmaCount).toBe(1)
      assignmentId = body.id
    })

    it('T-2.2 Zweites Assignment abgelehnt (D2: max 1)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'kollokationen', lemmaIds: [lemmaId] }),
      })
      expect(res.status).toBe(409)
    })

    it('T-2.4 Session starten → 200 { status, startedAt }', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/start`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('running')
      expect(body.startedAt).toBeTruthy()
    })

    it('T-2.5 Schüler tritt bei → 201 { participantId, token, sessionId }', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
        body: JSON.stringify({ code: sessionCode, displayName: 'MaxMuster' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.participantId).toBeTruthy()
      expect(body.token).toBeTruthy()
      expect(body.sessionId).toBe(sessionId)
      participantToken = body.token
      participantId    = body.participantId
    })

    it('T-2.6 /me/view liefert whitelistete Ansicht', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: participantHeaders(participantToken),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.sessionId).toBe(sessionId)
      expect(body.assignment?.mode).toBe('kollokationen')
      expect(body.currentLemma).toBeTruthy()
      expect(body.progress.totalLemmata).toBe(1)
    })

    it('T-2.7 Submit → Score server-seitig berechnet', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/submit`, {
        method: 'POST',
        headers: participantHeaders(participantToken),
        body: JSON.stringify({
          assignmentId,
          lemmaId,
          roundIndex: 0,
          rawAnswer: { selected: ['stark', 'groß', 'klein'] },
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(typeof body.score).toBe('number')
      expect(typeof body.maxScore).toBe('number')
      expect(body.score).toBeGreaterThanOrEqual(0)
      // stark/groß/klein sind rang 1/2/3 → alle Top-3 → Bonus → 10 Punkte
      expect(body.score).toBe(10)
    })

    it('T-2.7 idempotent: nochmaliger Submit liefert gleichen Score', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/submit`, {
        method: 'POST',
        headers: participantHeaders(participantToken),
        body: JSON.stringify({
          assignmentId,
          lemmaId,
          roundIndex: 0,
          rawAnswer: { selected: ['stark', 'groß', 'klein'] },
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(10)
    })

    it('T-2.8 Heartbeat → { ok: true, status }', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/heartbeat`, {
        method: 'POST',
        headers: participantHeaders(participantToken),
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.status).toBe('running')
    })

    it('T-2.9 Dashboard liefert aggregierte Daten (kein Leaderboard)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/dashboard`, {
        headers: teacherHeaders(TEACHER_ID),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.session).toBeTruthy()
      expect(body.assignment).toBeTruthy()
      expect(Array.isArray(body.participants)).toBe(true)
      expect(body.aggregate?.perLemma).toBeTruthy()
      // KEIN Leaderboard, keine individuellen Antworten
      expect(body).not.toHaveProperty('leaderboard')
      for (const p of body.participants) {
        expect(p).not.toHaveProperty('score')
        expect(p).not.toHaveProperty('answers')
      }
    })

    it('T-2.10 Sessions-Liste enthält die angelegte Session', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
        headers: teacherHeaders(TEACHER_ID),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.sessions)).toBe(true)
      expect(body.sessions.some(s => s.id === sessionId)).toBe(true)
    })

    it('T-2.4 Session beenden → 200 { status: finished }', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/finish`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('finished')
    })

    it('T-2.7 Submit nach Finish abgelehnt (submission:write revoked)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/submit`, {
        method: 'POST',
        headers: participantHeaders(participantToken),
        body: JSON.stringify({
          assignmentId,
          lemmaId,
          roundIndex: 1,
          rawAnswer: { selected: ['stark'] },
        }),
      })
      // requireCapability('submission:write') blockiert nach revoke
      expect(res.status).toBe(403)
    })

    it('T-2.10 Schüler verlässt Session → 204', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/leave`, {
        method: 'POST',
        headers: participantHeaders(participantToken),
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(204)
    })
  })

  // ── T-6.4 Audit-Test: /me/view Whitelist ─────────────────────
  //
  // Dieser Test ist Pflicht-Mitigation fuer R1 (Felder-Leak).
  // Die getesteten Felder dürfen NIEMALS in der API-Response erscheinen,
  // auch wenn sie tief verschachtelt oder umbenannt sind.

  describe('T-6.4 Audit: /me/view darf keine internen Felder leaken', () => {
    const TEACHER_ID = `cr2-teacher-audit-${randomUUID()}`
    let lemmaId
    let sessionId
    let sessionCode
    let participantToken
    let viewBody

    beforeAll(async () => {
      ensureUser(TEACHER_ID)
      lemmaId = insertTestLemma('audit')

      // Session anlegen + Assignment + Start + Join (in-Prozess für Geschwindigkeit)
      const sess = createSession({ teacherUserId: TEACHER_ID, title: 'Audit-Test' })
      sessionId   = sess.session.id
      sessionCode = sess.session.code

      // Assignment mit Snapshot der sensitiven Daten erzwingen
      await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'kollokationen', lemmaIds: [lemmaId] }),
      })
      await fetch(`${baseUrl}/api/v1/classroom/sessions/${sessionId}/start`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      const joinRes = await fetch(`${baseUrl}/api/v1/classroom/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
        body: JSON.stringify({ code: sessionCode }),
      })
      const joined = await joinRes.json()
      participantToken = joined.token

      const viewRes = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: participantHeaders(participantToken),
      })
      viewBody = await viewRes.json()
    })

    afterAll(() => cleanupTeacher(TEACHER_ID))

    function flatten(obj, prefix = '') {
      const result = {}
      for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          Object.assign(result, flatten(v, key))
        } else if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            if (typeof v[i] === 'object' && v[i] !== null) {
              Object.assign(result, flatten(v[i], `${key}[${i}]`))
            } else {
              result[`${key}[${i}]`] = v[i]
            }
          }
          result[key] = v
        } else {
          result[key] = v
        }
      }
      return result
    }

    it('response hat eine valide Struktur', () => {
      expect(viewBody).toHaveProperty('sessionId')
      expect(viewBody).toHaveProperty('assignment')
      expect(viewBody).toHaveProperty('progress')
    })

    it('NIEMALS: notiz (interne Redaktionsnotiz)', () => {
      const json = JSON.stringify(viewBody)
      // Wert des notiz-Felds aus insertTestLemma
      expect(json).not.toContain('NOTIZ-INTERN-GEHEIM')
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k === 'notiz' || k.endsWith('.notiz'))).toBe(false)
    })

    it('NIEMALS: rang (verrät Kollokationen-Ranking → Antwort)', () => {
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k === 'rang' || k.endsWith('.rang'))).toBe(false)
    })

    it('NIEMALS: periode (verrät Zeitenwende-Lösung)', () => {
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k === 'periode' || k.endsWith('.periode'))).toBe(false)
    })

    it('NIEMALS: zuordnung (verrät Wort-Zwilling-Zone)', () => {
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k === 'zuordnung' || k.endsWith('.zuordnung'))).toBe(false)
    })

    it('NIEMALS: kollokator (verrät Lückenfüller-Antwort)', () => {
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k === 'kollokator' || k.endsWith('.kollokator'))).toBe(false)
    })

    it('NIEMALS: content_snapshot (kompletter Rohsnapshot)', () => {
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k.includes('content_snapshot') || k.includes('contentSnapshot'))).toBe(false)
    })

    it('NIEMALS: raw_answer / rawAnswer anderer Teilnehmer', () => {
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k.includes('raw_answer') || k.includes('rawAnswer'))).toBe(false)
    })

    it('NIEMALS: andere Lemmata der Session in der Antwort', () => {
      // Es gibt nur 1 Lemma, aber sicherstellen dass lemmaIds-Array nicht exponiert
      const flat = flatten(viewBody)
      const keys = Object.keys(flat)
      expect(keys.some(k => k === 'lemmaIds' || k.endsWith('.lemmaIds'))).toBe(false)
    })
  })

  // ── Auth-Tests ────────────────────────────────────────────────

  describe('Auth-Schutz', () => {
    it('POST /sessions ohne Auth → 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(401)
    })

    it('/me/view ohne Bearer → 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })
      expect(res.status).toBe(401)
    })

    it('/me/view mit ungültigem Token → 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: participantHeaders('bogus-token-xyz'),
      })
      expect(res.status).toBe(401)
    })

    it('POST /join mit ungültigem Code → 404', async () => {
      const res = await fetch(`${baseUrl}/api/v1/classroom/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
        body: JSON.stringify({ code: 'ungueltig-xyz', displayName: 'Test' }),
      })
      expect(res.status).toBe(404)
    })
  })

  // ── Validierungs-Tests ─────────────────────────────────────────

  describe('Schema-Validierung', () => {
    const TEACHER_ID = `cr2-teacher-val-${randomUUID()}`

    beforeAll(() => ensureUser(TEACHER_ID))

    it('POST /sessions/:id/assignments mit >3 Lemmata → 400', async () => {
      // Echte Session anlegen
      const sessRes = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      const sess = await sessRes.json()

      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sess.id}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'kollokationen', lemmaIds: ['a', 'b', 'c', 'd'] }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/3/)
      cleanupTeacher(TEACHER_ID)
    })

    it('POST /sessions/:id/assignments ohne Lemmata → 400', async () => {
      const sessRes = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      const sess = await sessRes.json()

      const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/${sess.id}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'kollokationen', lemmaIds: [] }),
      })
      expect(res.status).toBe(400)
      cleanupTeacher(TEACHER_ID)
    })

    it('R6: cr2SubmitSchema hat kein score-Feld — schickt man es mit, wird es ignoriert', async () => {
      // Score vom Client soll NIEMALS akzeptiert werden (D13/R6).
      // Wir koennen das direkt auf Schema-Ebene prüfen, indem wir schauen,
      // dass das Schema mit einem score-Feld trotzdem valid parsed (Zod
      // ignoriert unbekannte Keys per default) — das ist OK, da der
      // Handler/Store den score nie liest.
      // Direkter Beweis via E2E-Submit mit manipuliertem score → echter
      // Score-Berechnung wird genutzt (Happy-Path-Test belegt das mit score=10)
      // Hier: Schema-Import pruefen
      const { cr2SubmitSchema } = await import('../middleware/validate.js')
      const result = cr2SubmitSchema.safeParse({
        assignmentId: 'x',
        lemmaId: 'y',
        rawAnswer: { selected: [] },
        score: 9999,  // manipulierter Score
      })
      // Schema parsed valide (Zod strippt unbekannte Keys nicht per default,
      // aber der Handler liest result.data.score nie aus)
      expect(result.success).toBe(true)
      expect(result.data).not.toHaveProperty('score')  // score nicht im Schema definiert
    })
  })

  // ── T-6.4 Audit-Erweiterung: Wortzwilling ────────────────────

  describe('T-6.4 Audit /me/view — Modus wortzwilling (kein zuordnung-Leak)', () => {
    const TEACHER_ID = `cr2-teacher-audit-wz-${randomUUID()}`
    let viewBody

    beforeAll(async () => {
      ensureUser(TEACHER_ID)
      const lemmaId = insertTestLemmaWortzwilling('wz')
      const { session } = createSession({ teacherUserId: TEACHER_ID, title: 'Audit-WZ' })

      await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'wortzwilling', lemmaIds: [lemmaId] }),
      })
      await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/start`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      const joinRes = await fetch(`${baseUrl}/api/v1/classroom/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.1.1' },
        body: JSON.stringify({ code: session.code }),
      })
      const { token } = await joinRes.json()
      const viewRes = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: participantHeaders(token),
      })
      viewBody = await viewRes.json()
    })

    afterAll(() => cleanupTeacher(TEACHER_ID))

    function flatKeys(obj, prefix = '') {
      const result = {}
      for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          Object.assign(result, flatKeys(v, key))
        } else if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            if (typeof v[i] === 'object' && v[i] !== null) Object.assign(result, flatKeys(v[i], `${key}[${i}]`))
            else result[`${key}[${i}]`] = v[i]
          }
          result[key] = v
        } else {
          result[key] = v
        }
      }
      return result
    }

    it('response hat valide Struktur und mode=wortzwilling', () => {
      expect(viewBody.assignment?.mode).toBe('wortzwilling')
    })

    it('NIEMALS: zuordnung (verrät Wort-Zwilling-Zone → Antwort)', () => {
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k === 'zuordnung' || k.endsWith('.zuordnung'))).toBe(false)
      expect(JSON.stringify(viewBody)).not.toContain('zuordnung')
    })

    it('NIEMALS: rang in Wortzwilling-Antwort', () => {
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k === 'rang' || k.endsWith('.rang'))).toBe(false)
    })

    it('NIEMALS: content_snapshot in Antwort', () => {
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k.includes('content_snapshot') || k.includes('contentSnapshot'))).toBe(false)
    })

    it('NIEMALS: notiz-Wert in Antwort', () => {
      expect(JSON.stringify(viewBody)).not.toContain('WZ-INTERN-GEHEIM')
    })

    it('Whitelist: wortA und wortB sind vorhanden (erlaubte Felder)', () => {
      // Diese Felder DARF der Schüler sehen
      const json = JSON.stringify(viewBody)
      expect(json).toContain('wortA')
    })
  })

  // ── T-6.4 Audit-Erweiterung: Zeitenwende ─────────────────────

  describe('T-6.4 Audit /me/view — Modus zeitenwende (kein periode-Leak)', () => {
    const TEACHER_ID = `cr2-teacher-audit-zw-${randomUUID()}`
    let viewBody

    beforeAll(async () => {
      ensureUser(TEACHER_ID)
      const lemmaId = insertTestLemmaZeitenwende('zw')
      const { session } = createSession({ teacherUserId: TEACHER_ID, title: 'Audit-ZW' })

      await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'zeitenwende', lemmaIds: [lemmaId] }),
      })
      await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/start`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      const joinRes = await fetch(`${baseUrl}/api/v1/classroom/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.2.1' },
        body: JSON.stringify({ code: session.code }),
      })
      const { token } = await joinRes.json()
      const viewRes = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: participantHeaders(token),
      })
      viewBody = await viewRes.json()
    })

    afterAll(() => cleanupTeacher(TEACHER_ID))

    function flatKeys(obj, prefix = '') {
      const result = {}
      for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          Object.assign(result, flatKeys(v, key))
        } else if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            if (typeof v[i] === 'object' && v[i] !== null) Object.assign(result, flatKeys(v[i], `${key}[${i}]`))
            else result[`${key}[${i}]`] = v[i]
          }
          result[key] = v
        } else {
          result[key] = v
        }
      }
      return result
    }

    it('response hat valide Struktur und mode=zeitenwende', () => {
      expect(viewBody.assignment?.mode).toBe('zeitenwende')
    })

    it('NIEMALS: periode (verrät Zeitenwende-Lösung → Antwort)', () => {
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k === 'periode' || k.endsWith('.periode'))).toBe(false)
      expect(JSON.stringify(viewBody)).not.toContain('periode')
    })

    it('NIEMALS: content_snapshot in Antwort', () => {
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k.includes('content_snapshot') || k.includes('contentSnapshot'))).toBe(false)
    })

    it('NIEMALS: notiz-Wert in Antwort', () => {
      expect(JSON.stringify(viewBody)).not.toContain('ZW-INTERN-GEHEIM')
    })

    it('Whitelist: words-Array ist vorhanden aber ohne periode', () => {
      // Der Schüler sieht die Wörter — aber nicht ihre Epoche
      const json = JSON.stringify(viewBody)
      expect(json).toContain('digital')
      expect(json).not.toContain('post')
      expect(json).not.toContain('"pre"')
    })
  })

  // ── T-6.4 Audit-Erweiterung: Lückenfüller ────────────────────

  describe('T-6.4 Audit /me/view — Modus lueckenfueller (kein kollokator-Leak)', () => {
    const TEACHER_ID = `cr2-teacher-audit-lf-${randomUUID()}`
    let viewBody

    beforeAll(async () => {
      ensureUser(TEACHER_ID)
      const lemmaId = insertTestLemmaLueckenfueller('lf')
      const { session } = createSession({ teacherUserId: TEACHER_ID, title: 'Audit-LF' })

      await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/assignments`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({ mode: 'lueckenfueller', lemmaIds: [lemmaId] }),
      })
      await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/start`, {
        method: 'POST',
        headers: teacherHeaders(TEACHER_ID),
        body: JSON.stringify({}),
      })
      const joinRes = await fetch(`${baseUrl}/api/v1/classroom/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.3.1' },
        body: JSON.stringify({ code: session.code }),
      })
      const { token } = await joinRes.json()
      const viewRes = await fetch(`${baseUrl}/api/v1/classroom/me/view`, {
        headers: participantHeaders(token),
      })
      viewBody = await viewRes.json()
    })

    afterAll(() => cleanupTeacher(TEACHER_ID))

    function flatKeys(obj, prefix = '') {
      const result = {}
      for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          Object.assign(result, flatKeys(v, key))
        } else if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            if (typeof v[i] === 'object' && v[i] !== null) Object.assign(result, flatKeys(v[i], `${key}[${i}]`))
            else result[`${key}[${i}]`] = v[i]
          }
          result[key] = v
        } else {
          result[key] = v
        }
      }
      return result
    }

    it('response hat valide Struktur und mode=lueckenfueller', () => {
      expect(viewBody.assignment?.mode).toBe('lueckenfueller')
    })

    it('NIEMALS: kollokator als Feld-Name (verrät Lückenfüller-Antwort)', () => {
      // Das Feld "kollokator" selbst darf nicht in der Response erscheinen.
      // HINWEIS: Der Wert der korrekten Antwort ("sanft") darf in options[] stehen —
      // buildSafeRound() gibt absichtlich alle Auswahloptionen inkl. korrekter weiter,
      // weil der Schüler sonst nicht wählen könnte. Das ist keine Leck-Situation.
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k === 'kollokator' || k.endsWith('.kollokator'))).toBe(false)
      // Sicherstellen, dass "kollokator" nicht als Property-Name in der JSON-Response steht
      expect(JSON.stringify(viewBody)).not.toMatch(/"kollokator"\s*:/)
    })

    it('NIEMALS: content_snapshot in Antwort', () => {
      const keys = Object.keys(flatKeys(viewBody))
      expect(keys.some(k => k.includes('content_snapshot') || k.includes('contentSnapshot'))).toBe(false)
    })

    it('NIEMALS: alle Runden im rounds-Array (nur aktuelle Runde)', () => {
      // buildStudentView: delete safePrompt.rounds → nur currentRound
      const json = JSON.stringify(viewBody)
      expect(viewBody.currentLemma?.rounds).toBeUndefined()
    })

    it('NIEMALS: notiz-Wert in Antwort', () => {
      expect(JSON.stringify(viewBody)).not.toContain('LF-INTERN-GEHEIM')
    })

    it('Whitelist: sentence ist vorhanden (erlaubtes Feld)', () => {
      // sentence darf der Schüler sehen
      expect(JSON.stringify(viewBody)).toContain('fließt')
    })
  })
})
