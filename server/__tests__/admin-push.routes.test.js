import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import db from '../db.js'

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, 1, NULL, @createdAt, @updatedAt)
`)
const upsertProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)
const insertSessionStmt = db.prepare(`
  INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const PREFIX = `push-test-${Date.now()}`
let createdTemplateId = null

function adminHeaders(token) {
  return { 'content-type': 'application/json', cookie: `better-auth.session_token=${token}` }
}

describe('admin push routes (Zod-Validierung)', () => {
  let server
  let baseUrl
  let token

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    const addr = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`

    const adminId = `${PREFIX}-admin`
    const nowIso = new Date().toISOString()
    insertUserStmt.run({ id: adminId, name: 'Push Test', email: `${adminId}@example.test`, createdAt: nowIso, updatedAt: nowIso })
    upsertProfileStmt.run(adminId, 'admin', Date.now(), Date.now())
    token = randomUUID()
    insertSessionStmt.run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)
  })

  afterAll(async () => {
    if (createdTemplateId) db.prepare('DELETE FROM push_templates WHERE id = ?').run(createdTemplateId)
    db.prepare(`DELETE FROM session WHERE userId LIKE ?`).run(`${PREFIX}%`)
    db.prepare(`DELETE FROM user_profiles WHERE user_id LIKE ?`).run(`${PREFIX}%`)
    db.prepare(`DELETE FROM user WHERE id LIKE ?`).run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('POST /admin/push/templates legt ein Template an', async () => {
    const res = await fetch(`${baseUrl}/admin/push/templates`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ title: 'Testtitel', body: 'Testtext', enabled: true }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.id).toBe('number')
    createdTemplateId = data.id
  })

  it('POST /admin/push/templates lehnt leeren Titel mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/templates`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ title: '', body: 'Testtext' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('POST /admin/push/templates lehnt zu langen Titel mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/templates`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ title: 'x'.repeat(200), body: 'Testtext' }),
    })
    expect(res.status).toBe(400)
  })

  it('PUT /admin/push/templates/:id lehnt nicht-numerische ID mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/templates/abc`, {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify({ title: 'Neu', body: 'Neu' }),
    })
    expect(res.status).toBe(400)
  })

  it('PUT /admin/push/templates/:id aktualisiert enabled=0 (Legacy-Zahlenform)', async () => {
    const res = await fetch(`${baseUrl}/admin/push/templates/${createdTemplateId}`, {
      method: 'PUT',
      headers: adminHeaders(token),
      body: JSON.stringify({ title: 'Aktualisiert', body: 'Aktualisiert', enabled: 0 }),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM push_templates WHERE id = ?').get(createdTemplateId)
    expect(row.title).toBe('Aktualisiert')
    expect(row.enabled).toBe(0)
  })

  it('POST /admin/push/send lehnt ungültigen mode ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/send`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ mode: 'broadcast-all' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /admin/push/send (mode=free) lehnt fehlenden Titel ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/send`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ mode: 'free', body: 'nur Text' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /admin/push/send (mode=template) lehnt fehlende templateId ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/send`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ mode: 'template' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /admin/push/send (mode=self) mit gültigem Titel/Text läuft ohne Validierungsfehler durch', async () => {
    const res = await fetch(`${baseUrl}/admin/push/send`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ mode: 'self', title: 'Test', body: 'Test-Push' }),
    })
    // Kein Push-Geraet registriert (kein VAPID im Testlauf) → 400 "keine Geraete",
    // aber NICHT wegen fehlgeschlagener Zod-Validierung.
    expect([200, 400]).toContain(res.status)
    const data = await res.json()
    if (res.status === 400) expect(data.error).not.toMatch(/mode muss/)
  })

  it('lehnt unauthentifizierte Anfragen ab', async () => {
    const res = await fetch(`${baseUrl}/admin/push/templates`)
    expect(res.status).toBe(401)
  })
})
