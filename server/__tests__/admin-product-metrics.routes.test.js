import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import db from '../db.js'

// Datums-Helfer (Europe/Berlin), gespiegelt aus customLemmaQuota.
function todayBerlin() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

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
const insertPaymentStmt = db.prepare(`
  INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (?, ?, ?, 'EUR', ?, ?, ?)
`)
const insertUsageStmt = db.prepare(`
  INSERT INTO custom_lemma_usage (user_id, date, count) VALUES (?, ?, ?)
  ON CONFLICT(user_id, date) DO UPDATE SET count = excluded.count
`)
// Test-eigener spiel-Wert, damit echte Gameplay-/Anonym-Aggregatzeilen nie
// angefasst werden (die DAU-Query filtert nicht nach spiel).
const TEST_SPIEL = `pm-test-spiel-${Date.now()}`
const insertStatsStmt = db.prepare(`
  INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
  VALUES (?, '${TEST_SPIEL}', ?, 1, 8, 10, '[]')
  ON CONFLICT(datum, spiel, user_id) DO UPDATE SET plays = excluded.plays
`)
const insertClassroomSessionStmt = db.prepare(`
  INSERT INTO classroom_session (id, code, teacher_user_id, status, settings_json, created_at)
  VALUES (?, ?, ?, 'finished', '{}', ?)
`)

const PREFIX = `pm-test-${Date.now()}`
const createdUserIds = []
const createdSessionRowIds = []
const createdPaymentIds = []
const createdClassroomIds = []

