import express from 'express'
import { X509Certificate, createVerify, createHash } from 'node:crypto'
import { requireAuthUser } from '../middleware/userAuth.js'
import { iapVerifyLimiter } from '../middleware/rateLimiter.js'
import { validate, iapVerifySchema, iapRestoreSchema } from '../middleware/validate.js'
import db from '../db.js'
import logger from '../logger.js'
import { sendPurchaseConfirmation } from '../mailer.js'

const router = express.Router()

// productId-Whitelist liegt in middleware/validate.js (iapVerifySchema / iapRestoreSchema).
const PRODUCT_AMOUNTS = {
  'de.signifikation.gesamtausgabe.petit':   '6.99',
  'de.signifikation.gesamtausgabe.korpus':  '9.99',
  'de.signifikation.gesamtausgabe.cicero':  '14.99',
}

// Vertrauenswürdige Apple Root CA Fingerprints (SHA-256, hex, lowercase).
// Quelle: https://www.apple.com/certificateauthority/
// Prüfen: certutil -hashfile AppleRootCA-G3.cer SHA256  (Windows)
//     oder openssl x509 -inform DER -in AppleRootCA-G3.cer -fingerprint -sha256 -noout
//
// Liste statt Einzelwert: erlaubt einen Rollover-Übergang, ohne dass IAP
// während des Wechsels bricht. Neuen Fingerprint AM ANFANG einfügen, alten
// erst nach Apple-seitiger Migration entfernen.
const APPLE_ROOT_CA_FINGERPRINTS = new Set([
  // Apple Root CA - G3 (StoreKit 2 JWS, aktuell)
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179',
])

const APP_BUNDLE_ID = 'de.signifikation.app'

// Sandbox-Transaktionen (TestFlight!) werden standardmäßig akzeptiert.
// Nach App-Store-Launch per IAP_ALLOW_SANDBOX=0 abschalten: Sandbox-JWS sind
// echte Apple-Signaturen, mit denen sich ohne Bezahlung freischalten ließe.
const ALLOW_SANDBOX = process.env.IAP_ALLOW_SANDBOX !== '0'

// ── appAccountToken (Kauf ↔ Account-Bindung) ──────────────────
//
// StoreKit erlaubt beim Kauf ein UUID-Token, das Apple signiert ins JWS
// übernimmt. Wir leiten es deterministisch aus der User-ID ab (UUIDv5) und
// prüfen es bei verify/restore — ein geteiltes JWS schaltet damit nur noch
// den Account frei, der den Kauf tatsächlich ausgelöst hat.
//
// Namespace ist fest verdrahtet: eine Änderung würde alle bestehenden
// Token-Bindungen ungültig machen.
const APP_ACCOUNT_TOKEN_NAMESPACE = 'b7a9f3c2-4d1e-4f8a-9c6b-2e5d8a7f1c34'

