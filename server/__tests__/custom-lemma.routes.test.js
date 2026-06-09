import express from 'express'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// validateCustomLemma mocken – dieser Test prüft nur Gating + Plumbing,
// nicht die Korpus-Generatoren (die haben eigene Unit-Tests).
vi.mock('../customLemma.js', () => ({
  validateCustomLemma: vi.fn(async (input) => ({ mode: input.mode, usable: true, reason: null })),
}))

import customLemmaRouter from '../routes/custom-lemma.js'
import { validateCustomLemma } from '../customLemma.js'
import db from '../db.js'

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, @emailVerified, @image, @createdAt, @updatedAt)
`)

function createTestUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const userId = `cl-test-${suffix}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({
    id: userId, name: `CL ${suffix.slice(-6)}`, email: `${suffix}@example.test`,
    emailVerified: 1, image: null, createdAt: nowIso, updatedAt: nowIso,
  })
  return userId
}

function devHeaders(userId, role = 'user') {
  return { 'x-dev-user-id': userId, 'x-dev-user-role': role }
}

describe('custom-lemma validate – Gating', () => {
  let server
  let baseUrl
  const userIds = new Set()

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', customLemmaRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    const address = server.address()
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterAll(async () => {
    for (const id of userIds) {
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
    if (server) await new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())))
  })

  it('401 ohne Authentifizierung', async () => {
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=kollokationen&q=Archiv`)
    expect(res.status).toBe(401)
  })

  it('403 für eingeloggten Nicht-Premium-Nutzer', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=kollokationen&q=Archiv`, {
      headers: devHeaders(userId, 'user'),
    })
    expect(res.status).toBe(403)
  })

  it('200 für Premium-Nutzer, ruft validateCustomLemma mit geparster Query', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=zeitenwende&q=Internet`, {
      headers: devHeaders(userId, 'premium'),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ mode: 'zeitenwende', usable: true, reason: null })
    expect(validateCustomLemma).toHaveBeenCalledWith(expect.objectContaining({ mode: 'zeitenwende', q: 'Internet' }))
  })

  it('400 bei fehlendem Pflichtfeld (Wort-Zwilling ohne a/b)', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=wortzwilling&q=Archiv`, {
      headers: devHeaders(userId, 'premium'),
    })
    expect(res.status).toBe(400)
  })
})
