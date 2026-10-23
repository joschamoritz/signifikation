// Sicherungsdatei wiederherstellen: Anmeldung, CSRF und Rate-Limit kommen VOR dem 10-MB-JSON-Parser.
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { backupRestoreVorschaltung } = await import('../middleware/backupRestoreVorschaltung.js')
const { default: adminRouter } = await import('../routes/admin.js')
const { default: db } = await import('../db.js')
const { errorHandler } = await import('../error-handling.js')

describe('Vorschaltung vor /admin/backup/restore', () => {
  let server
  let baseUrl
  let token
  let userId
  let sessionId
  let zaehler = 0

  // Jede Anfrage von einer anderen Adresse, damit das Rate-Limit nicht dazwischenfunkt (außer wo es getestet wird)
  const anfrage = (pfad, { cookie, csrf = true, body, ip } = {}) => fetch(`${baseUrl}${pfad}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip || `198.51.100.${(zaehler++ % 250) + 1}`,
      ...(cookie ? { cookie: `better-auth.session_token=${cookie}` } : {}),
      ...(csrf ? { 'x-requested-with': 'signifikation-app' } : {}),
    },
    body,
  })

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    // genau so, wie server/index.js es einhängt
    app.use('/admin/backup/restore', ...backupRestoreVorschaltung)
    app.use(express.json())
    app.use('/', adminRouter)
    // wie in server/index.js: der globale Fehler-Handler steht zuletzt (Parser-Fehler gehen dorthin)
    app.use((err, req, res, next) => errorHandler(err, req, res, next))
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const jetzt = new Date().toISOString()
    userId = `vorschaltung-${randomUUID()}`
    db.prepare('INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, ?, ?, 1, NULL, ?, ?)').run(userId, 'Vorschaltung', `${userId}@example.test`, jetzt, jetzt)
    db.prepare('INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'admin', Date.now(), Date.now())
    sessionId = randomUUID()
    token = randomUUID()
    db.prepare('INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sessionId, userId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', jetzt, jetzt)
  })

  afterAll(async () => {
    db.prepare('DELETE FROM session WHERE id = ?').run(sessionId)
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM user WHERE id = ?').run(userId)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  for (const pfad of ['/admin/backup/restore', '/admin/backup/restore/pruefen']) {
    describe(pfad, () => {
      it('ohne Sitzung: 401, der Body wird nicht geparst (ungültiges JSON ergibt nicht 400)', async () => {
        expect((await anfrage(pfad, { body: '{kaputt' })).status).toBe(401)
        expect((await anfrage(pfad, { body: '{"files":{}}' })).status).toBe(401)
      })

      it('mit fremdem Cookie: 401, auch bei ungültigem JSON', async () => {
        expect((await anfrage(pfad, { cookie: randomUUID(), body: '{kaputt' })).status).toBe(401)
      })

      it('mit Sitzung, aber ohne CSRF-Header: 403 vor dem Parser (ungültiges JSON ergibt nicht 400)', async () => {
        expect((await anfrage(pfad, { cookie: token, csrf: false, body: '{kaputt' })).status).toBe(403)
      })

      it('mit Sitzung und CSRF-Header erreicht der Body den Parser: ungültiges JSON → 400 ohne Parse-Meldung', async () => {
        const r = await anfrage(pfad, { cookie: token, body: '{kaputt' })
        expect(r.status).toBe(400)
        const body = await r.json()
        expect(body).toEqual({ error: 'Ungültiges JSON', code: 'INVALID_JSON' })
        expect(JSON.stringify(body)).not.toContain('kaputt')
      })

      it('über 10 MB: 413 (nur für Angemeldete überhaupt gelesen)', async () => {
        const gross = JSON.stringify({ files: { 'lemmata.json': 'x'.repeat(11 * 1024 * 1024) } })
        const r = await anfrage(pfad, { cookie: token, body: gross })
        expect(r.status).toBe(413)
        expect(await r.json()).toEqual({ error: 'Anfrage zu groß', code: 'PAYLOAD_TOO_LARGE' })
      })
    })
  }

  it('das Rate-Limit zählt eine Anfrage an den Probelauf genau einmal', async () => {
    const ip = '203.0.113.77'
    const payload = JSON.stringify({ files: { 'lemmata.json': [], 'kalender.json': {}, 'wortzwilling.json': {}, 'zeitenwende.json': {} } })
    const verbleibend = async () => {
      const r = await anfrage('/admin/backup/restore/pruefen', { cookie: token, body: payload, ip })
      expect(r.status).toBe(200)
      return Number(r.headers.get('ratelimit-remaining'))
    }
    const erste = await verbleibend()
    const zweite = await verbleibend()
    expect(Number.isFinite(erste)).toBe(true)
    expect(erste - zweite).toBe(1)
  })
})
