// Streak-Saver-Catch-up (2026-06-20): der 19:00-Abend-Push darf bei
// Neustart/Deploy weder verloren gehen noch doppelt rausgehen – aber NUR im
// Abendfenster (19–22 Uhr Berlin) nachgeholt werden, nie nachts. Marker:
// app_state.streak_push_last_sent (Berlin-Datum). Sender wird gemockt; ein
// garantiert eligible Kandidat wird geseedet, damit der Job tatsächlich sendet.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../notifications/sender.js', () => ({
  sendPushToUser: vi.fn().mockResolvedValue({ sent: 1, failed: 0 }),
}))

const { maybeCatchUpStreakSaver, runStreakSaverJob, hasSentToday, berlinDateStr } =
  await import('../notifications/streak.js')
const { sendPushToUser } = await import('../notifications/sender.js')
const { default: db } = await import('../db.js')
const { stmts } = await import('../store.js')

// Juni = CEST (UTC+2)
const BEFORE_19 = new Date('2026-06-20T15:00:00Z') // 17:00 Berlin
const IN_WINDOW = new Date('2026-06-20T17:30:00Z') // 19:30 Berlin
const TOO_LATE  = new Date('2026-06-20T21:30:00Z') // 23:30 Berlin

const SPIEL = `streak-sched-${Date.now()}`
const USER = `streak-sched-u-${Date.now()}`
const emptyDist = JSON.stringify(Array(11).fill(0))

function seedEligibleCandidate() {
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, '2026-01-01', '2026-01-01')
  `).run(USER, `${USER}@example.test`)
  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, apns_token, created_at, updated_at)
    VALUES (?, ?, 'web', ?, 'p', 'a', NULL, ?, ?)
  `).run(`sub-${USER}`, USER, `https://fcm.googleapis.com/${USER}`, Date.now(), Date.now())
  for (const datum of ['2026-06-17', '2026-06-18', '2026-06-19']) {
    stmts.upsertStats.run({ datum, spiel: SPIEL, user_id: USER, plays: 1, scoreSum: 8, maxSum: 10, dist: emptyDist })
  }
}

function clearMarker() {
  db.prepare("DELETE FROM app_state WHERE key = 'streak_push_last_sent'").run()
}

function setMarker(value) {
  db.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES ('streak_push_last_sent', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(value, Date.now())
}

function cleanup() {
  db.prepare('DELETE FROM stats WHERE spiel = ?').run(SPIEL)
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(USER)
  db.prepare('DELETE FROM user WHERE id = ?').run(USER)
  clearMarker()
}

describe('maybeCatchUpStreakSaver', () => {
  beforeEach(() => {
    cleanup()
    seedEligibleCandidate()
    vi.mocked(sendPushToUser).mockClear()
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 1, failed: 0 })
  })

  afterAll(cleanup)

  it('sendet NICHT vor 19:00 Berlin', async () => {
    expect(await maybeCatchUpStreakSaver(BEFORE_19)).toBe(false)
    expect(sendPushToUser).not.toHaveBeenCalled()
  })

  it('sendet NICHT mehr nach 22:00 Berlin (kein Nacht-Push)', async () => {
    expect(await maybeCatchUpStreakSaver(TOO_LATE)).toBe(false)
    expect(sendPushToUser).not.toHaveBeenCalled()
  })

  it('holt im Abendfenster nach und setzt den Marker', async () => {
    expect(await maybeCatchUpStreakSaver(IN_WINDOW)).toBe(true)
    expect(sendPushToUser).toHaveBeenCalled()
    expect(hasSentToday(IN_WINDOW)).toBe(true)
    expect(db.prepare("SELECT value FROM app_state WHERE key = 'streak_push_last_sent'").get().value)
      .toBe(berlinDateStr(IN_WINDOW))
  })

  it('sendet NICHT doppelt, wenn der Marker schon auf heute steht', async () => {
    setMarker(berlinDateStr(IN_WINDOW))
    expect(await maybeCatchUpStreakSaver(IN_WINDOW)).toBe(false)
    expect(sendPushToUser).not.toHaveBeenCalled()
  })

  it('Marker von gestern blockiert den heutigen Versand nicht', async () => {
    setMarker('2026-06-19')
    expect(await maybeCatchUpStreakSaver(IN_WINDOW)).toBe(true)
    expect(sendPushToUser).toHaveBeenCalled()
  })

  it('Fehler beim Versand setzt KEINEN Marker (nächster Versuch holt nach)', async () => {
    vi.mocked(sendPushToUser).mockRejectedValueOnce(new Error('APNs down'))
    await expect(runStreakSaverJob(IN_WINDOW)).rejects.toThrow('APNs down')
    expect(hasSentToday(IN_WINDOW)).toBe(false)
  })
})
