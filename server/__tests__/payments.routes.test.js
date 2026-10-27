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
// isMailConfigured/sendWelcomeMail/sendPasswordResetMail werden von
// auth/index.js gezogen, das ueber middleware/userAuth.js mitgeladen wird.
vi.mock('../mailer.js', () => ({
  isMailConfigured: vi.fn(() => false),
  sendPurchaseConfirmation: vi.fn(),
  sendPasswordResetMail: vi.fn(),
  sendWelcomeMail: vi.fn(),
}))

// ── GeoIP mocken (deterministisch statt von der echten, gitignoreten
// Länderdatenbank abzuhängen -- Default null = fail-open, wie ohne Datenbank) ──
const geoipMock = vi.hoisted(() => ({
  lookupCountry: vi.fn(() => null),
}))
vi.mock('../geoip.js', () => ({
  lookupCountry: geoipMock.lookupCountry,
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
    geoipMock.lookupCountry.mockReset()
    geoipMock.lookupCountry.mockReturnValue(null)
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

  // ── Mollie-Deutschland-Beschränkung, Stufe 2 (GeoIP-Backstop) ───

  it('Checkout: lehnt eindeutig nicht-deutsche IP mit 403 ab', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    geoipMock.lookupCountry.mockReturnValue('FR')

    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: devHeaders(userId),
      body: JSON.stringify({ price: '9.99', agreedToDigitalWaiver: true }),
    })

    expect(res.status).toBe(403)
    expect(mollieMock.create).not.toHaveBeenCalled()
  })

  it('Checkout: lässt unbekannte IP durch (fail-open, kein Block ohne Datenbank/bei IPv6)', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    geoipMock.lookupCountry.mockReturnValue(null)
    mollieMock.create.mockResolvedValue({
      id: 'tr_checkout_unknown_ip',
      getCheckoutUrl: () => 'https://mollie.test/checkout/tr_checkout_unknown_ip',
    })

    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: devHeaders(userId),
      body: JSON.stringify({ price: '9.99', agreedToDigitalWaiver: true }),
    })

    expect(res.status).toBe(200)
    expect(mollieMock.create).toHaveBeenCalledOnce()
  })

  it('Checkout: eine deutsche IP wird nicht geblockt', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    geoipMock.lookupCountry.mockReturnValue('DE')
    mollieMock.create.mockResolvedValue({
      id: 'tr_checkout_de',
      getCheckoutUrl: () => 'https://mollie.test/checkout/tr_checkout_de',
    })

    const res = await fetch(`${baseUrl}/api/v1/payments/checkout`, {
      method: 'POST',
      headers: devHeaders(userId),
      body: JSON.stringify({ price: '9.99', agreedToDigitalWaiver: true }),
    })

    expect(res.status).toBe(200)
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

  it('Webhook: ein Kauf stuft ein Admin-Konto nicht auf premium herab (Entitlement wird trotzdem gesetzt)', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    const now = Date.now()
    db.prepare('INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'admin', now, now)
    const paymentId = `tr_admin_${Math.random().toString(16).slice(2, 10)}`
    const profileVorher = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId)

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

    const entitlement = db.prepare('SELECT gesamtausgabe_unlocked, source FROM user_entitlements WHERE user_id = ?').get(userId)
    expect(entitlement.gesamtausgabe_unlocked).toBe(1)
    expect(entitlement.source).toBe('mollie')
    // Rolle und Zeile (auch updated_at) bleiben unveraendert
    expect(db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId)).toEqual(profileVorher)
    expect(db.prepare('SELECT COUNT(*) AS n FROM payments WHERE id = ?').get(paymentId).n).toBe(1)
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

  // ── Erstattungen ──────────────────────────────────────────────
  const webhook = (paymentId) => fetch(`${baseUrl}/api/v1/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `id=${encodeURIComponent(paymentId)}`,
  })
  const statusVon = (paymentId) => db.prepare('SELECT status FROM payments WHERE id = ?').get(paymentId)?.status

  async function kaufeUeberWebhook() {
    const userId = createTestUser()
    testUserIds.add(userId)
    const paymentId = `tr_erst${Math.random().toString(16).slice(2, 10)}`
    const zahlung = { id: paymentId, status: 'paid', amount: { value: '9.99', currency: 'EUR' }, metadata: { userId, product: 'gesamtausgabe' } }
    mollieMock.get.mockResolvedValue(zahlung)
    expect((await webhook(paymentId)).status).toBe(200)
    expect(statusVon(paymentId)).toBe('paid')
    return { userId, paymentId, zahlung }
  }

  it('Webhook: volle Erstattung setzt den Kauf auf refunded, die Freischaltung bleibt', async () => {
    const { userId, paymentId, zahlung } = await kaufeUeberWebhook()
    mollieMock.get.mockResolvedValue({ ...zahlung, amountRefunded: { value: '9.99', currency: 'EUR' }, amountRemaining: { value: '0.00', currency: 'EUR' } })
    expect((await webhook(paymentId)).status).toBe(200)
    expect(statusVon(paymentId)).toBe('refunded')
    expect(db.prepare('SELECT gesamtausgabe_unlocked AS u FROM user_entitlements WHERE user_id = ?').get(userId).u).toBe(1)
    const eintrag = db.prepare(`SELECT changes_json FROM audit_log WHERE action = 'PAYMENT_REFUNDED' AND changes_json LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${paymentId}%`)
    expect(eintrag).toBeTruthy()
    // Ein weiterer Aufruf (Mollie wiederholt) ändert nichts mehr
    expect((await webhook(paymentId)).status).toBe(200)
    expect(statusVon(paymentId)).toBe('refunded')
  })

  it('Webhook: Rückbuchung zählt als erstattet, Teil-Erstattung nicht', async () => {
    const teil = await kaufeUeberWebhook()
    mollieMock.get.mockResolvedValue({ ...teil.zahlung, amountRefunded: { value: '5.00', currency: 'EUR' } })
    expect((await webhook(teil.paymentId)).status).toBe(200)
    expect(statusVon(teil.paymentId)).toBe('paid')

    const rueck = await kaufeUeberWebhook()
    mollieMock.get.mockResolvedValue({ ...rueck.zahlung, amountChargedBack: { value: '9.99', currency: 'EUR' } })
    expect((await webhook(rueck.paymentId)).status).toBe(200)
    expect(statusVon(rueck.paymentId)).toBe('refunded')
  })

  it('Webhook: eine schon erstattete Zahlung ohne Kaufzeile schaltet nichts frei', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)
    const paymentId = `tr_spaet${Math.random().toString(16).slice(2, 10)}`
    mollieMock.get.mockResolvedValue({ id: paymentId, status: 'paid', amount: { value: '9.99', currency: 'EUR' }, amountRefunded: { value: '9.99', currency: 'EUR' }, metadata: { userId, product: 'gesamtausgabe' } })
    expect((await webhook(paymentId)).status).toBe(200)
    expect(statusVon(paymentId)).toBeUndefined()
    expect(db.prepare('SELECT 1 FROM user_entitlements WHERE user_id = ?').get(userId)).toBeUndefined()
  })
})
