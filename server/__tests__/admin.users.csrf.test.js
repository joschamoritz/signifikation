import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import { csrfProtect } from '../middleware/auth.js'
import db from '../db.js'

// Konto löschen ging im Admin-Panel immer mit 403 aus: Der Client schickte DELETE ohne Content-Type, csrfProtect
// verlangt für POST/PUT/DELETE application/json und X-Requested-With. Die Route-Tests in admin.routes.test.js laufen ohne
// csrfProtect und sahen das nicht. Hier läuft die Anfrage durch csrfProtect und durch den Fetch-Wrapper aus admin.js.

const IP = '198.51.100.71'
const adminJs = readFileSync(fileURLToPath(new URL('../public/admin.js', import.meta.url)), 'utf8')

// Den Fetch-Wrapper (erster Block von admin.js) in einem Fenster-Stub ausführen, dessen fetch wirklich sendet
function clientFetch() {
  const anfang = adminJs.indexOf(';(function installAdminCsrfFetch()')
  const ende = adminJs.indexOf('})()', anfang) + 4
  expect(anfang).toBeGreaterThanOrEqual(0)
  const window = { fetch: (...args) => fetch(...args) }
  vm.runInNewContext(adminJs.slice(anfang, ende), { window, Headers, Request })
  return window.fetch
}

const insertUser = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, 1, NULL, @now, @now)
`)
const setRole = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)
const insertSession = db.prepare(`
  INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const userExists = (id) => !!db.prepare('SELECT 1 FROM user WHERE id = ?').get(id)

describe('Admin-Konten: DELETE und Sammel-Löschen durch csrfProtect, mit den Kopfzeilen des Clients', () => {
  let server
  let baseUrl
  let token
  const sessionId = randomUUID()
  const angelegt = new Set()

  function neuesKonto(role = 'user') {
    const id = `csrf-test-${randomUUID()}`
    insertUser.run({ id, name: `Csrf ${id.slice(-6)}`, email: `${id}@example.test`, now: new Date().toISOString() })
    setRole.run(id, role, Date.now(), Date.now())
    angelegt.add(id)
    return id
  }

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use(express.json())
    app.use('/admin', csrfProtect)
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const adminId = neuesKonto('admin')
    token = randomUUID()
    const jetzt = new Date().toISOString()
    insertSession.run(sessionId, adminId, token, new Date(Date.now() + 86400000).toISOString(), '127.0.0.1', 'test-agent', jetzt, jetzt)
  })

  afterAll(async () => {
    db.prepare('DELETE FROM session WHERE id = ?').run(sessionId)
    for (const id of angelegt) {
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
    await new Promise((resolve) => server.close(resolve))
  })

  const anmeldung = () => ({ cookie: `better-auth.session_token=${token}`, 'x-forwarded-for': IP })

  it('DELETE /admin/users/:id ohne Content-Type und CSRF-Header wird abgelehnt (Ursache des Fehlers)', async () => {
    const id = neuesKonto()
    const antwort = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: anmeldung() })
    expect(antwort.status).toBe(403)
    expect(userExists(id)).toBe(true)
  })

  it('der Client sendet bei DELETE ohne Body Content-Type: application/json und X-Requested-With', async () => {
    const id = neuesKonto()
    const antwort = await clientFetch()(`${baseUrl}/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: anmeldung(),
    })
    expect(antwort.status).toBe(200)
    expect(userExists(id)).toBe(false)
    angelegt.delete(id)
  })

  it('der Client ergänzt Content-Type auch bei PATCH, PUT und POST mit Text-Body, wenn er fehlt', async () => {
    const id = neuesKonto()
    const antwort = await clientFetch()(`${baseUrl}/admin/users/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      headers: anmeldung(),
      body: JSON.stringify({ role: 'premium' }),
    })
    expect(antwort.status).toBe(200)
    expect(db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(id).role).toBe('premium')
  })

  it('der Client lässt einen ausdrücklich gesetzten Content-Type unverändert', async () => {
    const aufrufe = []
    const anfang = adminJs.indexOf(';(function installAdminCsrfFetch()')
    const ende = adminJs.indexOf('})()', anfang) + 4
    const window = { fetch: (url, init) => { aufrufe.push(init); return Promise.resolve({}) } }
    vm.runInNewContext(adminJs.slice(anfang, ende), { window, Headers, Request })
    await window.fetch('/x', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: 'abc' })
    await window.fetch('/x', { method: 'GET' })
    expect(aufrufe[0].headers.get('Content-Type')).toBe('application/octet-stream')
    expect(aufrufe[0].headers.get('X-Requested-With')).toBe('signifikation-app')
    expect(aufrufe[1].headers).toBeUndefined()
  })

  it('POST /admin/users/bulk-update (delete) mit den Kopfzeilen des Clients löscht mehrere Konten', async () => {
    const ids = [neuesKonto(), neuesKonto()]
    const antwort = await clientFetch()(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: { ...anmeldung(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', userIds: ids }),
    })
    const daten = await antwort.json()
    expect(antwort.status).toBe(200)
    expect([...daten.deleted].sort()).toEqual([...ids].sort())
    for (const id of ids) {
      expect(userExists(id)).toBe(false)
      angelegt.delete(id)
    }
  })
})
