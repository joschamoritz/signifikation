import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { createServer } from 'http'
import { io as ioClient } from 'socket.io-client'
import classroomRouter from './routes/classroom.js'
import { initClassroomSocket } from './realtime/classroomSocket.js'

function parseJsonSafe(response) {
  return response.json().catch(() => null)
}

function teacherHeaders(id = 'teacher-acc') {
  return {
    'x-dev-user-id': id,
    'x-dev-user-role': 'premium',
    'content-type': 'application/json',
  }
}

async function createSession(baseUrl, teacherId = 'teacher-acc') {
  const response = await fetch(`${baseUrl}/api/v1/classroom/sessions`, {
    method: 'POST',
    headers: teacherHeaders(teacherId),
    body: JSON.stringify({}),
  })
  expect(response.status).toBe(201)
  const payload = await response.json()
  return payload
}

describe('Classroom-Akzeptanz: 20 gleichzeitige Teilnehmende', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', classroomRouter)

    server = createServer(app)
    initClassroomSocket(server)

    await new Promise((resolve) => {
      server.listen(0, resolve)
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

  it('erlaubt 20 parallele Joins und 20 Submissions', async () => {
    const { session, joinCode } = await createSession(baseUrl)

    const startResponse = await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/start`, {
      method: 'POST',
      headers: teacherHeaders(),
      body: JSON.stringify({ allowLateJoin: true }),
    })
    expect(startResponse.status).toBe(200)

    const joinResponses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        fetch(`${baseUrl}/api/v1/classroom/join`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `203.0.113.${index + 1}`,
          },
          body: JSON.stringify({ code: joinCode }),
        }),
      ),
    )

    for (const response of joinResponses) {
      expect(response.status).toBe(201)
    }

    const joinPayloads = await Promise.all(joinResponses.map((response) => response.json()))

    const sockets = []
    try {
      await Promise.all(joinPayloads.map((payload, index) => new Promise((resolve, reject) => {
        const socket = ioClient(baseUrl, {
          path: '/socket.io',
          transports: ['websocket'],
          timeout: 5000,
        })
        sockets.push(socket)
        let settled = false

        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          reject(new Error('Socket submit timeout'))
        }, 5000)

        socket.on('connect_error', (err) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(err)
        })
        socket.on('connect', () => {
          socket.emit('classroom:join', {
            sessionId: payload.session.id,
            participantId: payload.participant.id,
            participantToken: payload.participant.token,
          })
          socket.emit('classroom:submit', {
            roundNo: 1,
            score: 7 + (index % 3),
            maxScore: 10,
            payload: { source: 'acceptance-test' },
          })
        })

        socket.on('classroom:results', (data) => {
          if (!data?.accepted || settled) return
          settled = true
          clearTimeout(timeout)
          resolve()
        })
      })))
    } finally {
      for (const socket of sockets) {
        try { socket.close() } catch {}
      }
    }

    const dashboardResponse = await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/dashboard`, {
      headers: {
        'x-dev-user-id': 'teacher-acc',
        'x-dev-user-role': 'premium',
      },
    })
    expect(dashboardResponse.status).toBe(200)
    const dashboardPayload = await parseJsonSafe(dashboardResponse)

    expect(dashboardPayload?.metrics?.total_count).toBe(20)
    expect(dashboardPayload?.metrics?.submitted_count).toBe(20)
  })

  it('blockiert gefaelschte Teacher-Joins ohne serverseitig signiertes Token', async () => {
    const teacherId = `teacher-socket-forgery-${Date.now()}`
    const { session } = await createSession(baseUrl, teacherId)

    const socket = ioClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      timeout: 5000,
    })

    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          reject(new Error('Socket forgery timeout'))
        }, 5000)

        socket.on('connect_error', (err) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(err)
        })

        socket.on('connect', () => {
          socket.emit('classroom:teacher-join', {
            sessionId: session.id,
            teacherUserId: teacherId,
          })
        })

        socket.on('classroom:error', (payload) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          expect(payload?.code).toBe('INVALID_PAYLOAD')
          resolve()
        })

        socket.on('classroom:metrics', () => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(new Error('Forged teacher join unexpectedly received metrics'))
        })
      })
    } finally {
      try { socket.close() } catch {}
    }
  })

  it('erlaubt Teacher-Join nur mit serverseitig signiertem Token', async () => {
    const teacherId = `teacher-socket-valid-${Date.now()}`
    const { session } = await createSession(baseUrl, teacherId)

    const authResponse = await fetch(`${baseUrl}/api/v1/classroom/sessions/${session.id}/teacher-socket-auth`, {
      method: 'POST',
      headers: teacherHeaders(teacherId),
    })
    expect(authResponse.status).toBe(200)
    const authPayload = await parseJsonSafe(authResponse)
    expect(typeof authPayload?.token).toBe('string')

    const socket = ioClient(baseUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      timeout: 5000,
    })

    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const timeout = setTimeout(() => {
          if (settled) return
          settled = true
          reject(new Error('Socket teacher auth timeout'))
        }, 5000)

        socket.on('connect_error', (err) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(err)
        })

        socket.on('connect', () => {
          socket.emit('classroom:teacher-join', {
            sessionId: session.id,
            token: authPayload.token,
          })
        })

        socket.on('classroom:error', (payload) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(new Error(`Teacher join rejected: ${payload?.code || 'unknown'}`))
        })

        socket.on('classroom:metrics', (payload) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          expect(payload).toBeTruthy()
          resolve()
        })
      })
    } finally {
      try { socket.close() } catch {}
    }
  })
})
