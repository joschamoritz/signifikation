/**
 * Postfach-Routen der Social Cards: Auflisten, Freigeben/Verwerfen, Caption
 * nur bei offenen Entwürfen, Auth- und CSRF-Pflicht, Zeichenmodul für den Editor.
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import { csrfProtect } from '../middleware/auth.js'
import db from '../db.js'
import { speichereEntwuerfe, ladeEntwuerfe } from '../socialCards/store.js'

const PREFIX = `sc-test-${Date.now()}`
const DATUM = '2099-04-06'

function adminHeaders(token) {
  return { 'content-type': 'application/json', 'x-requested-with': 'signifikation-app', cookie: `better-auth.session_token=${token}` }
}

describe('admin social-cards Postfach', () => {
  let server, baseUrl, token, id

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/admin', csrfProtect)
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const adminId = `${PREFIX}-admin`
    const nowIso = new Date().toISOString()
    db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, 'SC Test', ?, 1, NULL, ?, ?)`)
      .run(adminId, `${adminId}@example.test`, nowIso, nowIso)
    db.prepare(`INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, 'admin', ?, ?)`).run(adminId, Date.now(), Date.now())
    token = randomUUID()
    db.prepare(`INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)

    speichereEntwuerfe([{ datum: DATUM, slot: 'T', spec: { format: 'T', data: { lemmata: [] } }, caption: 'Teaser', hashtags: '#signifikation' }])
    id = ladeEntwuerfe(DATUM, DATUM)[0].id
  })

  afterAll(async () => {
    db.prepare('DELETE FROM social_card_entwurf WHERE datum = ?').run(DATUM)
    db.prepare('DELETE FROM session WHERE userId LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user_profiles WHERE user_id LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user WHERE id LIKE ?').run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('listet Entwürfe im Fenster mit Bild-URL, ohne Dateipfad', async () => {
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe?von=${DATUM}&bis=${DATUM}`, { headers: adminHeaders(token) })
    expect(res.status).toBe(200)
    const { entwuerfe } = await res.json()
    expect(entwuerfe).toHaveLength(1)
    expect(entwuerfe[0]).toMatchObject({ id, slot: 'T', status: 'offen', caption: 'Teaser' })
    expect(entwuerfe[0].bildUrl).toMatch(new RegExp(`^/admin/social-cards/entwuerfe/${id}/bild\\?v=`))
    expect(entwuerfe[0]).not.toHaveProperty('bild')
  })

  it('verlangt Anmeldung', async () => {
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe`)
    expect(res.status).toBe(401)
  })

  it('verlangt den CSRF-Header bei Änderungen', async () => {
    const { 'x-requested-with': _weg, ...ohneCsrf } = adminHeaders(token)
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe/${id}`, { method: 'POST', headers: ohneCsrf, body: JSON.stringify({ status: 'freigegeben' }) })
    expect(res.status).toBe(403)
  })

  it('speichert Caption, gibt frei und sperrt danach die Caption', async () => {
    const post = (body) => fetch(`${baseUrl}/admin/social-cards/entwuerfe/${id}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })

    let res = await post({ caption: 'Neue Caption', status: 'freigegeben' })
    expect(res.status).toBe(200)
    expect((await res.json()).entwurf).toMatchObject({ caption: 'Neue Caption', status: 'freigegeben' })

    res = await post({ caption: 'Zu spät' })
    expect(res.status).toBe(409)

    res = await post({ status: 'offen' })
    expect((await res.json()).entwurf).toMatchObject({ status: 'offen', entschiedenAm: null })
  })

  it('lehnt leere Änderungen und unbekannte Status ab, 404 für fremde IDs', async () => {
    const post = (pfad, body) => fetch(`${baseUrl}${pfad}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })
    expect((await post(`/admin/social-cards/entwuerfe/${id}`, {})).status).toBe(400)
    expect((await post(`/admin/social-cards/entwuerfe/${id}`, { status: 'veroeffentlicht' })).status).toBe(400)
    expect((await post('/admin/social-cards/entwuerfe/999999', { status: 'verworfen' })).status).toBe(404)
  })

  it('liefert das Zeichenmodul für den Editor', async () => {
    const res = await fetch(`${baseUrl}/admin/social-cards/karten.js`, { headers: adminHeaders(token) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    expect(await res.text()).toContain('export function drawCard')
  })
})
