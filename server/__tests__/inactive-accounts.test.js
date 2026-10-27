/**
 * Löschfrist für inaktive Konten (server/jobs/inactiveAccounts.js):
 * Warnung 30 Tage vor Ablauf von 24 Monaten, Löschung frühestens 30 Tage nach
 * der Warnung, Aktivität hebt die Warnung auf, Admins ausgenommen.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { runInactiveAccounts, INACTIVE_DAYS, WARNING_LEAD_DAYS } from '../jobs/inactiveAccounts.js'
import { touchUserActivity } from '../middleware/userAuth.js'

const TAG = 24 * 60 * 60 * 1000
const NOW = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const angelegt = []

function konto({ lastActiveMs, role = 'user' }) {
  const id = `inaktiv-test-${Math.random().toString(16).slice(2, 10)}`
  db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, 'Inaktiv Test', ?, 1, NULL, ?, ?)`)
    .run(id, `${id}@inaktiv.test`, iso(lastActiveMs), iso(lastActiveMs))
  db.prepare(`INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(id, role, lastActiveMs, lastActiveMs)
  db.prepare(`INSERT INTO user_activity (user_id, last_active_at) VALUES (?, ?)`).run(id, iso(lastActiveMs))
  angelegt.push(id)
  return id
}
const gibtEs = (id) => !!db.prepare('SELECT 1 FROM user WHERE id = ?').get(id)
const gewarnt = (id) => db.prepare('SELECT inactivity_warned_at AS w FROM user_activity WHERE user_id = ?').get(id)?.w ?? null
const nurMeine = () => vi.fn(async ({ to }) => (to.endsWith('@inaktiv.test') ? { messageId: 'x' } : { messageId: 'fremd' }))

afterEach(() => {
  for (const id of angelegt) {
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM user WHERE id = ?').run(id)
  }
  angelegt.length = 0
})

describe('runInactiveAccounts', () => {
  const faellig = NOW - (INACTIVE_DAYS - WARNING_LEAD_DAYS + 1) * TAG

  it('warnt 30 Tage vor Ablauf und löscht erst 30 Tage nach der Warnung', async () => {
    const id = konto({ lastActiveMs: faellig })
    const sendMail = nurMeine()

    await runInactiveAccounts({ now: NOW, sendMail, mailReady: true })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: `${id}@inaktiv.test` }))
    const { deleteOn } = sendMail.mock.calls.find((c) => c[0].to === `${id}@inaktiv.test`)[0]
    expect(deleteOn.getTime()).toBeGreaterThanOrEqual(NOW + WARNING_LEAD_DAYS * TAG)
    expect(gewarnt(id)).toBe(iso(NOW))
    expect(gibtEs(id)).toBe(true)

    // zweiter Lauf am selben Tag: keine zweite Mail, keine Löschung
    sendMail.mockClear()
    await runInactiveAccounts({ now: NOW + TAG, sendMail, mailReady: true })
    expect(sendMail.mock.calls.some((c) => c[0].to === `${id}@inaktiv.test`)).toBe(false)
    expect(gibtEs(id)).toBe(true)

    await runInactiveAccounts({ now: NOW + (WARNING_LEAD_DAYS + 1) * TAG, sendMail, mailReady: true })
    expect(gibtEs(id)).toBe(false)
  })

  it('Anmeldung nach der Warnung hebt sie auf', async () => {
    const id = konto({ lastActiveMs: faellig })
    await runInactiveAccounts({ now: NOW, sendMail: nurMeine(), mailReady: true })
    expect(gewarnt(id)).not.toBe(null)

    touchUserActivity(id, NOW + TAG)
    expect(gewarnt(id)).toBe(null)
    await runInactiveAccounts({ now: NOW + (WARNING_LEAD_DAYS + 1) * TAG, sendMail: nurMeine(), mailReady: true })
    expect(gibtEs(id)).toBe(true)
  })

  it('frisch aktive Konten und Admins bleiben unberührt', async () => {
    const aktiv = konto({ lastActiveMs: NOW - 10 * TAG })
    const admin = konto({ lastActiveMs: NOW - 3 * INACTIVE_DAYS * TAG, role: 'admin' })
    const sendMail = nurMeine()
    await runInactiveAccounts({ now: NOW, sendMail, mailReady: true })
    expect(sendMail.mock.calls.some((c) => [aktiv, admin].some((id) => c[0].to === `${id}@inaktiv.test`))).toBe(false)
    expect(gewarnt(aktiv)).toBe(null)
    expect(gewarnt(admin)).toBe(null)
  })

  it('Käuferkonten werden weder gewarnt noch gelöscht, erstattete Käufe zählen nicht', async () => {
    const kaeufer = konto({ lastActiveMs: NOW - 3 * INACTIVE_DAYS * TAG })
    const erstattet = konto({ lastActiveMs: faellig })
    const zahlung = (id, userId, status) => db.prepare(
      `INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at) VALUES (?, ?, '9.00', 'EUR', ?, 'gesamtausgabe', ?)`,
    ).run(id, userId, status, NOW)
    zahlung(`tr_${kaeufer}`, kaeufer, 'paid')
    zahlung(`tr_${erstattet}`, erstattet, 'refunded')
    // Bereits gewarnt (z. B. Kauf nach altem Stand) darf trotzdem nicht gelöscht werden
    db.prepare('UPDATE user_activity SET inactivity_warned_at = ? WHERE user_id = ?').run(iso(NOW - 60 * TAG), kaeufer)

    try {
      const sendMail = nurMeine()
      await runInactiveAccounts({ now: NOW, sendMail, mailReady: true })
      expect(gibtEs(kaeufer)).toBe(true)
      expect(sendMail.mock.calls.some((c) => c[0].to === `${kaeufer}@inaktiv.test`)).toBe(false)
      expect(sendMail.mock.calls.some((c) => c[0].to === `${erstattet}@inaktiv.test`)).toBe(true)
    } finally {
      db.prepare('DELETE FROM payments WHERE id IN (?, ?)').run(`tr_${kaeufer}`, `tr_${erstattet}`)
    }
  })

  it('ohne verschickte Warnung keine Löschung', async () => {
    const id = konto({ lastActiveMs: NOW - 3 * INACTIVE_DAYS * TAG })
    await runInactiveAccounts({ now: NOW, sendMail: async () => null, mailReady: true })
    expect(gewarnt(id)).toBe(null)
    await runInactiveAccounts({ now: NOW + 60 * TAG, sendMail: async () => null, mailReady: true })
    expect(gibtEs(id)).toBe(true)

    const r = await runInactiveAccounts({ now: NOW, sendMail: nurMeine(), mailReady: false })
    expect(r).toEqual({ warned: 0, deleted: 0 })
    expect(gibtEs(id)).toBe(true)
  })
})
