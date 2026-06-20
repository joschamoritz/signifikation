// Streak-Saver (2026-06-20): die Server-Streak-Ableitung muss deckungsgleich
// mit dem Client (src/utils/homeUtils.js computeStreak) sein und die
// Zielgruppe (gestern gespielt, heute nicht, >= MIN_STREAK, mit Push-Gerät)
// korrekt bestimmen. Reine Funktionen + DB-Integration, keine Mocks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import db from '../db.js'
import { stmts } from '../store.js'
import {
  computeStreakFromDates,
  computeServerStreak,
  eligibleStreakSavers,
  shiftDate,
} from '../notifications/streak.js'
import { buildStreakPayload } from '../notifications/templates.js'

const NOW = new Date('2026-06-20T12:00:00Z') // 14:00 Berlin → heute = 2026-06-20
const TODAY = '2026-06-20'
const SPIEL = `streak-test-${Date.now()}`
const PREFIX = `streak-test-u-${Date.now()}`

const emptyDist = JSON.stringify(Array(11).fill(0))

function uid(suffix) {
  return `${PREFIX}-${suffix}`
}

function addUser(id) {
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(id, 'Test', `${id}@example.test`, '2026-01-01', '2026-01-01')
}

function addSub(id) {
  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, apns_token, created_at, updated_at)
    VALUES (?, ?, 'web', ?, 'p', 'a', NULL, ?, ?)
  `).run(`sub-${id}`, id, `https://fcm.googleapis.com/${id}`, Date.now(), Date.now())
}

function play(userId, datum) {
  stmts.upsertStats.run({ datum, spiel: SPIEL, user_id: userId, plays: 1, scoreSum: 8, maxSum: 10, dist: emptyDist })
}

function cleanup() {
  db.prepare('DELETE FROM stats WHERE spiel = ?').run(SPIEL)
  db.prepare("DELETE FROM push_subscriptions WHERE user_id LIKE ?").run(`${PREFIX}-%`)
  db.prepare("DELETE FROM user WHERE id LIKE ?").run(`${PREFIX}-%`)
}

describe('computeStreakFromDates (reine Funktion)', () => {
  it('zählt aufeinanderfolgende Tage bis heute', () => {
    expect(computeStreakFromDates(['2026-06-20', '2026-06-19', '2026-06-18'], TODAY)).toBe(3)
  })

  it('verankert an gestern, wenn heute noch nicht gespielt', () => {
    expect(computeStreakFromDates(['2026-06-19', '2026-06-18'], TODAY)).toBe(2)
  })

  it('ist 0, wenn weder heute noch gestern gespielt wurde', () => {
    expect(computeStreakFromDates(['2026-06-18', '2026-06-17'], TODAY)).toBe(0)
  })

  it('bricht bei einer Lücke ab', () => {
    expect(computeStreakFromDates(['2026-06-20', '2026-06-18', '2026-06-17'], TODAY)).toBe(1)
  })

  it('ist 0 bei leerer Menge', () => {
    expect(computeStreakFromDates([], TODAY)).toBe(0)
  })

  it('ignoriert Duplikate (Set-Semantik)', () => {
    expect(computeStreakFromDates(['2026-06-20', '2026-06-20', '2026-06-19'], TODAY)).toBe(2)
  })
})

describe('shiftDate', () => {
  it('rechnet über Monatsgrenzen (UTC, DST-fest)', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-06-19', 1)).toBe('2026-06-20')
  })
})

describe('computeServerStreak / eligibleStreakSavers (DB)', () => {
  const userA = uid('a') // streak 3, kein Spiel heute, mit Push → eligible
  const userB = uid('b') // streak 2, mit Push → unter Schwelle
  const userC = uid('c') // streak 4 inkl. heute gespielt → ausgeschlossen
  const userD = uid('d') // streak 3, aber KEIN Push-Gerät → ausgeschlossen

  beforeAll(() => {
    cleanup()
    for (const u of [userA, userB, userC, userD]) addUser(u)
    for (const u of [userA, userB, userC]) addSub(u) // D bewusst ohne Sub

    play(userA, '2026-06-17'); play(userA, '2026-06-18'); play(userA, '2026-06-19')
    play(userB, '2026-06-18'); play(userB, '2026-06-19')
    play(userC, '2026-06-17'); play(userC, '2026-06-18'); play(userC, '2026-06-19'); play(userC, TODAY)
    play(userD, '2026-06-17'); play(userD, '2026-06-18'); play(userD, '2026-06-19')
  })

  afterAll(cleanup)

  it('computeServerStreak verankert an gestern, wenn heute fehlt', () => {
    expect(computeServerStreak(userA, NOW)).toBe(3)
    expect(computeServerStreak(userB, NOW)).toBe(2)
  })

  it('computeServerStreak zählt heute mit, wenn heute gespielt', () => {
    expect(computeServerStreak(userC, NOW)).toBe(4)
  })

  it('eligibleStreakSavers liefert nur Abonnenten mit aktiver Serie >= Schwelle, die heute nicht gespielt haben', () => {
    const savers = eligibleStreakSavers(NOW)
    const byId = new Map(savers.map((s) => [s.userId, s.streak]))

    expect(byId.get(userA)).toBe(3)   // eligible
    expect(byId.has(userB)).toBe(false) // streak 2 < 3
    expect(byId.has(userC)).toBe(false) // heute schon gespielt
    expect(byId.has(userD)).toBe(false) // kein Push-Gerät
  })

  it('respektiert eine abweichende minStreak-Schwelle', () => {
    const savers = eligibleStreakSavers(NOW, { minStreak: 2 })
    const byId = new Map(savers.map((s) => [s.userId, s.streak]))
    expect(byId.get(userA)).toBe(3)
    expect(byId.get(userB)).toBe(2) // jetzt eligible
    expect(byId.has(userC)).toBe(false)
    expect(byId.has(userD)).toBe(false)
  })
})

describe('buildStreakPayload', () => {
  it('rendert die Serienlänge in den Push-Text und nutzt das Streak-Emoji', () => {
    const payload = buildStreakPayload(NOW, 7)
    expect(payload.title).toContain('7')
    expect(payload.title).toContain('🔥')
    expect(payload.url).toBe('/')
    expect(typeof payload.body).toBe('string')
    expect(payload.body.length).toBeGreaterThan(0)
  })
})
