import express from 'express'
import { X509Certificate, createVerify, createHash } from 'node:crypto'
import { requireAuthUser } from '../middleware/userAuth.js'
import { iapVerifyLimiter } from '../middleware/rateLimiter.js'
import { validate, iapVerifySchema, iapRestoreSchema, iapNotificationSchema } from '../middleware/validate.js'
import db from '../db.js'
import logger from '../logger.js'
import { sendPurchaseConfirmation } from '../mailer.js'
import { auditSecurity } from '../audit.js'
import { erfasseErstattung, nimmErstattungZurueck, sperreUnbekanntenKauf, hebeSperreAuf } from '../kaufErstattung.js'

const router = express.Router()

// productId-Whitelist liegt in middleware/validate.js (iapVerifySchema / iapRestoreSchema).
export const PRODUCT_AMOUNTS = {
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

// Sandbox-Transaktionen (TestFlight!) nur per explizitem Opt-in akzeptieren:
// Sandbox-JWS sind echte Apple-Signaturen, mit denen sich sonst ohne
// Bezahlung freischalten ließe. Fuer TestFlight-Phasen IAP_ALLOW_SANDBOX=1
// setzen. Lazy gelesen, damit Tests die Flags pro Fall setzen koennen.
function sandboxAllowed() {
  return process.env.IAP_ALLOW_SANDBOX === '1'
}

// Sobald die Legacy-Kaeuferbasis (Kaeufe vor der Token-Bindung) migriert ist:
// IAP_REQUIRE_ACCOUNT_TOKEN=1 setzen → JWS ohne appAccountToken werden
// abgelehnt (schliesst Replay ueber fremde Accounts endgueltig).
function accountTokenRequired() {
  return process.env.IAP_REQUIRE_ACCOUNT_TOKEN === '1'
}

if (process.env.NODE_ENV === 'production' && sandboxAllowed()) {
  logger.warn(
    'Apple IAP: IAP_ALLOW_SANDBOX=1 in Production — Sandbox-/TestFlight-JWS ' +
    'schalten echte Entitlements frei. Nach App-Store-Launch entfernen!'
  )
}

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

const alleKontoIdsStmt = db.prepare(`SELECT id FROM user`)

/**
 * Gehört das Token zu einem bestehenden Konto? Der Restore lockert die Token-Bindung nur für Käufe
 * gelöschter Konten; Käufe eines lebenden Kontos stellt nur dieses Konto wieder her (Security-Audit run-2:
 * sonst könnte jemand mit einem fremden, noch nicht eingereichten Beleg den Kauf zuerst beanspruchen).
 * Läuft nur im seltenen Fall eines fremden Tokens und rechnet je Konto einen SHA-1.
 */
export function tokenEinesBestehendenKontos(token) {
  for (const { id } of alleKontoIdsStmt.iterate()) {
    if (deriveAppAccountToken(id) === token) return true
  }
  return false
}

// ── Prepared Statements ────────────────────────────────────────

// user_id IS NOT NULL: eine Transaktion gilt nur als "beansprucht", solange
// der Kauf noch einem lebenden Account gehoert. Migration 0020 setzt
// payments.user_id bei Kontoloeschung auf NULL statt die Zeile zu loeschen
// (Aufbewahrungspflicht §147 AO) -- ohne die Einschraenkung wuerde die
// verwaiste Zeile den Restore-Pfad fuer den neu registrierten Account
// blockieren (Apple-Guideline 5.1.1(v) verlangt aber einen funktionierenden
// Restore, siehe rejectReasonForPayload oben).
// status <> 'paid': Eine erstattete Zeile bleibt auch verwaist beansprucht.
// Sonst schaltete ein vor der Erstattung abgegriffenes JWS den Kauf nach
// Kontoloeschung fuer ein neues Konto wieder frei (Security-Audit 2026-10-30).
const getTransactionStmt = db.prepare(
  `SELECT id FROM payments WHERE id = ? AND (user_id IS NOT NULL OR status <> 'paid')`
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
    source      = CASE WHEN gesamtausgabe_unlocked = 1 THEN source ELSE ? END,
    updated_at  = ?
  WHERE user_id = ?
`)

const setPremiumRoleStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, 'premium', ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    role       = 'premium',
    updated_at = excluded.updated_at
  -- Ein Kauf darf ein Admin-Konto nicht auf premium herabstufen (Selbstaussperrung): Dann bleibt die Zeile
  -- komplett unveraendert (auch updated_at).
  WHERE user_profiles.role <> 'admin'
`)

// ON CONFLICT statt INSERT OR IGNORE: eine verwaiste Zeile (user_id NULL,
// siehe getTransactionStmt-Kommentar) wird beim Restore auf den neuen
// Account reklaimt, statt stillschweigend zu bleiben. Der WHERE-Zusatz
// verhindert, dass eine noch lebende Zuordnung (Cross-Account-Replay)
// ueberschrieben wird -- das darf laut vorgelagertem Idempotenz-Check in
// unlockForUser ohnehin nie passieren, ist hier aber eine zweite Sperre.
const insertPaymentStmt = db.prepare(`
  INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (?, ?, ?, 'EUR', 'paid', 'gesamtausgabe', ?)
  ON CONFLICT(id) DO UPDATE SET
    user_id      = excluded.user_id,
    amount       = excluded.amount,
    processed_at = excluded.processed_at
  WHERE payments.user_id IS NULL AND payments.status = 'paid'
`)

const getUserEmailStmt = db.prepare(
  `SELECT email FROM user WHERE id = ?`
)

// Tatsaechlicher Freischaltzustand des Kontos. Gebraucht, um verify/restore
// wahrheitsgemaess zu beantworten: unlockForUser meldet nur, ob GERADE
// freigeschaltet wurde — nicht, ob das Konto bereits freigeschaltet IST.
const isUnlockedStmt = db.prepare(
  `SELECT 1 AS ok FROM user_entitlements WHERE user_id = ? AND gesamtausgabe_unlocked = 1`
)

// Exportiert für Tests (Cross-Account-Szenario: unlockForUser meldet false,
// und das Konto ist auch tatsaechlich nicht freigeschaltet).
export function isEntitlementActive(userId) {
  return !!isUnlockedStmt.get(userId)
}

// ── JWS-Verifikation (StoreKit 2, ES256) ──────────────────────

// Apple-Kennungen der App-Store-Signaturkette (wie Apples SignedDataVerifier):
// Ohne sie wäre jedes Zertifikat unter Apple Root CA - G3 ein gültiger Signierer,
// etwa ein Apple-Pay-Zertifikat aus dem eigenen Entwicklerkonto (Security-Audit 2026-10-30).
const OID_APPLE_LEAF         = '1.2.840.113635.100.6.11.1' // App Store Receipt Signing
const OID_APPLE_INTERMEDIATE = '1.2.840.113635.100.6.2.1'  // Apple Worldwide Developer Relations

// Minimaler DER-Leser: Node liefert die Erweiterungen eines X509Certificate nicht nach OID.
function derTeil(buf, pos) {
  const tag = buf[pos]
  let laenge = buf[pos + 1]
  let start = pos + 2
  if (laenge & 0x80) {
    const n = laenge & 0x7f
    laenge = 0
    for (let i = 0; i < n; i++) laenge = laenge * 256 + buf[start + i]
    start += n
  }
  return { tag, start, ende: start + laenge }
}

function derKinder(buf, teil) {
  const kinder = []
  for (let pos = teil.start; pos < teil.ende;) {
    const kind = derTeil(buf, pos)
    kinder.push(kind)
    pos = kind.ende
  }
  return kinder
}

function oidText(bytes) {
  const teile = [Math.floor(bytes[0] / 40), bytes[0] % 40]
  let wert = 0
  for (const b of bytes.subarray(1)) {
    wert = wert * 128 + (b & 0x7f)
    if (!(b & 0x80)) { teile.push(wert); wert = 0 }
  }
  return teile.join('.')
}

// OIDs aller Erweiterungen (tbsCertificate → [3] → SEQUENCE OF Extension → extnID)
function erweiterungsOids(cert) {
  const der = cert.raw
  const tbs = derKinder(der, derTeil(der, 0))[0]
  const ext = derKinder(der, tbs).find((t) => t.tag === 0xa3)
  if (!ext) return new Set()
  const liste = derKinder(der, ext)[0]
  return new Set(derKinder(der, liste).map((e) => {
    const id = derKinder(der, e)[0]
    return oidText(der.subarray(id.start, id.ende))
  }))
}

// Exportiert für Tests: rootFingerprints erlaubt eine Test-PKI (Fixtures in __tests__/fixtures/apple-pki).
export function verifyAppleJWS(jws, { rootFingerprints = APPLE_ROOT_CA_FINGERPRINTS } = {}) {
  const parts = jws.split('.')
  if (parts.length !== 3) throw new Error('Ungültiges JWS-Format')

  const header  = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

  if (header.alg !== 'ES256') throw new Error(`Unerwarteter JWS-Algorithmus ${header.alg}`)
  // Apple signiert mit genau drei Zertifikaten: Leaf, Intermediate (WWDR), Root
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3) {
    throw new Error('Keine vollständige Zertifikatskette (x5c) im JWS-Header')
  }

  const certs = header.x5c.map(c => new X509Certificate(Buffer.from(c, 'base64')))

  // Root-Zertifikat gegen die Allowlist bekannter Apple-Fingerprints prüfen
  const rootFp = certs.at(-1).fingerprint256.replace(/:/g, '').toLowerCase()
  if (!rootFingerprints.has(rootFp)) {
    throw new Error(`Unbekannte Root-CA: ${rootFp}`)
  }

  if (!erweiterungsOids(certs[0]).has(OID_APPLE_LEAF)) throw new Error('Leaf-Zertifikat ist kein App-Store-Signaturzertifikat')
  if (!erweiterungsOids(certs[1]).has(OID_APPLE_INTERMEDIATE)) throw new Error('Intermediate ist kein Apple-WWDR-Zertifikat')
  const leafKey = certs[0].publicKey
  if (leafKey.asymmetricKeyType !== 'ec' || leafKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Leaf-Schlüssel ist kein P-256')
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

  // Zertifikatskette: jedes Zertifikat vom nächsten ausgestellt (Name) und signiert?
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) {
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
// Exportiert für Unit-Tests (Flag-Kombinationen ohne echtes Apple-JWS).
// `allowUnclaimedForeignToken` lockert ausschliesslich im Restore-Pfad die
// Token-Bindung: Der appAccountToken wird beim Kauf aus der damaligen user.id
// abgeleitet und ist im signierten JWS eingefroren. Loescht jemand sein Konto
// und legt ein neues an, passt der Token nie wieder — der bezahlte
// Non-Consumable waere dauerhaft verloren (Guideline 3.1.1 verlangt aber einen
// funktionierenden Restore, 5.1.1(v) erlaubt keine Kontoloeschung, die Kaeufe
// vernichtet). Missbrauch bleibt ausgeschlossen, weil unlockForUser jede
// bereits beanspruchte Transaktion global sperrt: freigeschaltet wird nur, was
// aktuell keinem Account gehoert.
export function rejectReasonForPayload(payload, claimedProductId, userId, { allowUnclaimedForeignToken = false } = {}) {
  if (payload.productId !== claimedProductId) {
    return `productId-Mismatch (${payload.productId} ≠ ${claimedProductId})`
  }
  if (payload.type !== 'Non-Consumable') {
    return `unerwarteter Produkttyp ${payload.type}`
  }
  if (payload.bundleId !== APP_BUNDLE_ID) {
    return `bundleId ${payload.bundleId}`
  }
  // Apple setzt revocationDate, wenn ein Kauf erstattet oder widerrufen wurde.
  // Transaction.updates feuert auch fuer solche Transaktionen — ohne diese
  // Pruefung schaltete eine Erstattung die Gesamtausgabe erneut frei.
  if (payload.revocationDate != null) {
    return `Transaktion widerrufen (${payload.revocationReason ?? 'ohne Grund'})`
  }
  // Familienfreigabe ist für die Gesamtausgabe nicht eingeschaltet. Käme sie doch, liefe ein geteilter
  // Kauf über die Restore-Lockerung und ihr Widerruf (REVOKE) bliebe unbeachtet (Security-Audit run-2).
  if (payload.inAppOwnershipType === 'FAMILY_SHARED') {
    return 'Familienfreigabe (FAMILY_SHARED) nicht vorgesehen'
  }
  if (payload.environment !== 'Production') {
    if (!(payload.environment === 'Sandbox' && sandboxAllowed())) {
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
      if (!allowUnclaimedForeignToken) {
        return 'appAccountToken gehört zu einem anderen Account'
      }
      if (tokenEinesBestehendenKontos(token)) {
        return 'appAccountToken gehört zu einem bestehenden anderen Account'
      }
      logger.warn({ userId, transactionId: payload.transactionId },
        'Apple IAP Restore: Token eines anderen Accounts – Freischaltung nur, wenn die Transaktion unbeansprucht ist')
    }
  } else if (accountTokenRequired()) {
    return 'appAccountToken fehlt (IAP_REQUIRE_ACCOUNT_TOKEN aktiv)'
  } else {
    // Käufe aus App-Versionen vor der Token-Bindung tragen kein Token —
    // akzeptieren, aber sichtbar machen, bis der Legacy-Pfad ausläuft.
    // Replay-Schutz: unlockForUser sperrt transactionId UND
    // originalTransactionId global (first-come-first-served bleibt das
    // Restrisiko, bis IAP_REQUIRE_ACCOUNT_TOKEN scharf ist).
    logger.warn({ userId, transactionId: payload.transactionId },
      'Apple IAP: Transaktion ohne appAccountToken (Legacy-Pfad)')
  }
  return null
}

// Exportiert für Tests (Cross-Account-Replay-Szenario) und für Google Play
// (routes/iapPlay.js: transactionId = orderId, kein Original, quelle 'google-play').
// `weitereIds`: zusätzliche IDs desselben Kaufs, die nur geprüft, nie gespeichert werden (Play: Token-Hash
// neben der orderId, damit ein Sperreintrag auch greift, wenn Storno-Meldung und Kauf die orderId verschieden führen).
export function unlockForUser(userId, transactionId, originalTransactionId, productId,
  { quelle = 'apple-iap', store = 'Apple IAP', weitereIds = [] } = {}) {
  // .immediate() statt default-deferred: serialisiert parallele
  // verify/restore-Calls für dieselbe transactionId sauber. Siehe
  // payments.js-Webhook für ausführliche Begründung.
  let newlyUnlocked = false
  const tx = db.transaction(() => {
    // Global (nicht pro User) gesperrt: eine bereits verarbeitete Transaktion
    // schaltet keinen zweiten Account frei — auch nicht ueber eine abweichende
    // originalTransactionId desselben Kaufs (Restore liefert ggf. neue
    // transactionIds zum selben Original).
    if (getTransactionStmt.get(transactionId)) {
      logger.info({ transactionId, userId }, `${store}: Transaktion bereits verarbeitet`)
      return
    }
    if (originalTransactionId && originalTransactionId !== transactionId
        && getTransactionStmt.get(originalTransactionId)) {
      logger.info({ transactionId, originalTransactionId, userId },
        `${store}: Original-Transaktion bereits verarbeitet`)
      return
    }
    const belegt = weitereIds.find((id) => id && id !== transactionId && getTransactionStmt.get(id))
    if (belegt) {
      logger.info({ transactionId, belegt, userId }, `${store}: Kauf unter weiterer ID bereits verarbeitet oder gesperrt`)
      return
    }
    const now = Date.now()
    ensureEntitlementStmt.run(userId, now, now)
    unlockEntitlementStmt.run(now, quelle, now, userId)
    setPremiumRoleStmt.run(userId, now, now)
    // Kanonische ID persistieren: originalTransactionId identifiziert den
    // Kauf dauerhaft — Restores mit frischer transactionId zum selben
    // Original laufen damit in den Idempotenz-Check oben.
    insertPaymentStmt.run(originalTransactionId ?? transactionId, userId, PRODUCT_AMOUNTS[productId], now)
    newlyUnlocked = true
    logger.info({ transactionId, userId, productId }, `${store}: Gesamtausgabe freigeschaltet`)
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
  const originalTransactionId = payload.originalTransactionId != null
    ? String(payload.originalTransactionId) : null
  const newlyUnlocked = unlockForUser(userId, transactionId, originalTransactionId, productId)

  // `newlyUnlocked === false` hat zwei sehr verschiedene Ursachen: Die
  // Transaktion gehoert bereits DIESEM Konto (dann ist alles in Ordnung) oder
  // sie ist global auf einen ANDEREN Account gebucht (dann wurde nichts
  // freigeschaltet). Frueher meldeten beide Faelle `unlocked: true`; der Client
  // rief daraufhin finishTransaction, der Kauf galt bei Apple als erledigt und
  // Transaction.updates lieferte ihn nie wieder — bezahlt, nicht geliefert.
  const unlocked = newlyUnlocked || isEntitlementActive(userId)

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

  res.json({ success: true, unlocked })
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

    const rejectReason = rejectReasonForPayload(payload, productId, userId,
      { allowUnclaimedForeignToken: true })
    if (rejectReason) {
      logger.warn({ reason: rejectReason, userId }, 'Apple IAP Restore: Payload abgelehnt')
      continue
    }

    const transactionId = String(payload.transactionId ?? payload.originalTransactionId)
    const originalTransactionId = payload.originalTransactionId != null
      ? String(payload.originalTransactionId) : null
    if (unlockForUser(userId, transactionId, originalTransactionId, productId)) anyUnlocked = true
  }

  // Gleiche Wahrheitspflicht wie bei /verify — hier zusaetzlich gegen den
  // Zweit-Tipp: Wer schon freigeschaltet ist, bekam bisher „Kein gueltiger Kauf
  // gefunden“ zu sehen, weil unlockForUser beim zweiten Lauf nichts mehr zu tun
  // hat. Genau das probiert ein Reviewer aber aus.
  const unlocked = anyUnlocked || isEntitlementActive(userId)

  res.json({ success: true, unlocked })
})

// ── POST /api/v1/iap/notifications ─────────────────────────────
// App Store Server Notifications V2 (in App Store Connect › App-Informationen als Produktions-URL
// eintragen). Ausgewertet werden nur Erstattungen: REFUND setzt den Kauf auf 'refunded' und entzieht die
// Gesamtausgabe, REFUND_REVERSED macht beides rückgängig (kaufErstattung.js). Alles andere wird bestätigt und ignoriert.
// Antworten: 200 = verarbeitet oder bewusst ignoriert (Apple wiederholt dann nicht),
// 400 = Signatur oder Inhalt ungültig.

// Stand je Kauf (Migration 0035): signedDate der zuletzt verarbeiteten Erstattungsmeldung.
const meldungStandStmt = db.prepare(`SELECT signed_date AS signedDate FROM app_store_meldung_stand WHERE kauf_id = ?`)
const merkeMeldungStandStmt = db.prepare(`
  INSERT INTO app_store_meldung_stand (kauf_id, signed_date) VALUES (?, ?)
  ON CONFLICT(kauf_id) DO UPDATE SET signed_date = MAX(signed_date, excluded.signed_date)
`)

export const IAP_NOTIFICATIONS_PFAD = '/api/v1/iap/notifications'
export const IAP_NOTIFICATIONS_BODY_LIMIT = '64kb'

/**
 * Wertet eine verifizierte Benachrichtigung aus. Exportiert für Tests (ohne echtes Apple-JWS).
 * @param {object} notification  Payload des äußeren JWS
 * @param {(jws: string) => object} pruefeJws  verifiziert signedTransactionInfo
 * @returns {{ status: number, ergebnis: string }}
 */
export function verarbeiteAppStoreBenachrichtigung(notification, pruefeJws = verifyAppleJWS) {
  const typ = notification?.notificationType
  if (typ !== 'REFUND' && typ !== 'REFUND_REVERSED') return { status: 200, ergebnis: 'ignoriert' }

  const daten = notification.data || {}
  if (daten.bundleId !== APP_BUNDLE_ID) return { status: 400, ergebnis: 'fremde App' }
  if (daten.environment !== 'Production' && !(daten.environment === 'Sandbox' && sandboxAllowed())) {
    return { status: 200, ergebnis: `Umgebung ${daten.environment} ignoriert` }
  }
  if (typeof daten.signedTransactionInfo !== 'string') return { status: 400, ergebnis: 'Transaktion fehlt' }

  const tx = pruefeJws(daten.signedTransactionInfo)
  if (tx.bundleId !== APP_BUNDLE_ID) return { status: 400, ergebnis: 'Transaktion einer fremden App' }
  const transaktion = String(tx.transactionId ?? tx.originalTransactionId ?? '')
  const original = String(tx.originalTransactionId ?? tx.transactionId ?? '')
  if (!transaktion) return { status: 400, ergebnis: 'Transaktions-ID fehlt' }

  // Apple wiederholt Meldungen und liefert sie nicht garantiert in Reihenfolge: Eine Meldung, die nicht
  // jünger ist als die zuletzt verarbeitete, ändert nichts mehr (sonst überschriebe ein verspätetes
  // REFUND ein schon verarbeitetes REFUND_REVERSED).
  const gezeichnet = Number(notification.signedDate)
  const mitStand = Number.isFinite(gezeichnet) && gezeichnet > 0
  const erstattet = typ === 'REFUND'

  // Stand prüfen, Kauf ändern und Stand merken in einer Transaktion (Security-Audit run-2): Bräche der
  // Prozess dazwischen ab, liefe Apples Wiederholung ein zweites Mal und ließe einen Sperreintrag zurück.
  const ergebnis = db.transaction(() => {
    const stand = mitStand ? meldungStandStmt.get(original)?.signedDate : null
    if (stand != null && gezeichnet <= stand) return { veraltet: stand }
    // Gespeichert ist die originalTransactionId (unlockForUser), ältere Zeilen ggf. die transactionId
    const zeile = erstattet
      ? erfasseErstattung(original, { zweiteId: transaktion })
      : nimmErstattungZurueck(original, { zweiteId: transaktion })
    // Unbekannter Kauf: sperren, damit ein später eingereichter Beleg nichts freischaltet. Eine
    // zurückgenommene Erstattung hebt Sperreinträge immer auf, auch neben einem bekannten Kauf.
    const gesperrt = erstattet && !zeile ? sperreUnbekanntenKauf(original, { zweiteId: transaktion }) : 0
    const entsperrt = erstattet ? 0 : hebeSperreAuf(original, { zweiteId: transaktion })
    if (mitStand) merkeMeldungStandStmt.run(original, gezeichnet)
    return { zeile, gesperrt, entsperrt }
  }).immediate()

  if (ergebnis.veraltet != null) {
    logger.info({ typ, transactionId: transaktion, gezeichnet, stand: ergebnis.veraltet }, 'App Store: veraltete Erstattungsmeldung ignoriert')
    return { status: 200, ergebnis: 'veraltet' }
  }
  const { zeile, gesperrt, entsperrt } = ergebnis
  if (!zeile) {
    logger.info({ typ, transactionId: transaktion, gesperrt, entsperrt }, 'App Store: Erstattungsmeldung ohne passenden Kauf (unbekannt oder schon erfasst)')
    return { status: 200, ergebnis: 'kein passender Kauf' }
  }
  logger.info({ typ, ...zeile }, erstattet ? 'App Store: Kauf als erstattet erfasst' : 'App Store: Erstattung zurückgenommen')
  auditSecurity(erstattet ? 'PAYMENT_REFUNDED' : 'PAYMENT_REFUND_REVERSED', {
    paymentId: zeile.paymentId, userId: zeile.userId ?? undefined, quelle: 'apple',
    ...(erstattet ? { entzogen: zeile.entzogen } : { freigeschaltet: zeile.freigeschaltet }),
    ...(erstattet && tx.revocationReason != null ? { grund: tx.revocationReason } : {}),
  })
  return { status: 200, ergebnis: erstattet ? 'erstattet' : 'zurückgenommen' }
}

router.post(IAP_NOTIFICATIONS_PFAD, validate(iapNotificationSchema), (req, res) => {
  let notification
  try {
    notification = verifyAppleJWS(req.body.signedPayload)
  } catch (err) {
    logger.warn({ err: err.message, ip: req.ip }, 'App Store: Benachrichtigung mit ungültiger Signatur')
    return res.status(400).json({ error: 'Signatur ungültig' })
  }
  try {
    const { status, ergebnis } = verarbeiteAppStoreBenachrichtigung(notification)
    if (status !== 200) logger.warn({ typ: notification.notificationType, ergebnis }, 'App Store: Benachrichtigung abgelehnt')
    return status === 200 ? res.json({ ok: true }) : res.status(status).json({ error: ergebnis })
  } catch (err) {
    // Innere Signatur ungültig (verifyAppleJWS wirft) oder DB-Fehler: 500 → Apple wiederholt
    logger.error({ err, typ: notification?.notificationType }, 'App Store: Benachrichtigung nicht verarbeitet')
    return res.status(500).json({ error: 'Benachrichtigung nicht verarbeitet' })
  }
})

// ── GET /api/v1/iap/app-account-token ──────────────────────────
// Liefert das Account-Binding-Token, das die App beim StoreKit-Kauf als
// Product.PurchaseOption.appAccountToken setzt.

router.get('/api/v1/iap/app-account-token', requireAuthUser, (req, res) => {
  res.json({ appAccountToken: deriveAppAccountToken(req.user.id) })
})

export default router
