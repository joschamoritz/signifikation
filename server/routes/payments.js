import express from 'express'
import { createMollieClient } from '@mollie/api-client'
import { requireAuthUser } from '../middleware/userAuth.js'
import db from '../db.js'
import logger from '../logger.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY?.trim()

// Preis als benannte Konstante – hier ändern wenn nötig
const GESAMTAUSGABE_PRICE = '4.99'
const GESAMTAUSGABE_PRODUCT = 'gesamtausgabe'

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

router.post('/api/v1/payments/checkout', requireAuthUser, async (req, res) => {
  try {
    // Bereits bezahlt?
    const existing = getPaidPaymentStmt.get(req.user.id, GESAMTAUSGABE_PRODUCT)
    if (existing) {
      return res.status(409).json({ error: 'Gesamtausgabe bereits erworben' })
    }

    const client = getMollie()
    const payment = await client.payments.create({
      amount: { currency: 'EUR', value: GESAMTAUSGABE_PRICE },
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
    logger.error({ err, userId: req.user.id }, 'Checkout-Erstellung fehlgeschlagen')
    res.status(500).json({ error: 'Zahlung konnte nicht gestartet werden' })
  }
})

// ── POST /api/v1/payments/webhook ────────────────────────────
// Mollie ruft diesen Endpunkt auf, wenn sich der Zahlungsstatus ändert.
// Kein Auth (Server→Server), aber Idempotenz via payments-Tabelle.
// Wichtig: Mollie erwartet bei Fehler einen 5xx → Webhook wird wiederholt.

router.post(
  '/api/v1/payments/webhook',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const paymentId = req.body?.id
    if (!paymentId || typeof paymentId !== 'string') {
      logger.warn({ body: req.body }, 'Mollie-Webhook: fehlende payment-ID')
      return res.status(400).end()
    }

    try {
      const client = getMollie()
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

      // Transaktion: Idempotenz-Check + Entitlement-Unlock + Payment-Eintrag
      db.transaction(() => {
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

        logger.info({ paymentId, userId }, 'Gesamtausgabe freigeschaltet und Rolle auf premium gesetzt via Mollie')
      })()

      res.status(200).end()
    } catch (err) {
      logger.error({ err, paymentId }, 'Mollie-Webhook-Verarbeitung fehlgeschlagen')
      res.status(500).end() // Mollie wiederholt bei 5xx
    }
  }
)

export default router
