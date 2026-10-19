/**
 * server/__tests__/dataRetention.test.js
 *
 * Tests für den Retention-Sweep, Fokus auf das neue custom_lemma_usage-Cleanup
 * (Audit 2026-06-15): alte Tageskontingent-Zeilen (>24 Monate) werden gelöscht,
 * payments: nur ohne Konto und nach 8 Jahren ab Ende des Kalenderjahres (§ 147 AO).
 *
 * Arbeitet mit der globalen Test-DB (APP_DB aus global-setup.js) und räumt
 * nach sich auf.
 */
import { afterEach, describe, it, expect } from 'vitest'
import db from '../db.js'
import { runDataRetention, DEFAULT_RETENTION_MS, paymentCutoffMs } from '../jobs/dataRetention.js'

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'
function berlinDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(ms))
}

const createdUsers = []
const usedUsageUsers = []

function createUser() {
  const id = `retention-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const nowIso = new Date().toISOString()
  db.prepare(`
    INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
    VALUES (?, ?, ?, 1, NULL, ?, ?)
  `).run(id, 'Retention Test', `${id}@retention.test`, nowIso, nowIso)
  createdUsers.push(id)
  return id
}

function insertUsage(userId, date, count = 1) {
  db.prepare('INSERT OR REPLACE INTO custom_lemma_usage (user_id, date, count) VALUES (?, ?, ?)')
    .run(userId, date, count)
  usedUsageUsers.push(userId)
}

afterEach(() => {
  for (const id of usedUsageUsers) {
    db.prepare('DELETE FROM custom_lemma_usage WHERE user_id = ?').run(id)
  }
  usedUsageUsers.length = 0
  for (const id of createdUsers) {
    db.prepare('DELETE FROM payments WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM user WHERE id = ?').run(id)
  }
  createdUsers.length = 0
})

describe('runDataRetention – custom_lemma_usage', () => {
  it('löscht Einträge älter als die Retention-Frist und behält frische', () => {
    const now = Date.now()
    const userId = createUser()
    // Klar jenseits der 24-Monats-Frist (3 Jahre alt) + ein paar Tage Puffer.
    const oldDate = berlinDate(now - DEFAULT_RETENTION_MS - 365 * 24 * 60 * 60 * 1000)
    const freshDate = berlinDate(now)
    insertUsage(userId, oldDate, 1)
    insertUsage(userId, freshDate, 1)

    const result = runDataRetention({ now })

    expect(result.customLemmaUsageDeleted).toBeGreaterThanOrEqual(1)
    const old = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?').get(userId, oldDate)
    const fresh = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?').get(userId, freshDate)
    expect(old).toBeUndefined()
    expect(fresh?.count).toBe(1)
  })

  it('behält Einträge exakt am Frist-Rand (Cutoff-Datum selbst)', () => {
    const now = Date.now()
    const userId = createUser()
    const cutoffDate = berlinDate(now - DEFAULT_RETENTION_MS)
    insertUsage(userId, cutoffDate, 2)

    runDataRetention({ now })

    // DELETE ... WHERE date < cutoff → das Cutoff-Datum selbst bleibt erhalten.
    const row = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?').get(userId, cutoffDate)
    expect(row?.count).toBe(2)
  })

  it('ist idempotent (zweiter Lauf löscht nichts mehr)', () => {
    const now = Date.now()
    const userId = createUser()
    const oldDate = berlinDate(now - DEFAULT_RETENTION_MS - 100 * 24 * 60 * 60 * 1000)
    insertUsage(userId, oldDate, 1)

    runDataRetention({ now })
    const second = runDataRetention({ now })
    expect(second.customLemmaUsageDeleted).toBe(0)
  })
})

describe('runDataRetention – payments', () => {
  it('löscht keine payments eines bestehenden Kontos, auch wenn uralt (Lizenznachweis)', () => {
    const now = Date.now()
    const userId = createUser()
    const ancient = now - DEFAULT_RETENTION_MS - 10 * 365 * 24 * 60 * 60 * 1000
    db.prepare(`
      INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
      VALUES (?, ?, '9.99', 'EUR', 'paid', 'gesamtausgabe', ?)
    `).run(`pay-${userId}`, userId, ancient)

    runDataRetention({ now })

    const row = db.prepare('SELECT id FROM payments WHERE user_id = ?').get(userId)
    expect(row?.id).toBe(`pay-${userId}`)
  })
})

describe('runDataRetention – payments ohne Konto (8 Jahre, § 147 AO)', () => {
  const ids = []
  const zahlung = (id, processedAt) => {
    db.prepare(`INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
                VALUES (?, NULL, '9.99', 'EUR', 'paid', 'gesamtausgabe', ?)`).run(id, processedAt)
    ids.push(id)
  }
  const gibtEs = (id) => !!db.prepare('SELECT 1 FROM payments WHERE id = ?').get(id)
  afterEach(() => { for (const id of ids) db.prepare('DELETE FROM payments WHERE id = ?').run(id); ids.length = 0 })

  it('Stichtag: Belege aus 2025 bleiben bis Ende 2033, gehen 2034', () => {
    expect(new Date(paymentCutoffMs(Date.parse('2034-06-01T12:00:00Z'))).toISOString()).toBe('2025-12-31T23:00:00.000Z')
    expect(new Date(paymentCutoffMs(Date.parse('2033-12-31T12:00:00Z'))).toISOString()).toBe('2024-12-31T23:00:00.000Z')
  })

  it('löscht abgelaufene Belege ohne Konto, behält laufende', () => {
    // Mit echter Uhr, damit der Sweep die gemeinsame Test-DB nicht mit einem Zukunftsdatum aufräumt.
    const now = Date.now()
    const grenze = paymentCutoffMs(now)
    zahlung('pay-test-alt', grenze - 24 * 60 * 60 * 1000)
    zahlung('pay-test-laufend', grenze + 24 * 60 * 60 * 1000)

    runDataRetention({ now })
    expect(gibtEs('pay-test-alt')).toBe(false)
    expect(gibtEs('pay-test-laufend')).toBe(true)
  })
})
