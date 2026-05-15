import express from 'express'
import { X509Certificate, createVerify } from 'node:crypto'
import { requireAuthUser } from '../middleware/userAuth.js'
import db from '../db.js'
import logger from '../logger.js'
import { sendPurchaseConfirmation } from '../mailer.js'

const router = express.Router()

const VALID_PRODUCT_IDS = new Set([
  'de.signifikation.gesamtausgabe.petit',
  'de.signifikation.gesamtausgabe.korpus',
  'de.signifikation.gesamtausgabe.cicero',
])

const PRODUCT_AMOUNTS = {
  'de.signifikation.gesamtausgabe.petit':   '6.99',
  'de.signifikation.gesamtausgabe.korpus':  '9.99',
  'de.signifikation.gesamtausgabe.cicero':  '14.99',
}

// SHA-256-Fingerabdruck Apple Root CA – G3
// Verifizieren unter: https://www.apple.com/certificateauthority/
// Format: Hex ohne Doppelpunkte, Kleinbuchstaben
const APPLE_ROOT_CA_G3_SHA256 =
  '63343abfb89a6a03ebbe5953f3653231' +
  '92cad7b50e2b4fbeb94caf66cf2e8b55'

// ── Prepared Statements ────────────────────────────────────────

const getTransactionStmt = db.prepare(
  `SELECT id FROM payments WHERE id = ?`
)

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
    source      = CASE WHEN gesamtausgabe_unlocked = 1 THEN source ELSE 'apple-iap' END,
    updated_at  = ?
  WHERE user_id = ?
`)

const setPremiumRoleStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, 'premium', ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    role       = 'premium',
    updated_at = excluded.updated_at
`)

const insertPaymentStmt = db.prepare(`
  INSERT OR IGNORE INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (?, ?, ?, 'EUR', 'paid', 'gesamtausgabe', ?)
`)

const getUserEmailStmt = db.prepare(
  `SELECT email FROM user WHERE id = ?`
)

// ── JWS-Verifikation (StoreKit 2, ES256) ──────────────────────

function verifyAppleJWS(jws) {
  const parts = jws.split('.')
  if (parts.length !== 3) throw new Error('Ungültiges JWS-Format')

  const header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

  if (!Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error('Keine vollständige Zertifikatskette (x5c) im JWS-Header')
  }

  const certs = header.x5c.map(c => new X509Certificate(Buffer.from(c, 'base64')))

  // Root-Zertifikat gegen bekannten Apple-Fingerabdruck prüfen
  const rootFp = certs.at(-1).fingerprint256.replace(/:/g, '').toLowerCase()
  if (rootFp !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error(`Unbekannte Root-CA: ${rootFp}`)
  }

  // Zertifikatskette: jedes Zertifikat durch das nächste signiert?
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw new Error(`Zertifikatskette ungültig an Position ${i}`)
    }
  }

  // JWS-Signatur mit Leaf-Zertifikat prüfen
  // ES256 = ECDSA-P256 mit SHA-256; JWS kodiert Signatur als P1363 (R||S)
  const verifier = createVerify('SHA256')
  verifier.update(`${parts[0]}.${parts[1]}`)
  const sig = Buffer.from(parts[2], 'base64url')
  if (!verifier.verify({ key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' }, sig)) {
    throw new Error('JWS-Signatur ungültig')
  }

  return payload
}

function unlockForUser(userId, transactionId, productId) {
  let newlyUnlocked = false
  db.transaction(() => {
    if (getTransactionStmt.get(transactionId)) {
      logger.info({ transactionId, userId }, 'Apple IAP: Transaktion bereits verarbeitet')
      return
    }
    const now = Date.now()
    ensureEntitlementStmt.run(userId, now, now)
    unlockEntitlementStmt.run(now, now, userId)
    setPremiumRoleStmt.run(userId, now, now)
    insertPaymentStmt.run(transactionId, userId, PRODUCT_AMOUNTS[productId], now)
    newlyUnlocked = true
    logger.info({ transactionId, userId, productId }, 'Apple IAP: Gesamtausgabe freigeschaltet')
  })()
  return newlyUnlocked
}

// ── POST /api/v1/iap/verify ────────────────────────────────────
// Empfängt JWS-Token aus StoreKit, verifiziert und schaltet frei.

router.post('/api/v1/iap/verify', requireAuthUser, (req, res) => {
  const { jwsRepresentation, productId } = req.body
  const userId = req.user.id

  if (!jwsRepresentation || typeof jwsRepresentation !== 'string') {
    return res.status(400).json({ error: 'jwsRepresentation erforderlich' })
  }
  if (!productId || !VALID_PRODUCT_IDS.has(productId)) {
    return res.status(400).json({ error: 'Ungültige productId' })
  }

  let payload
  try {
    payload = verifyAppleJWS(jwsRepresentation)
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Apple IAP: JWS-Verifikation fehlgeschlagen')
    return res.status(400).json({ error: 'Transaktion konnte nicht verifiziert werden' })
  }

  if (payload.productId !== productId) {
    logger.warn({ payloadProductId: payload.productId, claimed: productId, userId },
      'Apple IAP: productId-Mismatch')
    return res.status(400).json({ error: 'Produkt stimmt nicht überein' })
  }
  if (payload.type !== 'NON_CONSUMABLE') {
    return res.status(400).json({ error: 'Unerwarteter Produkttyp' })
  }

  const transactionId = String(payload.transactionId ?? payload.originalTransactionId)
  const newlyUnlocked = unlockForUser(userId, transactionId, productId)

  if (newlyUnlocked) {
    const userRow = getUserEmailStmt.get(userId)
    if (userRow?.email) {
      sendPurchaseConfirmation({
        to: userRow.email,
        purchaseDate: Date.now(),
        amount: PRODUCT_AMOUNTS[productId],
      })
    }
  }

  res.json({ success: true, unlocked: true })
})

// ── POST /api/v1/iap/restore ───────────────────────────────────
// Verarbeitet alle wiederhergestellten Transaktionen (Restore Purchases).

router.post('/api/v1/iap/restore', requireAuthUser, (req, res) => {
  const { transactions } = req.body
  const userId = req.user.id

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'transactions (Array) erforderlich' })
  }

  let anyUnlocked = false
  for (const tx of transactions) {
    const { jwsRepresentation, productId } = tx
    if (!jwsRepresentation || !VALID_PRODUCT_IDS.has(productId)) continue

    let payload
    try {
      payload = verifyAppleJWS(jwsRepresentation)
    } catch (err) {
      logger.warn({ err: err.message, userId, productId }, 'Apple IAP Restore: JWS ungültig')
      continue
    }

    if (payload.productId !== productId || payload.type !== 'NON_CONSUMABLE') continue

    const transactionId = String(payload.transactionId ?? payload.originalTransactionId)
    if (unlockForUser(userId, transactionId, productId)) anyUnlocked = true
  }

  res.json({ success: true, unlocked: anyUnlocked })
})

export default router
