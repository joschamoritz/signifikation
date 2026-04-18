import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import { createSession } from '../middleware/auth.js'
import { loadReadOnly } from '../store.js'
import db from '../db.js'

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, @emailVerified, @image, @createdAt, @updatedAt)
`)

const upsertUserProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id)
  DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)

const deleteUserProfileStmt = db.prepare(`
  DELETE FROM user_profiles
  WHERE user_id = ?
`)

const deleteUserStmt = db.prepare(`
  DELETE FROM user
  WHERE id = ?
`)

const cleanupUsersTx = db.transaction((userIds) => {
  for (const userId of userIds) {
    deleteUserProfileStmt.run(userId)
    deleteUserStmt.run(userId)
  }
})

function createTestUser({ role } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const userId = `admin-test-${suffix}`
  const nowIso = new Date().toISOString()

  insertUserStmt.run({
    id: userId,
    name: `Test ${suffix.slice(-6)}`,
    email: `${suffix}@example.test`,
    emailVerified: 1,
    image: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  })

  if (role) {
    const now = Date.now()
    upsertUserProfileStmt.run(userId, role, now, now)
  }

  return userId
}

function adminHeaders(token, ip = '198.51.100.50') {
  return {
    'content-type': 'application/json',
    'x-admin-token': token,
    'x-forwarded-for': ip,
  }
}

describe('admin routes integration', () => {
  let server
  let baseUrl
  let token
  const testUserIds = new Set()

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', adminRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`
    token = createSession().token
  })

  afterAll(async () => {
    cleanupUsersTx([...testUserIds])

    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('POST /admin/kalender/bulk-delete lehnt leere Liste mit 400 ab', async () => {
    const response = await fetch(`${baseUrl}/admin/kalender/bulk-delete`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ dates: [] }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Mindestens ein Datum erforderlich' })
  })

  it('POST /admin/preview/lemma liefert strukturierte Vorschau', async () => {
    const response = await fetch(`${baseUrl}/admin/preview/lemma`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ lemma: 'haus', pos: 'Substantiv' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lemma).toBeTruthy()
    expect(payload.id).toBeTruthy()
    expect(Array.isArray(payload.rundenInfo)).toBe(true)
  })

  it('GET /admin/preview/day/:datum liefert Tagesdaten fuer vorhandenen Eintrag', async () => {
    const kalender = loadReadOnly('kalender.json')
    const datum = Object.keys(kalender)[0]
    expect(datum).toBeTruthy()

    const response = await fetch(`${baseUrl}/admin/preview/day/${encodeURIComponent(datum)}`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.datum).toBe(datum)
    expect(Array.isArray(payload.lemmata)).toBe(true)
    expect(typeof payload.modes).toBe('object')
  })

  it('GET /admin/audit-log filtert nach action und status', async () => {
    const response = await fetch(`${baseUrl}/admin/audit-log?action=CREATE&status=SUCCESS&limit=20`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(payload.entries)).toBe(true)
    expect(typeof payload.totalMatches).toBe('number')
    for (const entry of payload.entries) {
      expect(entry.action).toBe('CREATE')
      expect(entry.status).toBe('SUCCESS')
    }
  })

  it('POST /admin/users/bulk-update setzt Rollen fuer mehrere Nutzer', async () => {
    const firstUserId = createTestUser()
    const secondUserId = createTestUser()
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)
    const missingUserId = `missing-${Date.now()}`

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'setRole',
        userIds: [firstUserId, secondUserId, missingUserId],
        role: 'teacher',
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.action).toBe('setRole')
    expect(payload.changedCount).toBe(2)
    expect(new Set(payload.changed)).toEqual(new Set([firstUserId, secondUserId]))
    expect(payload.skipped).toEqual([missingUserId])

    const firstUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(firstUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(firstUserDetailsRes.status).toBe(200)
    const firstUserDetails = await firstUserDetailsRes.json()
    expect(firstUserDetails.user.role).toBe('teacher')

    const secondUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(secondUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(secondUserDetailsRes.status).toBe(200)
    const secondUserDetails = await secondUserDetailsRes.json()
    expect(secondUserDetails.user.role).toBe('teacher')
  })

  it('POST /admin/users/bulk-update validiert fehlende role bei setRole', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'setRole',
        userIds: [userId],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'role ist fuer setRole erforderlich' })
  })

  it('POST /admin/users/bulk-update loescht mehrere Nutzer', async () => {
    const firstUserId = createTestUser({ role: 'teacher' })
    const secondUserId = createTestUser({ role: 'user' })
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)
    const missingUserId = `missing-${Date.now()}`

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'delete',
        userIds: [firstUserId, secondUserId, missingUserId],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.action).toBe('delete')
    expect(payload.deletedCount).toBe(2)
    expect(new Set(payload.deleted)).toEqual(new Set([firstUserId, secondUserId]))
    expect(payload.skipped).toEqual([missingUserId])

    const firstUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(firstUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(firstUserDetailsRes.status).toBe(404)

    const secondUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(secondUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(secondUserDetailsRes.status).toBe(404)

    testUserIds.delete(firstUserId)
    testUserIds.delete(secondUserId)
  })

  it('POST /admin/users/bulk-update exportiert Nutzer als JSON', async () => {
    const firstUserId = createTestUser({ role: 'teacher' })
    const secondUserId = createTestUser()
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'export',
        format: 'json',
        userIds: [secondUserId, firstUserId],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.action).toBe('export')
    expect(payload.exportedCount).toBe(2)
    expect(payload.users).toHaveLength(2)

    const exportedIds = new Set(payload.users.map((row) => row.id))
    expect(exportedIds).toEqual(new Set([firstUserId, secondUserId]))

    for (const row of payload.users) {
      expect(typeof row.email).toBe('string')
      expect(['user', 'teacher']).toContain(row.role)
      expect(typeof row.emailVerified).toBe('boolean')
    }
  })

  it('POST /admin/users/bulk-update exportiert Nutzer als CSV', async () => {
    const firstUserId = createTestUser()
    const secondUserId = createTestUser()
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'export',
        format: 'csv',
        userIds: [firstUserId, secondUserId],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment; filename=')
    expect(response.headers.get('x-exported-count')).toBe('2')
    expect(response.headers.get('x-skipped-count')).toBe('0')

    const csv = await response.text()
    expect(csv).toContain('id,name,email,role,emailVerified,createdAt')
    expect(csv).toContain(firstUserId)
    expect(csv).toContain(secondUserId)
  })
})
