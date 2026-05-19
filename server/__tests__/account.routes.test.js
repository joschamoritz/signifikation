import express from 'express'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import accountRouter from '../routes/account.js'
import db from '../db.js'

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, @emailVerified, @image, @createdAt, @updatedAt)
`)

const upsertEntitlementStmt = db.prepare(`
  INSERT INTO user_entitlements (user_id, gesamtausgabe_unlocked, unlocked_at, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    gesamtausgabe_unlocked = excluded.gesamtausgabe_unlocked,
    source = excluded.source
`)

const insertStatStmt = db.prepare(`
  INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
  VALUES (?, ?, ?, ?, ?, ?, '[]')
`)

function createTestUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const userId = `acc-test-${suffix}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({
    id: userId,
    name: `Acc ${suffix.slice(-6)}`,
    email: `${suffix}@example.test`,
    emailVerified: 1,
    image: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  })
  return userId
}

function devHeaders(userId, role = 'user') {
  return {
    'x-dev-user-id': userId,
    'x-dev-user-role': role,
  }
}

describe('account entitlements integration', () => {
  let server
  let baseUrl
  const testUserIds = new Set()

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', accountRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })
    const address = server.address()
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterAll(async () => {
    for (const userId of testUserIds) {
      db.prepare('DELETE FROM stats WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM user_entitlements WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM user WHERE id = ?').run(userId)
    }
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('anonym: liefert unlocked=false ohne Authentifizierung', async () => {
    const res = await fetch(`${baseUrl}/api/v1/account/entitlements`)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.gesamtausgabe.unlocked).toBe(false)
    expect(payload.gesamtausgabe.source).toBe('none')
  })

  it('Rolle user, keine Zahlung: liefert unlocked=false', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    const res = await fetch(`${baseUrl}/api/v1/account/entitlements`, {
      headers: devHeaders(userId, 'user'),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.gesamtausgabe.unlocked).toBe(false)
  })

  it('Rolle premium: liefert unlocked=true mit Quelle admin-role', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    const res = await fetch(`${baseUrl}/api/v1/account/entitlements`, {
      headers: devHeaders(userId, 'premium'),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.gesamtausgabe.unlocked).toBe(true)
    expect(payload.gesamtausgabe.source).toBe('admin-role')
  })

  it('bezahlter Account: Entitlement aus DB schaltet auch ohne Premium-Rolle frei', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    const now = Date.now()
    upsertEntitlementStmt.run(userId, 1, now, 'mollie', now, now)

    const res = await fetch(`${baseUrl}/api/v1/account/entitlements`, {
      headers: devHeaders(userId, 'user'),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.gesamtausgabe.unlocked).toBe(true)
    expect(payload.gesamtausgabe.source).toBe('mollie')
  })

  it('Statistiken: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/account/stats`)
    expect(res.status).toBe(401)
  })

  it('Statistiken: liefert gespielte Tage und Kollokationen-Aggregate des Nutzers', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    insertStatStmt.run('2026-05-10', 'kollokationen', userId, 1, 24, 30)
    insertStatStmt.run('2026-05-10', 'wortzwilling', userId, 1, 8, 10)
    insertStatStmt.run('2026-05-11', 'kollokationen', userId, 1, 30, 30)

    const res = await fetch(`${baseUrl}/api/v1/account/stats`, {
      headers: devHeaders(userId, 'user'),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.playedDates).toEqual(['2026-05-10', '2026-05-11'])
    expect(payload.kollokationen['2026-05-10']).toEqual({ score: 24, max: 30 })
    expect(payload.kollokationen['2026-05-11']).toEqual({ score: 30, max: 30 })
  })

  it('Statistiken: zeigt nur Daten des anfragenden Nutzers', async () => {
    const userId = createTestUser()
    const otherUserId = createTestUser()
    testUserIds.add(userId)
    testUserIds.add(otherUserId)
    insertStatStmt.run('2026-06-01', 'kollokationen', otherUserId, 1, 20, 30)

    const res = await fetch(`${baseUrl}/api/v1/account/stats`, {
      headers: devHeaders(userId, 'user'),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.playedDates).toEqual([])
    expect(payload.kollokationen).toEqual({})
  })
})
