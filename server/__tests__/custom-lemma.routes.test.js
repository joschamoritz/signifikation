import express from 'express'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Korpus-Logik mocken – diese Tests prüfen Gating + Kontingent, nicht die
// Generatoren (die haben eigene Unit-Tests).
vi.mock('../customLemma.js', () => ({
  validateCustomLemma: vi.fn(async (input) => ({ mode: input.mode, usable: true, reason: null })),
  buildCustomPlay: vi.fn(async (input) => ({ usable: true, mode: input.mode, lemma: { id: 'x', lemma: 'X' } })),
}))

import customLemmaRouter from '../routes/custom-lemma.js'
import { validateCustomLemma } from '../customLemma.js'
import { todayBerlin } from '../customLemmaQuota.js'
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

describe('custom-lemma Routen – Gating & Kontingent', () => {
  let server
  let baseUrl
  const userIds = new Set()

  beforeAll(async () => {
    // Bonus-Tag für heute sicher entfernen → Grundkontingent ist exakt 1.
    db.prepare('DELETE FROM free_days WHERE date = ?').run(todayBerlin())
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
      db.prepare('DELETE FROM custom_lemma_usage WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
    if (server) await new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())))
  })

  // ── validate (verbraucht nichts, für jeden Eingeloggten offen) ──
  it('validate: 401 ohne Authentifizierung', async () => {
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=kollokationen&q=Archiv`)
    expect(res.status).toBe(401)
  })

  it('validate: 200 für eingeloggten Basic-Nutzer (offen, kein Verbrauch)', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=kollokationen&q=Archiv`, {
      headers: devHeaders(userId, 'user'),
    })
    expect(res.status).toBe(200)
    expect(validateCustomLemma).toHaveBeenCalledWith(expect.objectContaining({ mode: 'kollokationen', q: 'Archiv' }))
  })

  it('validate: 400 bei fehlendem Pflichtfeld (Wort-Zwilling ohne a/b)', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/validate?mode=wortzwilling&q=Archiv`, {
      headers: devHeaders(userId, 'premium'),
    })
    expect(res.status).toBe(400)
  })

  // ── play (verbraucht Kontingent) ───────────────────────────────
  it('play: 401 ohne Authentifizierung', async () => {
    const res = await fetch(`${baseUrl}/api/v1/custom-lemma/play?mode=kollokationen&q=Archiv`)
    expect(res.status).toBe(401)
  })

  it('play: Basic verbraucht 1/Tag – erstes Spiel ok, zweites 403', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const h = devHeaders(userId, 'user')

    const r1 = await fetch(`${baseUrl}/api/v1/custom-lemma/play?mode=kollokationen&q=Archiv`, { headers: h })
    expect(r1.status).toBe(200)
    const b1 = await r1.json()
    expect(b1.quota).toEqual({ unlimited: false, allowance: 1, remaining: 0 })

    const r2 = await fetch(`${baseUrl}/api/v1/custom-lemma/play?mode=kollokationen&q=Archiv`, { headers: h })
    expect(r2.status).toBe(403)
    const b2 = await r2.json()
    expect(b2.quota.remaining).toBe(0)
  })

  it('play: Premium ist unbegrenzt (mehrfach 200, unlimited-Quota)', async () => {
    const userId = createTestUser(); userIds.add(userId)
    const h = devHeaders(userId, 'premium')

    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${baseUrl}/api/v1/custom-lemma/play?mode=kollokationen&q=Archiv`, { headers: h })
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(b.quota).toEqual({ unlimited: true })
    }
  })
})
