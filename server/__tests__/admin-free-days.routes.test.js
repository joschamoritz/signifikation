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

const PREFIX = `fd-test-${Date.now()}`
const TEST_DATE = '2099-01-15'
const TEST_DATE_2 = '2099-01-16'
const auditAktionen = (datum) => db.prepare("SELECT action FROM audit_log WHERE resource = 'bonus_tag' AND resource_id = ? ORDER BY id").all(datum).map((r) => r.action)
const gestern = () => {
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  const [y, m, d] = heute.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

function adminHeaders(token) {
  return { 'content-type': 'application/json', cookie: `better-auth.session_token=${token}` }
}

describe('admin free-days routes (Zod-Validierung)', () => {
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
    insertUserStmt.run({ id: adminId, name: 'FD Test', email: `${adminId}@example.test`, createdAt: nowIso, updatedAt: nowIso })
    upsertProfileStmt.run(adminId, 'admin', Date.now(), Date.now())
    token = randomUUID()
    insertSessionStmt.run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)
  })

  afterAll(async () => {
    db.prepare('DELETE FROM free_days WHERE date IN (?, ?)').run(TEST_DATE, TEST_DATE_2)
    db.prepare("DELETE FROM audit_log WHERE resource = 'bonus_tag' AND resource_id IN (?, ?)").run(TEST_DATE, TEST_DATE_2)
    db.prepare(`DELETE FROM session WHERE userId LIKE ?`).run(`${PREFIX}%`)
    db.prepare(`DELETE FROM user_profiles WHERE user_id LIKE ?`).run(`${PREFIX}%`)
    db.prepare(`DELETE FROM user WHERE id LIKE ?`).run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('POST /admin/free-days legt einen Bonus-Tag an', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ date: TEST_DATE, label: 'Testtag', bonus_count: 3 }),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM free_days WHERE date = ?').get(TEST_DATE)
    expect(row).toMatchObject({ date: TEST_DATE, label: 'Testtag', bonus_count: 3 })
  })

  it('POST /admin/free-days lehnt ungültiges Datum mit 400 + error ab', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ date: '15.01.2099' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('POST /admin/free-days lehnt bonus_count über dem Maximum ab', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ date: TEST_DATE, bonus_count: 999 }),
    })
    expect(res.status).toBe(400)
  })

  it('DELETE /admin/free-days/:date lehnt ungültiges Datum mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days/not-a-date`, {
      method: 'DELETE',
      headers: adminHeaders(token),
    })
    expect(res.status).toBe(400)
  })

  it('DELETE /admin/free-days/:date entfernt den Bonus-Tag', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days/${TEST_DATE}`, {
      method: 'DELETE',
      headers: adminHeaders(token),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM free_days WHERE date = ?').get(TEST_DATE)
    expect(row).toBeUndefined()
  })

  it('lehnt 0 zusätzliche Spiele ab (ein Bonus-Tag ohne Wirkung)', async () => {
    for (const bonus_count of [0, '', -1, 'abc']) {
      const res = await fetch(`${baseUrl}/admin/free-days`, {
        method: 'POST',
        headers: adminHeaders(token),
        body: JSON.stringify({ date: TEST_DATE_2, bonus_count }),
      })
      expect(res.status, `bonus_count ${JSON.stringify(bonus_count)}`).toBe(400)
      expect((await res.json()).error).toBe('Bitte eine ganze Zahl von 1 bis 50 eintragen.')
    }
    // fehlendes Feld ebenso
    const ohne = await fetch(`${baseUrl}/admin/free-days`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ date: TEST_DATE_2 }) })
    expect(ohne.status).toBe(400)
    expect(db.prepare('SELECT * FROM free_days WHERE date = ?').get(TEST_DATE_2)).toBeUndefined()
  })

  it('lehnt einen vergangenen Tag ab (Berliner Zeit)', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ date: gestern(), bonus_count: 2 }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Der Tag liegt in der Vergangenheit.')
    expect(db.prepare('SELECT * FROM free_days WHERE date = ?').get(gestern())).toBeUndefined()
  })

  it('meldet beim zweiten Eintragen desselben Tags ersetzt: true und protokolliert Anlegen, Ersetzen und Entfernen', async () => {
    const post = (body) => fetch(`${baseUrl}/admin/free-days`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })

    let res = await post({ date: TEST_DATE_2, label: 'Erst', bonus_count: 2 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ersetzt: false })

    res = await post({ date: TEST_DATE_2, label: 'Dann', bonus_count: 4 })
    expect(await res.json()).toEqual({ ok: true, ersetzt: true })
    expect(db.prepare('SELECT * FROM free_days WHERE date = ?').get(TEST_DATE_2)).toMatchObject({ label: 'Dann', bonus_count: 4 })

    // Protokoll: vorher/nachher beim Ersetzen
    const ersetzen = db.prepare("SELECT changes_json FROM audit_log WHERE resource = 'bonus_tag' AND resource_id = ? AND action = 'UPDATE'").get(TEST_DATE_2)
    expect(JSON.parse(ersetzen.changes_json)).toMatchObject({ before: { bonus_count: 2, label: 'Erst' }, after: { bonus_count: 4, label: 'Dann' } })

    const del = await fetch(`${baseUrl}/admin/free-days/${TEST_DATE_2}`, { method: 'DELETE', headers: adminHeaders(token) })
    expect(await del.json()).toEqual({ ok: true, entfernt: true })
    // ein zweites Entfernen ist wirkungslos und kommt nicht ins Protokoll
    await fetch(`${baseUrl}/admin/free-days/${TEST_DATE_2}`, { method: 'DELETE', headers: adminHeaders(token) })
    expect(auditAktionen(TEST_DATE_2)).toEqual(['CREATE', 'UPDATE', 'DELETE'])
  })

  it('lehnt unauthentifizierte Anfragen ab', async () => {
    const res = await fetch(`${baseUrl}/admin/free-days`)
    expect(res.status).toBe(401)
  })
})
