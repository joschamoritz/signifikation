import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Mailer mocken (kein Mailversand, kein nodemailer-Init in Tests)
vi.mock('../mailer.js', () => ({
  sendPurchaseConfirmation: vi.fn(),
}))

const { default: iapRouter } = await import('../routes/iap.js')

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
    expect(payload.error).toBe('jwsRepresentation erforderlich')
  })

  it('verify: lehnt unbekannte productId mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ jwsRepresentation: 'fake.jws.token', productId: 'de.signifikation.unbekannt' }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(payload.error).toBe('Ungültige productId')
  })

  it('verify: ungültiges JWS-Token scheitert sauber mit 400, nicht 500', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ jwsRepresentation: 'kein.gueltiges.jws', productId: VALID_PRODUCT_ID }),
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
    expect(payload.error).toBe('transactions (Array) erforderlich')
  })
})
