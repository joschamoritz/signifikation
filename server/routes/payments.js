import express from 'express'
import { z } from 'zod/v3'
import { createMollieClient } from '@mollie/api-client'
import { requireAuthUser } from '../middleware/userAuth.js'
import { validate } from '../middleware/validate.js'
import db from '../db.js'
import logger from '../logger.js'
import { sendPurchaseConfirmation } from '../mailer.js'
import { auditSecurity } from '../audit.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY?.trim()

// Mollie Webhook IP-Ranges (Stand: 2024)
// Quelle: https://docs.mollie.com/overview/webhooks#webhook-security
const MOLLIE_IP_RANGES = [
  '91.218.240.0/22',  // 91.218.240.0 - 91.218.243.255
  '91.218.244.0/22',  // 91.218.244.0 - 91.218.247.255
]

function ipToInt(ip) {
  return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0
}

function isIpInRange(ip, cidr) {
  const [range, bits] = cidr.split('/')
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1)
  return (ipToInt(ip) & mask) === (ipToInt(range) & mask)
}

function normalizeIp(ip) {
  if (!ip) return ''
  // IPv4-mapped IPv6-Adressen normalisieren (z.B. ::ffff:91.218.240.1 → 91.218.240.1)
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

function isValidMollieIP(ip) {
  if (!ip) return false
  return MOLLIE_IP_RANGES.some(range => isIpInRange(normalizeIp(ip), range))
}

const VALID_PRICES = ['6.99', '9.99', '14.99']
const GESAMTAUSGABE_PRODUCT = 'gesamtausgabe'

const checkoutSchema = z.object({
  price: z.string().refine(v => VALID_PRICES.includes(v), { message: 'Ungültiger Preis.' }),
  agreedToDigitalWaiver: z.literal(true, {
    errorMap: () => ({ message: 'Bitte Zustimmung zum sofortigen Beginn der digitalen Inhalte bestätigen.' }),
  }),
})

const BASE_URL = IS_PROD
  ? 'https://signifikation.de'
  : `http://localhost:${process.env.PORT || 3001}`

const router = express.Router()

// Lazy-Init: Client wird erst beim ersten Aufruf erstellt.
// Ohne API-Key im Dev-Modus startet der Server trotzdem.
let _mollie = null
function getMollie() {
  if (_mollie) return _mollie
  if (!MOLLIE_API_KEY) throw new Error('MOLLIE_API_KEY ist nicht gesetzt')
  _mollie = createMollieClient({ apiKey: MOLLIE_API_KEY })
  return _mollie
}

// ── Prepared Statements ────────────────────────────────────────

const getPaidPaymentStmt = db.prepare(`
  SELECT id FROM payments
  WHERE user_id = ? AND product = ? AND status = 'paid'
  LIMIT 1
`)

const getPaymentByIdStmt = db.prepare(`
  SELECT id FROM payments WHERE id = ?
`)

const insertPaymentStmt = db.prepare(`
  INSERT OR IGNORE INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (?, ?, ?, 'EUR', ?, ?, ?)
`)

const ensureEntitlementStmt = db.prepare(`
  INSERT INTO user_entitlements (
    user_id, gesamtausgabe_unlocked, unlocked_at, source, created_at, updated_at
  )
  VALUES (?, 0, NULL, 'none', ?, ?)
  ON CONFLICT(user_id) DO NOTHING
`)

const unlockEntitlementStmt = db.prepare(`
  UPDATE user_entitlements
  SET
    gesamtausgabe_unlocked = 1,
    unlocked_at = CASE WHEN unlocked_at IS NULL THEN ? ELSE unlocked_at END,
    source = CASE WHEN gesamtausgabe_unlocked = 1 THEN source ELSE 'mollie' END,
    updated_at = ?
  WHERE user_id = ?
`)

const setPremiumRoleStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, 'premium', ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    role = 'premium',
    updated_at = excluded.updated_at
`)

// ── POST /api/v1/payments/checkout ───────────────────────────
// Erstellt eine Mollie-Zahlung und gibt die Checkout-URL zurück.
// Erfordert eingeloggten Nutzer.

router.post('/api/v1/payments/checkout', requireAuthUser, validate(checkoutSchema), async (req, res) => {
  try {
    const { price } = req.body

    // Bereits bezahlt?
    const existing = getPaidPaymentStmt.get(req.user.id, GESAMTAUSGABE_PRODUCT)
    if (existing) {
      return res.status(409).json({ error: 'Gesamtausgabe bereits erworben' })
    }

    const client = getMollie()
    const payment = await client.payments.create({
      amount: { currency: 'EUR', value: price },
      description: 'Gesamtausgabe – Signifikation',
      redirectUrl: `${BASE_URL}/?payment=success`,
      webhookUrl: `${BASE_URL}/api/v1/payments/webhook`,
      metadata: {
        userId: req.user.id,
        product: GESAMTAUSGABE_PRODUCT,
      },
    })

    const checkoutUrl = payment.getCheckoutUrl()
    if (!checkoutUrl) {
      logger.error({ userId: req.user.id, paymentId: payment.id }, 'Mollie lieferte keine Checkout-URL')
      return res.status(500).json({ error: 'Zahlung konnte nicht gestartet werden.' })
    }

    logger.info({ userId: req.user.id, paymentId: payment.id }, 'Mollie-Checkout erstellt')
    res.json({ checkoutUrl })
  } catch (err) {
    // Mollie-API nicht erreichbar oder Timeout
    if (err.message?.includes('timeout') || err.message?.includes('ECONNREFUSED') || err.code === 'ENOTFOUND') {
      logger.error({ err, userId: req.user.id }, 'Mollie-API nicht erreichbar')
      return res.status(503).json({ 
        error: 'Zahlungsanbieter vorübergehend nicht verfügbar. Bitte später erneut versuchen.' 
      })
    }
    logger.error({ err, userId: req.user.id }, 'Checkout-Erstellung fehlgeschlagen')
    res.status(500).json({ error: 'Zahlung konnte nicht gestartet werden' })
  }
})

// ── Prepared Statements für Webhook-Retry-Tracking ────────────

const getWebhookRetryStmt = db.prepare(`
  SELECT attempts FROM webhook_retries WHERE payment_id = ?
`)

const incrementWebhookRetryStmt = db.prepare(`
  INSERT INTO webhook_retries (payment_id, attempts, last_retry)
  VALUES (?, 1, ?)
  ON CONFLICT(payment_id) DO UPDATE SET 
    attempts = attempts + 1,
    last_retry = excluded.last_retry
`)

const deleteWebhookRetryStmt = db.prepare(`
  DELETE FROM webhook_retries WHERE payment_id = ?
`)

const getUserEmailStmt = db.prepare(`SELECT email FROM user WHERE id = ?`)

// ── POST /api/v1/payments/webhook ────────────────────────────
// Mollie ruft diesen Endpunkt auf, wenn sich der Zahlungsstatus ändert.
// Sicherheit: IP-Whitelist + Payment-ID-Verifizierung via Mollie-API
// Idempotenz: payments-Tabelle verhindert Doppelbuchungen
// Retry-Logik: Max 5 Versuche, dann aufgeben

router.post(
  '/api/v1/payments/webhook',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    // ── Security: IP-Whitelist (nur in Production) ────────────
    if (IS_PROD && !isValidMollieIP(req.ip)) {
      logger.warn({ ip: req.ip, paymentId: req.body?.id }, 'Webhook von unbekannter IP blockiert')
      return res.status(403).end()
    }

    const paymentId = req.body?.id
    if (!paymentId || typeof paymentId !== 'string') {
      logger.warn({ ip: req.ip }, 'Mollie-Webhook: fehlende payment-ID')
      return res.status(400).end()
    }

    // ── Retry-Limit prüfen ────────────────────────────────────
    const retryRow = getWebhookRetryStmt.get(paymentId)
    if (retryRow && retryRow.attempts >= 5) {
      logger.error({ paymentId, attempts: retryRow.attempts }, 'Webhook: Max Retries erreicht, gebe auf')
      return res.status(200).end() // 200 → Mollie hört auf zu wiederholen
    }

    try {
      const client = getMollie()
      
      // ── Security: Payment-ID via Mollie-API verifizieren ──────
      // Schlägt bei gefälschten IDs fehl (404)
      const payment = await client.payments.get(paymentId)

      if (payment.status !== 'paid') {
        // Ausstehend, fehlgeschlagen, storniert – kein Handlungsbedarf
        logger.info({ paymentId, status: payment.status }, 'Mollie-Webhook: nicht paid, übersprungen')
        return res.status(200).end()
      }

      const userId = payment.metadata?.userId
      const product = payment.metadata?.product

      if (!userId || typeof userId !== 'string') {
        logger.warn({ paymentId, metadata: payment.metadata }, 'Mollie-Webhook: keine userId in Metadaten')
        return res.status(200).end() // 200 damit Mollie nicht endlos wiederholt
      }

      if (product !== GESAMTAUSGABE_PRODUCT) {
        logger.warn({ paymentId, product }, 'Mollie-Webhook: unbekanntes Produkt')
        return res.status(200).end()
      }

      // Betrag gegen erlaubte Preisliste prüfen. Schützt vor 0.01-EUR-Test-
      // Payments oder gefälschten Webhook-Aufrufen mit beliebigem Betrag,
      // die sonst trotzdem die Gesamtausgabe freischalten würden.
      const paidAmount = payment?.amount?.value
      const paidCurrency = payment?.amount?.currency
      if (paidCurrency !== 'EUR' || !VALID_PRICES.includes(paidAmount)) {
        logger.warn(
          { paymentId, paidAmount, paidCurrency },
          'Mollie-Webhook: ungültiger Betrag oder Währung – Entitlement NICHT freigeschaltet'
        )
        auditSecurity(
          'PAYMENT_REJECT',
          { paymentId, userId, paidAmount, paidCurrency, reason: 'invalid amount or currency' },
          { ip: req.ip, status: 'FAIL' }
        )
        return res.status(200).end() // 200 damit Mollie nicht endlos wiederholt
      }

      // Transaktion: Idempotenz-Check + Entitlement-Unlock + Payment-Eintrag.
      // .immediate() statt default-deferred: erzwingt BEGIN IMMEDIATE und
      // damit den RESERVED-Lock vor dem ersten SELECT. Bei parallelem
      // Mollie-Retry für dieselbe paymentId würde sonst der idempotente
      // SELECT in zwei Transaktionen gleichzeitig zurückkommen, beide
      // würden setPremiumRoleStmt/unlockEntitlementStmt durchlaufen
      // (UPDATE-idempotent, aber unsauber); insertPaymentStmt fängt
      // den Doppel-Insert per OR IGNORE ab. Mit IMMEDIATE serialisiert
      // SQLite die zwei Webhook-Calls sauber, einer wartet bzw. scheitert
      // mit SQLITE_BUSY und Mollie wiederholt.
      let newlyUnlocked = false
      const processWebhook = db.transaction(() => {
        const alreadyProcessed = getPaymentByIdStmt.get(paymentId)
        if (alreadyProcessed) {
          logger.info({ paymentId, userId }, 'Mollie-Webhook: bereits verarbeitet, übersprungen')
          return
        }

        const now = Date.now()
        ensureEntitlementStmt.run(userId, now, now)
        unlockEntitlementStmt.run(now, now, userId)
        setPremiumRoleStmt.run(userId, now, now)
        insertPaymentStmt.run(paymentId, userId, payment.amount.value, 'paid', product, now)

        newlyUnlocked = true
        logger.info({ paymentId, userId }, 'Gesamtausgabe freigeschaltet und Rolle auf premium gesetzt via Mollie')
      })
      processWebhook.immediate()

      // Bestellbestätigung senden (nur bei neuem Kauf, nicht bei Webhook-Retry)
      if (newlyUnlocked) {
        const userRow = getUserEmailStmt.get(userId)
        if (userRow?.email) {
          sendPurchaseConfirmation({ to: userRow.email, purchaseDate: Date.now(), amount: payment.amount.value })
        }
      }

      // Erfolg → Retry-Counter löschen
      deleteWebhookRetryStmt.run(paymentId)
      res.status(200).end()
    } catch (err) {
      // Ungültige Payment-ID (gefälscht)
      if (err.statusCode === 404) {
        logger.warn({ paymentId, ip: req.ip }, 'Webhook: Ungültige Payment-ID (möglicherweise gefälscht)')
        return res.status(404).end() // 404 → kein Retry
      }

      // Echter Fehler (DB-Problem, Netzwerk-Timeout, etc.)
      logger.error({ err, paymentId }, 'Mollie-Webhook-Verarbeitung fehlgeschlagen')
      
      // Retry-Counter erhöhen
      incrementWebhookRetryStmt.run(paymentId, Date.now())
      
      res.status(500).end() // 500 → Mollie wiederholt
    }
  }
)

export default router
