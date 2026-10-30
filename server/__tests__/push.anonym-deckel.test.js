// Deckel für Push-Abos ohne Konto (Security-Audit run-1/run-2): Ist er erreicht, gibt es
// keine neuen anonymen Abos mehr; bekannte erneuern sich weiter, Angemeldete sind frei.
// Deckel 0 statt „aktuelle Anzahl + 1“, damit parallele Testdateien nichts verschieben.
import express from 'express'
import cookieParser from 'cookie-parser'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pushRouter, { setzeAnonymDeckelFuerTests } from '../routes/push.js'
import db from '../db.js'

const PREFIX = `push-deckel-${Date.now()}`
const token = (name) => `${PREFIX}-${name}-${'c'.repeat(140)}`

describe('Push: Deckel für Abos ohne Konto', () => {
  let server
  let baseUrl

  const post = (fcm_token, who) => fetch(`${baseUrl}/api/v1/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(who ? { 'x-dev-user-id': `${PREFIX}-${who}` } : {}) },
    body: JSON.stringify({ platform: 'android', fcm_token }),
  })
  const zeile = (t) => db.prepare('SELECT user_id FROM push_subscriptions WHERE fcm_token = ?').get(t)

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', pushRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
    const nowIso = new Date().toISOString()
    db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
      VALUES (?, 'konto', ?, 1, NULL, ?, ?)`).run(`${PREFIX}-konto`, `${PREFIX}@example.test`, nowIso, nowIso)
  })

  afterAll(async () => {
    setzeAnonymDeckelFuerTests(20_000)
    db.prepare('DELETE FROM push_subscriptions WHERE fcm_token LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user WHERE id LIKE ?').run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('unter dem Deckel entstehen anonyme Abos wie bisher', async () => {
    setzeAnonymDeckelFuerTests(Number.MAX_SAFE_INTEGER)
    expect((await post(token('frei'))).status).toBe(201)
    expect(zeile(token('frei'))).toEqual({ user_id: null })
  })

  it('am Deckel: kein neues anonymes Abo, bekanntes erneuert sich, Angemeldete legen an', async () => {
    setzeAnonymDeckelFuerTests(0)
    const voll = await post(token('neu'))
    expect(voll.status).toBe(503)
    expect(zeile(token('neu'))).toBeUndefined()

    expect((await post(token('frei'))).status).toBe(201)
    expect((await post(token('konto'), 'konto')).status).toBe(201)
    expect(zeile(token('konto'))).toEqual({ user_id: `${PREFIX}-konto` })
  })
})
