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

function devHeaders(userId, role = 'user', extra = {}) {
  return {
    'x-dev-user-id': userId,
    'x-dev-user-role': role,
    ...extra,
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
      db.prepare('DELETE FROM device_registrations WHERE user_id = ?').run(userId)
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
      headers: devHeaders(userId, 'premium', { 'user-agent': 'role-premium-device' }),
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
      headers: devHeaders(userId, 'user', { 'user-agent': 'paid-device' }),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.gesamtausgabe.unlocked).toBe(true)
    expect(payload.gesamtausgabe.source).toBe('mollie')
  })

  it('Gerätelimit: das vierte Gerät eines freigeschalteten Accounts wird mit 403 abgewiesen', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`${baseUrl}/api/v1/account/entitlements`, {
        headers: devHeaders(userId, 'premium', { 'user-agent': `limit-device-${i}` }),
      })
      expect(res.status).toBe(200)
    }

    const blocked = await fetch(`${baseUrl}/api/v1/account/entitlements`, {
      headers: devHeaders(userId, 'premium', { 'user-agent': 'limit-device-4' }),
    })
    const payload = await blocked.json()

    expect(blocked.status).toBe(403)
    expect(payload.error).toBe('Gerätelimit erreicht')
    expect(Array.isArray(payload.devices)).toBe(true)
  })
})
