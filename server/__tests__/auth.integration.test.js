// Echte better-auth-Integrationstests (Review 2026-06-11, T-H3):
// Alle uebrigen Server-Tests umgehen Auth per x-dev-user-id-Header —
// Session-Erzeugung, Cookie-Handling und Sign-in/Sign-out selbst waren
// nur durch den CI-Smoke (401-Check) abgedeckt. Diese Tests fahren die
// Better-Auth-Flows ueber HTTP, ohne Dev-Header.
import express from 'express'
import { toNodeHandler } from 'better-auth/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth } from '../auth/index.js'
import db from '../db.js'

const EMAIL = `auth-int-${Date.now()}@test.local`
const PASSWORD = 'korrektes-passwort-123'

describe('better-auth Integration (ohne Dev-Header)', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    // Wie in server/index.js: Auth-Handler VOR express.json mounten
    app.all('/api/v1/auth/*splat', toNodeHandler(auth))
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    const row = db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL)
    if (row) {
      // session/account raeumt der FK-Cascade ab
      db.prepare('DELETE FROM user WHERE id = ?').run(row.id)
    }
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  })

  let sessionCookie = null

  it('Sign-up legt User, Account und Session an (Set-Cookie)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: 'Auth Test' }),
    })
    expect(res.status).toBe(200)

    const setCookie = res.headers.get('set-cookie') || ''
    expect(setCookie).toContain('better-auth.session_token')
    sessionCookie = setCookie.split(';')[0]

    const user = db.prepare('SELECT id, emailVerified FROM user WHERE email = ?').get(EMAIL)
    expect(user).toBeTruthy()
    expect(db.prepare('SELECT COUNT(*) n FROM account WHERE userId = ?').get(user.id).n).toBe(1)
    expect(db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n).toBeGreaterThanOrEqual(1)
  })

  it('get-session liefert den User mit gueltigem Cookie', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/get-session`, {
      headers: { cookie: sessionCookie },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body?.user?.email).toBe(EMAIL)
    expect(body?.session?.token).toBeTruthy()
  })

  it('get-session ohne Cookie liefert keine Session', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/get-session`)
    expect(res.status).toBe(200)
    const text = await res.text()
    // better-auth antwortet hier mit null/leerem Objekt — keinesfalls mit User
    expect(text).not.toContain(EMAIL)
  })

  it('Sign-in mit falschem Passwort → 401, keine neue Session', async () => {
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL)
    const before = db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n

    const res = await fetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'voellig-falsch' }),
    })
    expect(res.status).toBe(401)

    const after = db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n
    expect(after).toBe(before)
  })

  it('Sign-in mit korrektem Passwort → 200 + frisches Cookie', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie') || '').toContain('better-auth.session_token')
  })

  it('Sign-out invalidiert die Session', async () => {
    const signIn = await fetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    const cookie = (signIn.headers.get('set-cookie') || '').split(';')[0]

    const out = await fetch(`${baseUrl}/api/v1/auth/sign-out`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(out.status).toBe(200)

    const res = await fetch(`${baseUrl}/api/v1/auth/get-session`, { headers: { cookie } })
    const text = await res.text()
    expect(text).not.toContain(EMAIL)
  })
})
