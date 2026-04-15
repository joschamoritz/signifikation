import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import classroomRouter from './classroom.js'

function parseJsonSafe(response) {
  return response.json().catch(() => null)
}

describe('Classroom-Routen Auth-Integration', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
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

  it('blockiert unauthentifizierte Requests mit 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/classroom/sessions/does-not-exist/dashboard`)
    const payload = await parseJsonSafe(response)

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Nicht autorisiert' })
  })

  it('blockiert Nicht-Lehrkraefte mit 403', async () => {
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

  it('laesst Lehrkraft durch und liefert Route-spezifische Antwort', async () => {
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
})
