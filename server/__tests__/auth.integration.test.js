// Echte better-auth-Integrationstests (Review 2026-06-11, T-H3):
// Alle uebrigen Server-Tests umgehen Auth per x-dev-user-id-Header —
// Session-Erzeugung, Cookie-Handling und Sign-in/Sign-out selbst waren
// nur durch den CI-Smoke (401-Check) abgedeckt. Diese Tests fahren die
// Better-Auth-Flows ueber HTTP, ohne Dev-Header.
import express from 'express'
import { toNodeHandler } from 'better-auth/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth, beiSessionEnde, verwerfeAltzugaengeVorVerknuepfung } from '../auth/index.js'
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

  it('Passwort-Reset beendet alle bestehenden Sessions', async () => {
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL)
    // Reset-Token wie request-password-reset anlegen, ohne vom konfigurierten Versandweg abzuhaengen
    const token = `test-reset-${Date.now()}`
    const ctx = await auth.$context
    await ctx.internalAdapter.createVerificationValue({
      value: user.id,
      identifier: `reset-password:${token}`,
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect(db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n).toBeGreaterThan(0)

    const res = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword: PASSWORD }),
    })
    expect(res.status).toBe(200)
    expect(db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n).toBe(0)
    const alt = await fetch(`${baseUrl}/api/v1/auth/get-session`, { headers: { cookie: sessionCookie } })
    expect(await alt.text()).not.toContain(EMAIL)
  })

  it('verknüpft Google nicht mit einem bestehenden Konto, wenn die E-Mail beim Anbieter unbestätigt ist', async () => {
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL)
    db.prepare('UPDATE user SET emailVerified = 1 WHERE id = ?').run(user.id)
    const { handleOAuthUserInfo } = await import('better-auth/oauth2')
    const context = await auth.$context
    const ergebnis = await handleOAuthUserInfo({ context }, {
      userInfo: { id: 'google-sub-fremd', email: EMAIL, emailVerified: false, name: 'Fremd' },
      account: { providerId: 'google', accountId: 'google-sub-fremd' },
      callbackURL: '/',
    })
    expect(ergebnis.error).toBe('account not linked')
    expect(db.prepare("SELECT COUNT(*) n FROM account WHERE userId = ? AND providerId = 'google'").get(user.id).n).toBe(0)
  })

  it('Verknüpfung mit Google beendet alte Sessions und verwirft das Passwort (Vorregistrierung)', async () => {
    const email = `auth-vorab-${Date.now()}@test.local`
    try {
      const signUp = await fetch(`${baseUrl}/api/v1/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD, name: 'Vorab' }),
      })
      expect(signUp.status).toBe(200)
      const altCookie = (signUp.headers.get('set-cookie') || '').split(';')[0]
      const user = db.prepare('SELECT id FROM user WHERE email = ?').get(email)
      expect(db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n).toBeGreaterThan(0)

      // Derselbe Weg wie beim impliziten Linking in handleOAuthUserInfo
      const context = await auth.$context
      await context.internalAdapter.linkAccount({ userId: user.id, providerId: 'google', accountId: 'google-sub-vorab' })

      expect(db.prepare('SELECT COUNT(*) n FROM session WHERE userId = ?').get(user.id).n).toBe(0)
      expect(db.prepare("SELECT COUNT(*) n FROM account WHERE userId = ? AND providerId = 'credential'").get(user.id).n).toBe(0)
      expect(db.prepare("SELECT COUNT(*) n FROM account WHERE userId = ? AND providerId = 'google'").get(user.id).n).toBe(1)
      const alt = await fetch(`${baseUrl}/api/v1/auth/get-session`, { headers: { cookie: altCookie } })
      expect(await alt.text()).not.toContain(email)
      const mitPasswort = await fetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD }),
      })
      expect(mitPasswort.status).toBe(401)
    } finally {
      const row = db.prepare('SELECT id FROM user WHERE email = ?').get(email)
      if (row) db.prepare('DELETE FROM user WHERE id = ?').run(row.id)
    }
  })

  it('Verknüpfung lässt das Passwort eines Admin-Kontos stehen', () => {
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL)
    db.prepare(`INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, 'admin', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET role = 'admin'`).run(user.id, Date.now(), Date.now())
    try {
      verwerfeAltzugaengeVorVerknuepfung({ userId: user.id, providerId: 'apple' })
      expect(db.prepare("SELECT COUNT(*) n FROM account WHERE userId = ? AND providerId = 'credential'").get(user.id).n).toBe(1)
    } finally {
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(user.id)
    }
  })

  it('Rate-Limit-IP kommt aus X-Real-IP, nicht aus mehrteiligem X-Forwarded-For', async () => {
    const { getIp } = await import('@better-auth/core/utils/ip')
    const { options } = await auth.$context
    expect(options.advanced.ipAddress.ipAddressHeaders).toEqual(['x-real-ip'])
    const headers = new Headers({ 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.1, 203.0.113.5' })
    expect(getIp(headers, options)).toBe('203.0.113.5')
  })

  it('ein neuer Reset-Link macht den älteren ungültig (Security-Audit run-1)', async () => {
    const user = db.prepare('SELECT id FROM user WHERE email = ?').get(EMAIL)
    const ctx = await auth.$context
    const lege = (token) => ctx.internalAdapter.createVerificationValue({
      value: user.id, identifier: `reset-password:${token}`, expiresAt: new Date(Date.now() + 60_000),
    })
    const alt = `test-reset-alt-${Date.now()}`
    const neu = `test-reset-neu-${Date.now()}`
    await lege(alt)
    await lege(neu)
    const setze = (token) => fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, newPassword: PASSWORD }),
    })
    expect((await setze(alt)).status).toBe(400)
    expect((await setze(neu)).status).toBe(200)
  })

  it('Sign-out meldet das Ende genau dieser Anmeldung (Klassenraum-Sockets, Security-Audit run-2)', async () => {
    const beendet = []
    beiSessionEnde((id) => beendet.push(id))
    const signIn = await fetch(`${baseUrl}/api/v1/auth/sign-in/email`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    const cookie = (signIn.headers.get('set-cookie') || '').split(';')[0]
    const sitzung = await (await fetch(`${baseUrl}/api/v1/auth/get-session`, { headers: { cookie } })).json()
    await fetch(`${baseUrl}/api/v1/auth/sign-out`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })
    await new Promise((r) => setTimeout(r, 20))
    expect(beendet).toEqual([sitzung.session.id])
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
