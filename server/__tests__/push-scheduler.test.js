// Push-Catch-up (Review 2026-06-11, B-M7): Der 08:00-Push darf bei einem
// Neustart/Deploy um die Versandzeit weder verloren gehen noch doppelt
// rausgehen. Marker: app_state.push_last_sent (Berlin-Datum).
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../notifications/sender.js', () => ({
  sendPushToAll: vi.fn().mockResolvedValue({ sent: 2, failed: 0, total: 2 }),
}))
vi.mock('../notifications/templates.js', () => ({
  buildNotificationPayload: vi.fn().mockReturnValue({ title: 'Test', body: 'Test' }),
}))

const { maybeCatchUpPush, hasSentToday, berlinDateStr } = await import('../notifications/scheduler.js')
const { sendPushToAll } = await import('../notifications/sender.js')
const { default: db } = await import('../db.js')

// Juni = CEST (UTC+2): 05:30Z = 07:30 Berlin, 06:30Z = 08:30 Berlin
const BEFORE_8 = new Date('2026-06-11T05:30:00Z')
const AFTER_8  = new Date('2026-06-11T06:30:00Z')

function clearMarker() {
  db.prepare("DELETE FROM app_state WHERE key = 'push_last_sent'").run()
}

function setMarker(value) {
  db.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES ('push_last_sent', ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(value, Date.now())
}

describe('maybeCatchUpPush', () => {
  beforeEach(() => {
    clearMarker()
    vi.mocked(sendPushToAll).mockClear()
  })

  it('sendet NICHT vor 08:00 Berlin', async () => {
    expect(await maybeCatchUpPush(BEFORE_8)).toBe(false)
    expect(sendPushToAll).not.toHaveBeenCalled()
  })

  it('holt nach 08:00 nach, wenn heute noch nichts raus ging, und setzt den Marker', async () => {
    expect(await maybeCatchUpPush(AFTER_8)).toBe(true)
    expect(sendPushToAll).toHaveBeenCalledTimes(1)
    expect(hasSentToday(AFTER_8)).toBe(true)
    expect(db.prepare("SELECT value FROM app_state WHERE key = 'push_last_sent'").get().value)
      .toBe(berlinDateStr(AFTER_8))
  })

  it('sendet NICHT doppelt, wenn der Marker schon auf heute steht', async () => {
    setMarker(berlinDateStr(AFTER_8))
    expect(await maybeCatchUpPush(AFTER_8)).toBe(false)
    expect(sendPushToAll).not.toHaveBeenCalled()
  })

  it('Marker von gestern blockiert den heutigen Versand nicht', async () => {
    setMarker('2026-06-10')
    expect(await maybeCatchUpPush(AFTER_8)).toBe(true)
    expect(sendPushToAll).toHaveBeenCalledTimes(1)
  })

  it('Fehler beim Versand setzt KEINEN Marker (naechster Versuch holt nach)', async () => {
    vi.mocked(sendPushToAll).mockRejectedValueOnce(new Error('APNs down'))
    await expect(maybeCatchUpPush(AFTER_8)).rejects.toThrow('APNs down')
    expect(hasSentToday(AFTER_8)).toBe(false)
  })
})
