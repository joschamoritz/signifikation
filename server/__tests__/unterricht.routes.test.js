import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import unterrichtRouter from '../routes/unterricht.js'
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

const PREFIX = `ut-test-${Date.now()}`
const TEAM = `${PREFIX}-Lea und Tom`

function abgabe(overrides = {}) {
  return {
    aufgabe: 'fallakte-oetzi',
    team: TEAM,
    bericht1992: { wer: 'Ein Hirte', wie: 'erfroren oder erschöpft', wieWarum: 'Keine Wunde' },
    abschluss: {
      wer: 'Ein angesehener Mann', werS: 'vermutet',
      wie: 'Pfeil in der Schulter', wieS: 'belegt',
      warum: 'Weiß niemand', warumS: 'ungeklaert',
      schild: 'Ötzi lebte vor etwa 5300 Jahren.',
    },
    karten: {
      a1: { titel: 'Der Fund', text: 'An seinen Sachen', stempel: 'belegt', tipps: 0 },
      b1: { titel: 'Das Röntgenbild von 2001', text: 'Pfeil', stempel: 'belegt', tipps: 2 },
    },
    ...overrides,
  }
}

const jsonHeaders = { 'content-type': 'application/json' }
function adminHeaders(token) {
  return { ...jsonHeaders, cookie: `better-auth.session_token=${token}` }
}

describe('unterricht routes', () => {
  let server
  let baseUrl
  let token

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json({ limit: '16kb' }))
    app.use('/', unterrichtRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const adminId = `${PREFIX}-admin`
    const nowIso = new Date().toISOString()
    insertUserStmt.run({ id: adminId, name: 'UT Test', email: `${adminId}@example.test`, createdAt: nowIso, updatedAt: nowIso })
    upsertProfileStmt.run(adminId, 'admin', Date.now(), Date.now())
    token = randomUUID()
    insertSessionStmt.run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)
  })

  afterAll(async () => {
    db.prepare('DELETE FROM unterricht_abgabe WHERE team LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM session WHERE userId LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user_profiles WHERE user_id LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user WHERE id LIKE ?').run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('POST /api/v1/unterricht/abgabe speichert eine gültige Abgabe', async () => {
    const res = await fetch(`${baseUrl}/api/v1/unterricht/abgabe`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(abgabe()),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT * FROM unterricht_abgabe WHERE team = ?').get(TEAM)
    expect(row.aufgabe).toBe('fallakte-oetzi')
    const payload = JSON.parse(row.payload)
    expect(payload.abschluss.warumS).toBe('ungeklaert')
    expect(payload.karten.b1.tipps).toBe(2)
  })

  it('verwirft unbekannte Felder (z. B. eingeschmuggelte IP)', async () => {
    const team = `${PREFIX}-strip`
    const res = await fetch(`${baseUrl}/api/v1/unterricht/abgabe`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...abgabe({ team }), ip: '1.2.3.4' }),
    })
    expect(res.status).toBe(200)
    const row = db.prepare('SELECT payload FROM unterricht_abgabe WHERE team = ?').get(team)
    expect(row.payload).not.toContain('1.2.3.4')
  })

  it('lehnt eine unbekannte Aufgabe mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/unterricht/abgabe`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(abgabe({ aufgabe: 'gibt-es-nicht' })),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBeTruthy()
  })

  it('lehnt einen falschen Stempel und zu lange Texte ab', async () => {
    const falscherStempel = abgabe()
    falscherStempel.abschluss.wieS = 'sicher'
    const r1 = await fetch(`${baseUrl}/api/v1/unterricht/abgabe`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(falscherStempel),
    })
    expect(r1.status).toBe(400)

    const zuLang = abgabe()
    zuLang.karten.a1.text = 'x'.repeat(501)
    const r2 = await fetch(`${baseUrl}/api/v1/unterricht/abgabe`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(zuLang),
    })
    expect(r2.status).toBe(400)
  })

  it('lehnt einen leeren Teamnamen ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/unterricht/abgabe`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(abgabe({ team: '   ' })),
    })
    expect(res.status).toBe(400)
  })

  it('GET /admin/unterricht/abgaben verlangt Admin-Login', async () => {
    const res = await fetch(`${baseUrl}/admin/unterricht/abgaben`)
    expect(res.status).toBe(401)
  })

  it('GET /admin/unterricht/abgaben liefert die Abgaben mit Inhalt', async () => {
    const res = await fetch(`${baseUrl}/admin/unterricht/abgaben?aufgabe=fallakte-oetzi`, { headers: adminHeaders(token) })
    expect(res.status).toBe(200)
    const data = await res.json()
    const eigene = data.abgaben.find((a) => a.team === TEAM)
    expect(eigene).toBeTruthy()
    expect(eigene.abschluss.wieS).toBe('belegt')
    expect(eigene.bericht1992.wie).toBe('erfroren oder erschöpft')
  })

  it('DELETE /admin/unterricht/abgaben/:id löscht eine Abgabe', async () => {
    const { id } = db.prepare('SELECT id FROM unterricht_abgabe WHERE team = ?').get(TEAM)
    const res = await fetch(`${baseUrl}/admin/unterricht/abgaben/${id}`, { method: 'DELETE', headers: adminHeaders(token) })
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT 1 FROM unterricht_abgabe WHERE id = ?').get(id)).toBeUndefined()
  })

  it('DELETE ohne Admin-Login wird abgelehnt', async () => {
    const res = await fetch(`${baseUrl}/admin/unterricht/abgaben?aufgabe=fallakte-oetzi`, { method: 'DELETE', headers: jsonHeaders })
    expect(res.status).toBe(401)
  })
})
