// Unzustellbare Push-Abos (Security-Audit run-2): Nach 5 Fehlversuchen in Folge löscht der Sender das Abo,
// ein Erfolg setzt den Zähler zurück. web-push ist ersetzt; sendNotification scheitert wie die echte Bibliothek
// bei kaputtem Schlüssel oder Netzfehler (Fehler ohne statusCode).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const webpushMock = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }))
vi.mock('web-push', () => ({ default: webpushMock }))

const KAPUTT = `push-fehl-kaputt-${Date.now()}`
const WACKEL = `push-fehl-wackel-${Date.now()}`

describe('Push-Sender zählt Fehlversuche', () => {
  let sender
  let db
  const zeile = (id) => db.prepare('SELECT fehlversuche FROM push_subscriptions WHERE id = ?').get(id)

  beforeAll(async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private')
    vi.stubEnv('VAPID_MAILTO', 'mailto:test@signifikation.de')
    vi.resetModules()
    sender = await import('../notifications/sender.js')
    db = (await import('../db.js')).default
    const neu = db.prepare(`INSERT INTO push_subscriptions (id, user_id, platform, endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, NULL, 'web', ?, 'kurz', 'auth', ?, ?)`)
    neu.run(KAPUTT, `https://fcm.googleapis.com/fcm/send/${KAPUTT}`, Date.now(), Date.now())
    neu.run(WACKEL, `https://fcm.googleapis.com/fcm/send/${WACKEL}`, Date.now(), Date.now())
  })

  afterAll(() => {
    db.prepare('DELETE FROM push_subscriptions WHERE id IN (?, ?)').run(KAPUTT, WACKEL)
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('löscht ein Abo nach 5 Fehlversuchen in Folge, ein Erfolg setzt den Zähler zurück', async () => {
    webpushMock.sendNotification.mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith(KAPUTT)) throw new Error('The subscription p256dh value should be 65 bytes long.')
      throw new Error('getaddrinfo ENOTFOUND')
    })
    for (let i = 0; i < 4; i++) await sender.sendPushToAll({ title: 'T', body: 'B' })
    expect(zeile(KAPUTT).fehlversuche).toBe(4)
    expect(zeile(WACKEL).fehlversuche).toBe(4)

    // Das wackelige Abo kommt einmal durch, das kaputte scheitert zum fünften Mal
    webpushMock.sendNotification.mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith(KAPUTT)) throw new Error('The subscription p256dh value should be 65 bytes long.')
      return { statusCode: 201 }
    })
    await sender.sendPushToAll({ title: 'T', body: 'B' })
    expect(zeile(KAPUTT)).toBeUndefined()
    expect(zeile(WACKEL).fehlversuche).toBe(0)
  })
})
