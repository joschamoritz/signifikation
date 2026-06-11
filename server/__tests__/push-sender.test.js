// Push-Sender-Regression (Review 2026-06-11, T-M1; Outage 2026-05-26):
// Ein unlesbarer/fehlender APNs-Key darf weder den Modul-Load crashen
// (Boot-Abbruch!) noch sendPushToAll werfen lassen — der Job muss degraded
// weiterlaufen und web-push-Subscriptions weiter bedienen.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const SUB_ID = `push-sender-test-${Date.now()}`

describe('notifications/sender mit kaputtem APNs-Key', () => {
  let sender
  let db

  beforeAll(async () => {
    vi.stubEnv('APNS_KEY_ID', 'TESTKEYID')
    vi.stubEnv('APNS_TEAM_ID', 'TESTTEAM')
    vi.stubEnv('APNS_KEY_PATH', '/nonexistent/pfad/AuthKey_FAKE.p8')
    vi.resetModules()

    // Import darf trotz unlesbarem Key nicht werfen (Regression: Boot-Crash)
    sender = await import('../notifications/sender.js')
    db = (await import('../db.js')).default

    db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, apns_token, created_at, updated_at)
      VALUES (?, NULL, 'ios', NULL, NULL, NULL, ?, ?, ?)
    `).run(SUB_ID, `fake-apns-token-${SUB_ID}`, Date.now(), Date.now())
  })

  afterAll(() => {
    db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(SUB_ID)
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('Modul laedt ohne Exception', () => {
    expect(typeof sender.sendPushToAll).toBe('function')
  })

  it('sendPushToAll wirft nicht und zaehlt die iOS-Subscription als failed', async () => {
    const result = await sender.sendPushToAll({ title: 'Test', body: 'Test' })
    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.sent).toBe(0)
    expect(result.failed).toBeGreaterThanOrEqual(1)
  })
})
