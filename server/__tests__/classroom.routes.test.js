import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import classroomRouter from '../routes/classroom.js'

function teacherHeaders(id = `teacher-${Date.now()}`) {
  return {
    'x-dev-user-id': id,
    'x-dev-user-role': 'teacher',
    'content-type': 'application/json',
  }
}

function parseJsonSafe(response) {
  return response.json().catch(() => null)
}

describe('classroom routes integration', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', classroomRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('happy path: create -> start -> join -> finish -> export', async () => {
    const teacherId = `teacher-happy-${Date.now()}`

    const createRes = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({}),
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json()
    expect(created.session?.id).toBeTruthy()
    expect(created.joinCode).toBeTruthy()

    const startRes = await fetch(`${baseUrl}/api/v1/classroom/sessions/${created.session.id}/start`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({ allowLateJoin: true }),
    })
    expect(startRes.status).toBe(200)

    const joinRes = await fetch(`${baseUrl}/api/v1/classroom/join`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.100',
      },
      body: JSON.stringify({ code: created.joinCode }),
    })
    expect(joinRes.status).toBe(201)

    const finishRes = await fetch(`${baseUrl}/api/v1/classroom/sessions/${created.session.id}/finish`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({}),
    })
    expect(finishRes.status).toBe(200)

    const exportRes = await fetch(`${baseUrl}/api/v1/classroom/sessions/${created.session.id}/exports`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({ type: 'csv' }),
    })
    expect(exportRes.status).toBe(202)
  })

  it('auth: blockiert unauthentifizierte Requests mit 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/classroom/sessions/does-not-exist/dashboard`)
    const payload = await parseJsonSafe(response)

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Nicht autorisiert' })
  })

  it('auth: blockiert Nicht-Lehrkraefte mit 403', async () => {
    const response = await fetch(`${baseUrl}/api/v1/classroom/sessions/does-not-exist/dashboard`, {
      headers: {
        'x-dev-user-id': 'test-user',
        'x-dev-user-role': 'user',
      },
    })
    const payload = await parseJsonSafe(response)

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Lehrkraft-Berechtigung erforderlich' })
  })

  it('auth: laesst Lehrkraft durch und liefert route-spezifische Antwort', async () => {
    const response = await fetch(`${baseUrl}/api/v1/classroom/sessions/does-not-exist/dashboard`, {
      headers: {
        'x-dev-user-id': 'test-teacher',
        'x-dev-user-role': 'teacher',
      },
    })
    const payload = await parseJsonSafe(response)

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Session nicht gefunden' })
  })

  it('error path: start bei unbekannter Session gibt 404', async () => {
    const teacherId = `teacher-missing-${Date.now()}`
    const res = await fetch(`${baseUrl}/api/v1/classroom/sessions/does-not-exist/start`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({ allowLateJoin: true }),
    })
    expect(res.status).toBe(404)
    const payload = await res.json()
    expect(payload).toEqual({ error: 'Session nicht gefunden' })
  })

  it('error path: ungueltiger Join-Code gibt 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/classroom/join`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.101',
      },
      body: JSON.stringify({ code: 'xxxx-xxxx' }),
    })
    expect(res.status).toBe(404)
    const payload = await res.json()
    expect(payload.error).toContain('Zugangscode ungueltig')
  })

  it('error path: export vor Session-Ende gibt 409', async () => {
    const teacherId = `teacher-export-${Date.now()}`
    const createRes = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({}),
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json()

    const exportRes = await fetch(`${baseUrl}/api/v1/classroom/sessions/${created.session.id}/exports`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({ type: 'csv' }),
    })
    expect(exportRes.status).toBe(409)
    const payload = await exportRes.json()
    expect(payload).toEqual({ error: 'Session ist in diesem Zustand nicht gueltig' })
  })

  it('teacher socket auth: liefert signiertes Kurzzeit-Token statt roher Teacher-ID', async () => {
    const teacherId = `teacher-socket-auth-${Date.now()}`
    const createRes = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
      body: JSON.stringify({}),
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json()

    const authRes = await fetch(`${baseUrl}/api/v1/classroom/sessions/${created.session.id}/teacher-socket-auth`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
    })
    expect(authRes.status).toBe(200)
    const payload = await authRes.json()

    expect(payload.sessionId).toBe(created.session.id)
    expect(typeof payload.token).toBe('string')
    expect(payload.token.length).toBeGreaterThan(20)
    expect(payload.teacherUserId).toBeUndefined()
  })
})