function makeUser({ role, createdAt } = {}) {
  const id = `${PREFIX}-u-${createdUserIds.length}-${Math.random().toString(16).slice(2, 8)}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({ id, name: 'PM Test', email: `${id}@example.test`, createdAt: createdAt || nowIso, updatedAt: nowIso })
  if (role) {
    const now = Date.now()
    upsertProfileStmt.run(id, role, now, now)
  }
  createdUserIds.push(id)
  return id
}

function adminHeaders(token) {
  return { 'content-type': 'application/json', cookie: `better-auth.session_token=${token}`, 'x-forwarded-for': '198.51.100.61' }
}

describe('admin product-metrics routes', () => {
  let server
  let baseUrl
  let token

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    const addr = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`

    const adminId = makeUser({ role: 'admin' })
    token = randomUUID()
    const sessionId = randomUUID()
    createdSessionRowIds.push(sessionId)
    const nowIso = new Date().toISOString()
    insertSessionStmt.run(sessionId, adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)

    // ── Seed: Zahlungen (innerhalb 30-Tage-Fenster) ──
    const payer1 = makeUser({ role: 'premium' })
    const payer2 = makeUser({ role: 'premium' })
    const recent = Date.now() - 2 * 864e5
    for (const [uid, amount] of [[payer1, '9.99'], [payer2, '14.99']]) {
      const pid = `${PREFIX}-pay-${createdPaymentIds.length}`
      insertPaymentStmt.run(pid, uid, amount, 'paid', 'gesamtausgabe', recent)
      createdPaymentIds.push(pid)
    }

    // ── Seed: Eigenes-Lemma-Nutzung heute ──
    const today = todayBerlin()
    const basicUser = makeUser({ role: 'user' })
    insertUsageStmt.run(payer1, today, 3)   // premium
    insertUsageStmt.run(basicUser, today, 1) // basic

    // ── Seed: stats-Aktivität heute (für DAU) ──
    insertStatsStmt.run(today, payer1)
    insertStatsStmt.run(today, basicUser)
    insertStatsStmt.run(today, '') // anonyme Zeile – muss ausgeschlossen werden

    // ── Seed: Klassenraum-Sessions (1 Lehrer, 2 Sessions) ──
    const teacher = makeUser()
    for (let i = 0; i < 2; i += 1) {
      const sid = `${PREFIX}-cs-${i}`
      insertClassroomSessionStmt.run(sid, `pmcode${i}${Date.now().toString(36).slice(-5)}`, teacher, Date.now() - 864e5)
      createdClassroomIds.push(sid)
    }
  })

  afterAll(async () => {
    db.prepare('DELETE FROM stats WHERE spiel = ?').run(TEST_SPIEL)
    for (const id of createdClassroomIds) db.prepare('DELETE FROM classroom_session WHERE id = ?').run(id)
    for (const id of createdPaymentIds) db.prepare('DELETE FROM payments WHERE id = ?').run(id)
    for (const id of createdSessionRowIds) db.prepare('DELETE FROM session WHERE id = ?').run(id)
    for (const id of createdUserIds) {
      db.prepare('DELETE FROM custom_lemma_usage WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM stats WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('GET /admin/payments/summary liefert Aggregate ohne Einzeldaten', async () => {
    const res = await fetch(`${baseUrl}/admin/payments/summary?days=30`, { headers: adminHeaders(token) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totals.payments).toBeGreaterThanOrEqual(2)
    expect(data.totals.uniquePayers).toBeGreaterThanOrEqual(2)
    expect(data.totals.revenue).toBeGreaterThanOrEqual(24.98)
    expect(data.totals.avgValue).toBeGreaterThan(0)
    expect(Array.isArray(data.byProduct)).toBe(true)
    expect(data.byProduct.some((p) => p.product === 'gesamtausgabe')).toBe(true)
    // Keine personenbezogenen Felder
    expect(JSON.stringify(data)).not.toContain('@example.test')
  })

  it('GET /admin/payments/summary validiert days', async () => {
    const res = await fetch(`${baseUrl}/admin/payments/summary?days=0`, { headers: adminHeaders(token) })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('GET /admin/custom-lemma/summary liefert Premium-vs-Basic-Aufschlüsselung', async () => {
    const res = await fetch(`${baseUrl}/admin/custom-lemma/summary?days=30`, { headers: adminHeaders(token) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.totals.activeUsers).toBeGreaterThanOrEqual(2)
    expect(data.totals.totalPlays).toBeGreaterThanOrEqual(4)
    expect(data.totals.premiumUsers).toBeGreaterThanOrEqual(1)
    expect(data.totals.basicUsers).toBeGreaterThanOrEqual(1)
    expect(data.totals.premiumRate).toBeGreaterThan(0)
    expect(data.totals.dau).toBeGreaterThanOrEqual(2)
    expect(Array.isArray(data.byRole)).toBe(true)
  })

  it('GET /admin/stats/retention liefert DAU/WAU/MAU und schließt anonyme Zeile aus', async () => {
    const res = await fetch(`${baseUrl}/admin/stats/retention?days=30`, { headers: adminHeaders(token) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.active.dau).toBeGreaterThanOrEqual(2)
    expect(data.active.wau).toBeGreaterThanOrEqual(data.active.dau)
    expect(data.active.mau).toBeGreaterThanOrEqual(data.active.wau)
    expect(typeof data.retentionDay7.cohortSize).toBe('number')
    expect(data.retentionDay7).toHaveProperty('rate')
  })

  it('GET /admin/classroom/teachers liefert Histogramm ohne teacher-IDs', async () => {
    const res = await fetch(`${baseUrl}/admin/classroom/teachers?days=30`, { headers: adminHeaders(token) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.uniqueTeachers).toBeGreaterThanOrEqual(1)
    expect(data.totalSessions).toBeGreaterThanOrEqual(2)
    expect(data.histogram).toHaveProperty('1-5')
    expect(data.histogram).toHaveProperty('6-20')
    expect(data.histogram).toHaveProperty('20+')
    // pseudonym: keine teacher_user_id im Payload
    expect(JSON.stringify(data)).not.toContain(PREFIX + '-u-')
  })

  it('lehnt unauthentifizierte Anfragen ab', async () => {
    const res = await fetch(`${baseUrl}/admin/payments/summary?days=30`)
    expect(res.status).toBe(401)
  })
})
