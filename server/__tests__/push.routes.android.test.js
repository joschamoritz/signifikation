// Push-Routen für Android (FCM): Abo anlegen, Owner-Schutz, Abmelden.
// Nutzer per Dev-Header (ALLOW_DEV_AUTH=1 in test/vitest.setup.js).
import express from 'express'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pushRouter from '../routes/push.js'
import db from '../db.js'

const PREFIX = `push-android-${Date.now()}`
const TOKEN_A = `${PREFIX}-fcm-${'a'.repeat(140)}`
const TOKEN_B = `${PREFIX}-fcm-${'b'.repeat(140)}`

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, 1, NULL, @createdAt, @updatedAt)
`)
const rowByToken = (t) => db.prepare('SELECT user_id, platform, apns_token, endpoint FROM push_subscriptions WHERE fcm_token = ?').get(t)

describe('push routes: Android (fcm_token)', () => {
  let server
  let baseUrl

  const post = (body, who) => fetch(`${baseUrl}/api/v1/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(who ? { 'x-dev-user-id': `${PREFIX}-${who}` } : {}) },
    body: JSON.stringify(body),
  })
  const del = (body, who) => fetch(`${baseUrl}/api/v1/push/unsubscribe`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', ...(who ? { 'x-dev-user-id': `${PREFIX}-${who}` } : {}) },
    body: JSON.stringify(body),
  })

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', pushRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const nowIso = new Date().toISOString()
    for (const who of ['eins', 'zwei']) {
      const id = `${PREFIX}-${who}`
      insertUserStmt.run({ id, name: who, email: `${id}@example.test`, createdAt: nowIso, updatedAt: nowIso })
    }
  })

  afterAll(async () => {
    db.prepare('DELETE FROM push_subscriptions WHERE fcm_token LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user WHERE id LIKE ?').run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('legt ein Android-Abo an und ordnet es dem Konto zu', async () => {
    const res = await post({ platform: 'android', fcm_token: TOKEN_A }, 'eins')
    expect(res.status).toBe(201)
    expect(rowByToken(TOKEN_A)).toEqual({ user_id: `${PREFIX}-eins`, platform: 'android', apns_token: null, endpoint: null })
  })

  it('legt dasselbe Token kein zweites Mal an', async () => {
    expect((await post({ platform: 'android', fcm_token: TOKEN_A }, 'eins')).status).toBe(201)
    const n = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE fcm_token = ?').get(TOKEN_A).n
    expect(n).toBe(1)
  })

  it('lehnt ein fremdes Token ab', async () => {
    expect((await post({ platform: 'android', fcm_token: TOKEN_A }, 'zwei')).status).toBe(403)
    expect(rowByToken(TOKEN_A).user_id).toBe(`${PREFIX}-eins`)
  })

  it('lehnt zu kurze Tokens ab', async () => {
    expect((await post({ platform: 'android', fcm_token: 'kurz' }, 'eins')).status).toBe(400)
  })

  it('fremdes Konto kann das Abo nicht löschen, der Besitzer schon', async () => {
    await del({ fcm_token: TOKEN_A }, 'zwei')
    expect(rowByToken(TOKEN_A)).toBeTruthy()
    expect((await del({ fcm_token: TOKEN_A }, 'eins')).status).toBe(200)
    expect(rowByToken(TOKEN_A)).toBeUndefined()
  })

  it('anonymes Abo lässt sich anonym abmelden', async () => {
    expect((await post({ platform: 'android', fcm_token: TOKEN_B })).status).toBe(201)
    expect(rowByToken(TOKEN_B).user_id).toBeNull()
    expect((await del({ fcm_token: TOKEN_B })).status).toBe(200)
    expect(rowByToken(TOKEN_B)).toBeUndefined()
  })
})
