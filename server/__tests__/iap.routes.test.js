import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Mailer mocken (kein Mailversand, kein nodemailer-Init in Tests)
vi.mock('../mailer.js', () => ({
  sendPurchaseConfirmation: vi.fn(),
}))

const { default: iapRouter, deriveAppAccountToken } = await import('../routes/iap.js')

const VALID_PRODUCT_ID = 'de.signifikation.gesamtausgabe.korpus'

function devHeaders(userId = `iap-test-${Date.now()}`) {
  return {
    'content-type': 'application/json',
    'x-dev-user-id': userId,
    'x-dev-user-role': 'user',
  }
}

describe('iap routes integration (flache Validierung)', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', iapRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })
    const address = server.address()
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  // ── /api/v1/iap/verify ─────────────────────────────────────────

  it('verify: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jwsRepresentation: 'x', productId: VALID_PRODUCT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it('verify: lehnt fehlendes jwsRepresentation mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ productId: VALID_PRODUCT_ID }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  it('verify: lehnt unbekannte productId mit 400 ab', async () => {
    // JWS muss min(50) + Base64URL-Pattern erfüllen, sonst greift die jws-Validierung zuerst.
    const dummyJws = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ jwsRepresentation: dummyJws, productId: 'de.signifikation.unbekannt' }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  it('verify: ungültiges JWS-Token scheitert sauber mit 400, nicht 500', async () => {
    // Lang genug + Base64URL-Pattern, damit es durch die Zod-Vorprüfung kommt
    // und die echte JWS-Verifikation in verifyAppleJWS scheitert.
    const dummyJws = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ jwsRepresentation: dummyJws, productId: VALID_PRODUCT_ID }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(payload.error).toBe('Transaktion konnte nicht verifiziert werden')
  })

  // ── /api/v1/iap/restore ────────────────────────────────────────

  it('restore: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactions: [] }),
    })
    expect(res.status).toBe(401)
  })

  it('restore: lehnt fehlendes transactions-Array mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/restore`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({}),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  // ── /api/v1/iap/app-account-token ──────────────────────────────

  it('app-account-token: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/app-account-token`)
    expect(res.status).toBe(401)
  })

  it('app-account-token: liefert pro User ein stabiles UUID', async () => {
    const headers = devHeaders('iap-token-user')
    const res1 = await fetch(`${baseUrl}/api/v1/iap/app-account-token`, { headers })
    const res2 = await fetch(`${baseUrl}/api/v1/iap/app-account-token`, { headers })
    const { appAccountToken: t1 } = await res1.json()
    const { appAccountToken: t2 } = await res2.json()

    expect(res1.status).toBe(200)
    expect(t1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(t1).toBe(t2)
  })
})

describe('deriveAppAccountToken', () => {
  it('ist deterministisch und unterscheidet User', () => {
    expect(deriveAppAccountToken('user-a')).toBe(deriveAppAccountToken('user-a'))
    expect(deriveAppAccountToken('user-a')).not.toBe(deriveAppAccountToken('user-b'))
  })

  it('erzeugt gültige UUIDv5 (Version + Variante)', () => {
    const token = deriveAppAccountToken('irgendein-user')
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
