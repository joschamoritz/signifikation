import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'

// ── MOLLIE_API_KEY vor Modul-Import setzen ───────────────────────
// payments.js liest process.env.MOLLIE_API_KEY beim Laden – vi.hoisted
// läuft vor allen Imports.
vi.hoisted(() => {
  process.env.MOLLIE_API_KEY = 'test_dummy_key'
})

// ── Mollie-Client mocken (kein Netz in Tests) ────────────────────
const mollieMock = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
}))

vi.mock('@mollie/api-client', () => ({
  createMollieClient: () => ({
    payments: { create: mollieMock.create, get: mollieMock.get },
  }),
}))

// ── Mailer mocken (kein Mailversand in Tests) ────────────────────
vi.mock('../mailer.js', () => ({
  sendPurchaseConfirmation: vi.fn(),
}))

const { default: paymentsRouter } = await import('../routes/payments.js')

// ── DB-Helfer ────────────────────────────────────────────────────

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, @emailVerified, @image, @createdAt, @updatedAt)
`)

function createTestUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const userId = `pay-test-${suffix}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({
    id: userId,
    name: `Pay ${suffix.slice(-6)}`,
    email: `${suffix}@example.test`,
    emailVerified: 1,
    image: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  })
  return userId
}

function devHeaders(userId) {
  return {
    'content-type': 'application/json',
    'x-dev-user-id': userId,
    'x-dev-user-role': 'user',
  }
}

describe('payments routes integration', () => {
  let server
  let baseUrl
  const testUserIds = new Set()

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', paymentsRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })
    const address = server.address()
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterAll(async () => {
    // user-Delete cascadet auf payments + user_entitlements
    for (const userId of testUserIds) {
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId)
      db.prepare('DELETE FROM user WHERE id = ?').run(userId)
    }
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  beforeEach(() => {
    mollieMock.create.mockReset()
    mollieMock.get.mockReset()
  })

  // ── Checkout ───────────────────────────────────────────────────

  it('Checkout: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ price: '9.99', agreedToDigitalWaiver: true }),
    })
    expect(res.status).toBe(401)
  })

  it('Checkout: lehnt ungültigen Preis mit 400 ab', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: devHeaders(userId),
      body: JSON.stringify({ price: '1.00', agreedToDigitalWaiver: true }),
    })
    expect(res.status).toBe(400)
    expect(mollieMock.create).not.toHaveBeenCalled()
  })

  it('Checkout: lehnt fehlende Digital-Waiver-Zustimmung mit 400 ab', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: devHeaders(userId),
      body: JSON.stringify({ price: '9.99' }),
    })
    expect(res.status).toBe(400)
    expect(mollieMock.create).not.toHaveBeenCalled()
  })

  it('Checkout: liefert bei gültigem Request eine Mollie-Checkout-URL', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    mollieMock.create.mockResolvedValue({
      id: 'tr_checkout_ok',
      getCheckoutUrl: () => 'https://mollie.test/checkout/tr_checkout_ok',
    })

    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: devHeaders(userId),
      body: JSON.stringify({ price: '9.99', agreedToDigitalWaiver: true }),
    })
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.checkoutUrl).toBe('https://mollie.test/checkout/tr_checkout_ok')
    expect(mollieMock.create).toHaveBeenCalledOnce()
  })

  // ── Webhook (Kern-Businesslogik: Entitlement-Freischaltung) ─────

  it('Webhook: schaltet bei bezahltem Payment Entitlement + Premium-Rolle frei', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    const paymentId = `tr_webhook_${Math.random().toString(16).slice(2, 10)}`

    mollieMock.get.mockResolvedValue({
      id: paymentId,
      status: 'paid',
      amount: { value: '9.99', currency: 'EUR' },
      metadata: { userId, product: 'gesamtausgabe' },
    })

    const res = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `id=${encodeURIComponent(paymentId)}`,
    })
    expect(res.status).toBe(200)

    const entitlement = db.prepare(
      'SELECT gesamtausgabe_unlocked, source FROM user_entitlements WHERE user_id = ?'
    ).get(userId)
    expect(entitlement.gesamtausgabe_unlocked).toBe(1)
    expect(entitlement.source).toBe('mollie')

    const profile = db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(userId)
    expect(profile.role).toBe('premium')

    const paymentCount = db.prepare(
      'SELECT COUNT(*) AS n FROM payments WHERE id = ?'
    ).get(paymentId)
    expect(paymentCount.n).toBe(1)
  })

  it('Webhook: ist idempotent – ein zweiter Aufruf bucht nicht doppelt', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    const paymentId = `tr_idem_${Math.random().toString(16).slice(2, 10)}`

    mollieMock.get.mockResolvedValue({
      id: paymentId,
      status: 'paid',
      amount: { value: '9.99', currency: 'EUR' },
      metadata: { userId, product: 'gesamtausgabe' },
    })

    const body = `id=${encodeURIComponent(paymentId)}`
    const headers = { 'content-type': 'application/x-www-form-urlencoded' }

    const first = await fetch(`${baseUrl}/api/v1/payments/webhook`, { method: 'POST', headers, body })
    const second = await fetch(`${baseUrl}/api/v1/payments/webhook`, { method: 'POST', headers, body })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const paymentCount = db.prepare(
      'SELECT COUNT(*) AS n FROM payments WHERE user_id = ?'
    ).get(userId)
    expect(paymentCount.n).toBe(1)
  })

  it('Webhook: gefälschte Payment-ID (Mollie-404) schaltet nichts frei', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    const paymentId = `tr_fake_${Math.random().toString(16).slice(2, 10)}`

    mollieMock.get.mockRejectedValue({ statusCode: 404 })

    const res = await fetch(`${baseUrl}/api/v1/payments/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `id=${encodeURIComponent(paymentId)}`,
    })
    expect(res.status).toBe(404)

    const entitlement = db.prepare(
      'SELECT gesamtausgabe_unlocked FROM user_entitlements WHERE user_id = ?'
    ).get(userId)
    expect(entitlement).toBeUndefined()
  })
})
