import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'crypto'
import db from '../db.js'
import express from 'express'
import {
  createSession,
  joinByCode,
  addAssignment,
  startSession,
  finishSession,
  grantCapability,
  revokeCapability,
} from '../classroom-v2/store.js'

// Better-auth getSession mocken – Tests pruefen die Capability-Pruefung,
// nicht das Cookie-Handling. So bleibt der Test deterministisch.
vi.mock('../auth/index.js', () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}))

const { auth } = await import('../auth/index.js')
const { requireCapability } = await import('../middleware/requireCapability.js')

const TEACHER = `test-cap-teacher-${randomUUID()}`

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function cleanup() {
  const sessions = db.prepare(`SELECT id FROM cr2_session WHERE teacher_user_id = ?`).all(TEACHER)
  for (const s of sessions) db.prepare(`DELETE FROM cr2_session WHERE id = ?`).run(s.id)
}

const KOLL_SNAPSHOT = {
  byLemma: { 'lemma-1': {
    kollokatoren: [
      { wort: 'stark', rang: 1 }, { wort: 'groß', rang: 2 }, { wort: 'klein', rang: 3 },
      { wort: 'weit', rang: 4 }, { wort: 'tief', rang: 8 }, { wort: 'leise', rang: 10 },
    ],
  }},
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.post('/sessions/:sessionId/manage',
    requireCapability('session:manage'),
    (req, res) => res.json({ ok: true, subject: req.cr2.subject.kind }))
  app.post('/sessions/:sessionId/submit',
    requireCapability('submission:write'),
    (req, res) => res.json({ ok: true, participantId: req.cr2.subject.id }))
  return app
}

async function call(app, method, url, opts = {}) {
  return await new Promise((resolve) => {
    const req = Object.assign({
      method, url,
      headers: opts.headers || {},
      params: {},
      body: opts.body || {},
      query: {},
    })
    // einfach Express selbst aufrufen
    const http = require('http')
    const server = http.createServer(app).listen(0, async () => {
      const port = server.address().port
      try {
        const fetchRes = await fetch(`http://127.0.0.1:${port}${url}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
        })
        let body = null
        try { body = await fetchRes.json() } catch {}
        resolve({ status: fetchRes.status, body })
      } finally {
        server.close()
      }
    })
  })
}

describe('requireCapability middleware', () => {
  beforeAll(() => { ensureUser(TEACHER) })
  beforeEach(() => {
    cleanup()
    auth.api.getSession.mockReset()
    auth.api.getSession.mockResolvedValue(null)
  })

  it('401 wenn weder Teacher-Session noch Bearer-Token vorliegen', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    const app = buildApp()
    const r = await call(app, 'POST', `/sessions/${session.id}/manage`)
    expect(r.status).toBe(401)
  })

  it('Teacher via better-auth-Session laesst session:manage zu', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    auth.api.getSession.mockResolvedValue({ user: { id: TEACHER } })
    const app = buildApp()
    const r = await call(app, 'POST', `/sessions/${session.id}/manage`)
    expect(r.status).toBe(200)
    expect(r.body.subject).toBe('teacher')
  })

  it('Teacher ohne session:manage-Grant: 403', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    const otherTeacher = `${TEACHER}-other`
    ensureUser(otherTeacher)
    auth.api.getSession.mockResolvedValue({ user: { id: otherTeacher } })
    const app = buildApp()
    const r = await call(app, 'POST', `/sessions/${session.id}/manage`)
    expect(r.status).toBe(403)
  })

  it('Schueler mit gueltigem Bearer-Token darf submission:write', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    addAssignment({
      sessionId: session.id, teacherUserId: TEACHER,
      mode: 'kollokationen', lemmaIds: ['lemma-1'],
      contentSnapshot: KOLL_SNAPSHOT,
    })
    startSession({ sessionId: session.id, teacherUserId: TEACHER })
    const j = joinByCode({ code: session.code, displayName: 'Schueler 1' })
    const app = buildApp()
    const r = await call(app, 'POST', `/sessions/${session.id}/submit`, {
      headers: { Authorization: `Bearer ${j.participant.token}` },
    })
    expect(r.status).toBe(200)
    expect(r.body.participantId).toBe(j.participant.id)
  })

  it('Schueler-Token nach finishSession revoked (D14): 403', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    addAssignment({
      sessionId: session.id, teacherUserId: TEACHER,
      mode: 'kollokationen', lemmaIds: ['lemma-1'],
      contentSnapshot: KOLL_SNAPSHOT,
    })
    startSession({ sessionId: session.id, teacherUserId: TEACHER })
    const j = joinByCode({ code: session.code, displayName: 'X' })
    finishSession({ sessionId: session.id, teacherUserId: TEACHER })
    const app = buildApp()
    const r = await call(app, 'POST', `/sessions/${session.id}/submit`, {
      headers: { Authorization: `Bearer ${j.participant.token}` },
    })
    expect(r.status).toBe(403)
  })

  it('Manuelles revokeCapability greift sofort (kein JWT-Cache)', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    addAssignment({
      sessionId: session.id, teacherUserId: TEACHER,
      mode: 'kollokationen', lemmaIds: ['lemma-1'],
      contentSnapshot: KOLL_SNAPSHOT,
    })
    startSession({ sessionId: session.id, teacherUserId: TEACHER })
    const j = joinByCode({ code: session.code, displayName: 'X' })
    const app = buildApp()
    const ok1 = await call(app, 'POST', `/sessions/${session.id}/submit`, {
      headers: { Authorization: `Bearer ${j.participant.token}` },
    })
    expect(ok1.status).toBe(200)
    revokeCapability({
      sessionId: session.id, subjectKind: 'participant', subjectId: j.participant.id,
    })
    const ok2 = await call(app, 'POST', `/sessions/${session.id}/submit`, {
      headers: { Authorization: `Bearer ${j.participant.token}` },
    })
    expect(ok2.status).toBe(403)
  })

  it('unbekannter Bearer-Token: 401', async () => {
    const { session } = createSession({ teacherUserId: TEACHER })
    const app = buildApp()
    const r = await call(app, 'POST', `/sessions/${session.id}/submit`, {
      headers: { Authorization: `Bearer not-a-real-token` },
    })
    expect(r.status).toBe(401)
  })
})
