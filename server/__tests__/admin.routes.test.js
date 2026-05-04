import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import { loadReadOnly, save } from '../store.js'
import db from '../db.js'

const BACKUP_RESTORE_BODY_LIMIT = '10mb'

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

const insertSessionStmt = db.prepare(`
  INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const deleteSessionStmt = db.prepare(`DELETE FROM session WHERE id = ?`)

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
    cookie: `better-auth.session_token=${token}`,
    'x-forwarded-for': ip,
  }
}

describe('admin routes integration', () => {
  let server
  let baseUrl
  let token
  let testSessionId
  const testUserIds = new Set()

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use('/admin/backup/restore', express.json({ limit: BACKUP_RESTORE_BODY_LIMIT }))
    app.use(express.json())
    app.use('/', adminRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`

    // Admin-User + Session in DB anlegen
    const adminUserId = createTestUser({ role: 'admin' })
    testUserIds.add(adminUserId)
    testSessionId = randomUUID()
    token = randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()
    insertSessionStmt.run(testSessionId, adminUserId, token, expiresAt, '127.0.0.1', 'test-agent', now, now)
  })

  afterAll(async () => {
    if (testSessionId) deleteSessionStmt.run(testSessionId)
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
    const datum = '10-15'
    await save('kalender.json', { ...loadReadOnly('kalender.json'), [datum]: ['haus', 'baum', 'wort'] })

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

  it('GET /admin/audit-log/:resource/:id liefert Detailhistorie für eine Entität', async () => {
    const datum = `12-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    await save('kalender.json', { ...loadReadOnly('kalender.json'), [datum]: ['haus', 'baum', 'wort'] })

    const seedResponse = await fetch(`${baseUrl}/admin/kalender/bulk-delete`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ dates: [datum] }),
    })

    expect(seedResponse.status).toBe(200)

    const overview = await fetch(`${baseUrl}/admin/audit-log?limit=5`, {
      headers: adminHeaders(token),
    })
    const overviewPayload = await overview.json()

    expect(overview.status).toBe(200)
    const first = overviewPayload.entries?.[0]
    expect(first).toBeTruthy()

    const response = await fetch(`${baseUrl}/admin/audit-log/${encodeURIComponent(first.resource)}/${encodeURIComponent(first.resourceId)}?limit=5`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.resource).toBe(first.resource)
    expect(payload.resourceId).toBe(first.resourceId)
    expect(Array.isArray(payload.entries)).toBe(true)
  })

  it('GET /admin/users/:id/stats liefert nur Statistikdaten', async () => {
    const userId = createTestUser({ role: 'premium' })
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}/stats`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.userId).toBe(userId)
    expect(typeof payload.totals).toBe('object')
    expect(Array.isArray(payload.byGame)).toBe(true)
    expect(Array.isArray(payload.recent)).toBe(true)
  })

  it('POST /admin/kalender/bulk-import importiert CSV-Einträge', async () => {
    const datum = `12-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    const response = await fetch(`${baseUrl}/admin/kalender/bulk-import`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        csv: `date,lemma1,lemma2,lemma3\n${datum},Haus,Baum,Wort`,
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.importedCount).toBe(1)
    expect(Array.isArray(payload.imported)).toBe(true)

    const kalender = loadReadOnly('kalender.json')
    expect(Array.isArray(kalender[datum]?.ids)).toBe(true)
    expect(kalender[datum]?.ids).toHaveLength(3)
  })

  it('POST /admin/backup/restore akzeptiert vorhandenes Backup-Format', async () => {
    const backupResponse = await fetch(`${baseUrl}/admin/backup`, {
      headers: adminHeaders(token),
    })
    const backupPayload = await backupResponse.json()
    expect(backupResponse.status).toBe(200)

    const response = await fetch(`${baseUrl}/admin/backup/restore`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ ...backupPayload, confirm: true }),
    })
    const raw = await response.text()
    let payload = null
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = { raw }
    }

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(typeof payload.restored?.kalender).toBe('number')
  })

  it('POST /admin/tag entfernt optionale Modi, wenn Felder geleert werden', async () => {
    const datum = `11-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`

    const firstResponse = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        notizen: ['', '', ''],
        links: ['', '', ''],
        definitionen: ['', '', ''],
        zwilling_paar: ['Tag', 'Nacht'],
        zwilling_pos: 'Substantiv',
        zeitenwende_lemma: 'Zeit',
      }),
    })
    expect(firstResponse.status).toBe(200)

    const secondResponse = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        notizen: ['', '', ''],
        links: ['', '', ''],
        definitionen: ['', '', ''],
        zwilling_paar: null,
        zwilling_pos: 'Substantiv',
        zeitenwende_lemma: '',
      }),
    })
    expect(secondResponse.status).toBe(200)

    const wortzwilling = loadReadOnly('wortzwilling.json')
    const zeitenwende = loadReadOnly('zeitenwende.json')

    expect(wortzwilling[datum]).toBeUndefined()
    expect(zeitenwende[datum]).toBeUndefined()
  })

  it('POST /admin/backup/restore bleibt bei Fehlern atomisch', async () => {
    const originalKalender = loadReadOnly('kalender.json')
    const originalLemmata = loadReadOnly('lemmata.json')
    const markerDatum = '10-31'
    const markerId = 'restore-atomic-marker'

    await save('kalender.json', { ...originalKalender, [markerDatum]: [markerId] })

    const invalidBundle = {
      exportedAt: new Date().toISOString(),
      confirm: true,
      files: {
        'kalender.json': {},
        'lemmata.json': originalLemmata,
        'wortzwilling.json': {},
        'zeitenwende.json': {},
        'stats-rows.json': [null],
      },
    }

    const response = await fetch(`${baseUrl}/admin/backup/restore`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(invalidBundle),
    })

    expect(response.status).toBe(500)

    const kalenderAfter = loadReadOnly('kalender.json')
    const lemmataAfter = loadReadOnly('lemmata.json')

    expect(kalenderAfter[markerDatum]).toEqual({ ids: [markerId], thema: '', thema_kurz: '', thema_quelle: '', lueckenfueller_id: '' })
    expect(lemmataAfter.some((entry) => entry.id === markerId)).toBe(false)

    await save('kalender.json', originalKalender)
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
        role: 'premium',
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
    expect(firstUserDetails.user.role).toBe('premium')

    const secondUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(secondUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(secondUserDetailsRes.status).toBe(200)
    const secondUserDetails = await secondUserDetailsRes.json()
    expect(secondUserDetails.user.role).toBe('premium')
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
    const firstUserId = createTestUser({ role: 'premium' })
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
    const firstUserId = createTestUser({ role: 'premium' })
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
      expect(['user', 'premium']).toContain(row.role)
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