export function deriveAppAccountToken(userId) {
  const nsBytes = Buffer.from(APP_ACCOUNT_TOKEN_NAMESPACE.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(nsBytes).update(String(userId)).digest()
  const bytes = hash.subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // Version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC-4122-Variante
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

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

  // Root-Zertifikat gegen die Allowlist bekannter Apple-Fingerprints prüfen
  const rootFp = certs.at(-1).fingerprint256.replace(/:/g, '').toLowerCase()
  if (!APPLE_ROOT_CA_FINGERPRINTS.has(rootFp)) {
    throw new Error(`Unbekannte Root-CA: ${rootFp}`)
  }

  // Gültigkeitszeitraum: X509Certificate.verify() prüft nur die Signatur,
  // nicht notBefore/notAfter — abgelaufene Ketten müssen hier scheitern.
  const now = Date.now()
  for (let i = 0; i < certs.length; i++) {
    const from = Date.parse(certs[i].validFrom)
    const to   = Date.parse(certs[i].validTo)
    if (!Number.isFinite(from) || !Number.isFinite(to) || now < from || now > to) {
      throw new Error(`Zertifikat ${i} außerhalb des Gültigkeitszeitraums`)
    }
  }

  // CA-Flags: Leaf darf keine CA sein, alle Aussteller müssen CAs sein
  if (certs[0].ca) throw new Error('Leaf-Zertifikat ist eine CA')
  for (let i = 1; i < certs.length; i++) {
    if (!certs[i].ca) throw new Error(`Zertifikat ${i} ist keine CA`)
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

// Prüft die inhaltlichen Felder eines verifizierten JWS-Payloads.
// Liefert null wenn ok, sonst einen Ablehnungsgrund (für Log + 400).
function rejectReasonForPayload(payload, claimedProductId, userId) {
  if (payload.productId !== claimedProductId) {
    return `productId-Mismatch (${payload.productId} ≠ ${claimedProductId})`
  }
  if (payload.type !== 'Non-Consumable') {
    return `unerwarteter Produkttyp ${payload.type}`
  }
  if (payload.bundleId !== APP_BUNDLE_ID) {
    return `bundleId ${payload.bundleId}`
  }
  if (payload.environment !== 'Production') {
    if (!(payload.environment === 'Sandbox' && ALLOW_SANDBOX)) {
      return `environment ${payload.environment}`
    }
    logger.warn({ userId, transactionId: payload.transactionId },
      'Apple IAP: Sandbox-Transaktion akzeptiert (IAP_ALLOW_SANDBOX)')
  }
  const token = typeof payload.appAccountToken === 'string'
    ? payload.appAccountToken.toLowerCase()
    : null
  if (token && token !== '00000000-0000-0000-0000-000000000000') {
    if (token !== deriveAppAccountToken(userId)) {
      return 'appAccountToken gehört zu einem anderen Account'
    }
  } else {
    // Käufe aus App-Versionen vor der Token-Bindung tragen kein Token —
    // akzeptieren, aber sichtbar machen, bis der Legacy-Pfad ausläuft.
    logger.warn({ userId, transactionId: payload.transactionId },
      'Apple IAP: Transaktion ohne appAccountToken (Legacy-Pfad)')
  }
  return null
}

function unlockForUser(userId, transactionId, productId) {
  // .immediate() statt default-deferred: serialisiert parallele
  // verify/restore-Calls für dieselbe transactionId sauber. Siehe
  // payments.js-Webhook für ausführliche Begründung.
  let newlyUnlocked = false
  const tx = db.transaction(() => {
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
  })
  tx.immediate()
  return newlyUnlocked
}

// ── POST /api/v1/iap/verify ────────────────────────────────────
// Empfängt JWS-Token aus StoreKit, verifiziert und schaltet frei.

router.post('/api/v1/iap/verify', iapVerifyLimiter, requireAuthUser, validate(iapVerifySchema), (req, res) => {
  const { jwsRepresentation, productId } = req.body
  const userId = req.user.id

  let payload
  try {
    payload = verifyAppleJWS(jwsRepresentation)
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Apple IAP: JWS-Verifikation fehlgeschlagen')
    return res.status(400).json({ error: 'Transaktion konnte nicht verifiziert werden' })
  }

  const rejectReason = rejectReasonForPayload(payload, productId, userId)
  if (rejectReason) {
    logger.warn({ reason: rejectReason, userId }, 'Apple IAP: Payload abgelehnt')
    return res.status(400).json({ error: 'Transaktion konnte nicht verifiziert werden' })
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

router.post('/api/v1/iap/restore', iapVerifyLimiter, requireAuthUser, validate(iapRestoreSchema), (req, res) => {
  const { transactions } = req.body
  const userId = req.user.id

  let anyUnlocked = false
  for (const tx of transactions) {
    const { jwsRepresentation, productId } = tx

    let payload
    try {
      payload = verifyAppleJWS(jwsRepresentation)
    } catch (err) {
      logger.warn({ err: err.message, userId, productId }, 'Apple IAP Restore: JWS ungültig')
      continue
    }

    const rejectReason = rejectReasonForPayload(payload, productId, userId)
    if (rejectReason) {
      logger.warn({ reason: rejectReason, userId }, 'Apple IAP Restore: Payload abgelehnt')
      continue
    }

    const transactionId = String(payload.transactionId ?? payload.originalTransactionId)
    if (unlockForUser(userId, transactionId, productId)) anyUnlocked = true
  }

  res.json({ success: true, unlocked: anyUnlocked })
})

// ── GET /api/v1/iap/app-account-token ──────────────────────────
// Liefert das Account-Binding-Token, das die App beim StoreKit-Kauf als
// Product.PurchaseOption.appAccountToken setzt.

router.get('/api/v1/iap/app-account-token', requireAuthUser, (req, res) => {
  res.json({ appAccountToken: deriveAppAccountToken(req.user.id) })
})

export default router
