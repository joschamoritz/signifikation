import express from 'express'
import { createHash } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { requireAuthUser } from '../middleware/userAuth.js'
import { iapVerifyLimiter, iapNotificationLimiter } from '../middleware/rateLimiter.js'
import { validate, playVerifySchema, playRestoreSchema, playNotificationSchema } from '../middleware/validate.js'
import db from '../db.js'
import logger from '../logger.js'
import { sendPurchaseConfirmation } from '../mailer.js'
import { auditSecurity } from '../audit.js'
import { erfasseErstattung } from '../kaufErstattung.js'
import defaultPlayApi, { PLAY_PACKAGE_NAME, PlayKaufUnbekannt } from '../playKauf.js'
import { deriveAppAccountToken, unlockForUser, isEntitlementActive, PRODUCT_AMOUNTS } from './iap.js'

// Google Play Billing (Android) – Gegenstück zu routes/iap.js (StoreKit).
//
// Die App schickt das purchaseToken, der Server liest den Kauf über die Play
// Developer API (playKauf.js), schaltet frei und bestätigt ihn (acknowledge).
// Dieselbe Kontobindung wie bei Apple: Die App setzt beim Kauf
// obfuscatedAccountId = deriveAppAccountToken(userId), Google liefert sie als
// obfuscatedExternalAccountId zurück.
//
// payments.id ist die orderId (GPA.…). Darüber sperrt unlockForUser den Kauf
// global, und darüber findet die Erstattungsmeldung (RTDN) ihn wieder.

const STORE = 'Google Play'
const QUELLE = 'google-play'

// Testkäufe (Lizenztester, purchaseType 0) kosten nichts – nur per Opt-in, wie
// IAP_ALLOW_SANDBOX bei Apple. Lazy gelesen, damit Tests das Flag setzen können.
function testkaufErlaubt() {
  return process.env.PLAY_ALLOW_TEST === '1'
}

if (process.env.NODE_ENV === 'production' && testkaufErlaubt()) {
  logger.warn('Google Play: PLAY_ALLOW_TEST=1 in Production – Testkäufe schalten echte Entitlements frei. Nach dem Test entfernen!')
}

const PURCHASE_STATE = { 0: 'gekauft', 1: 'storniert', 2: 'ausstehend' }
const PURCHASE_TYPE_TEST = 0
const PURCHASE_TYPE_PROMO = 1

/**
 * payments.id für einen Play-Kauf: die orderId, sonst ein Hash des Tokens
 * (Google lässt orderId bei manchen Käufen leer).
 */
export function zahlungsIdFuer(kauf, purchaseToken) {
  if (typeof kauf?.orderId === 'string' && kauf.orderId) return kauf.orderId
  return tokenId(purchaseToken)
}

function tokenId(purchaseToken) {
  return `play:${createHash('sha256').update(String(purchaseToken)).digest('hex').slice(0, 40)}`
}

/**
 * Prüft einen Kauf aus purchases.products.get. Liefert null wenn ok, sonst
 * einen Ablehnungsgrund (für Log + 400). Exportiert für Unit-Tests.
 * `allowUnclaimedForeignToken`: nur im Restore-Pfad, Begründung wie bei
 * rejectReasonForPayload in routes/iap.js (Kontolöschung darf keinen Kauf vernichten).
 */
export function ablehnungsgrundPlay(kauf, userId, { allowUnclaimedForeignToken = false } = {}) {
  if (kauf?.purchaseState !== 0) {
    return `Kauf nicht abgeschlossen (${PURCHASE_STATE[kauf?.purchaseState] ?? kauf?.purchaseState})`
  }
  // Nicht verbrauchbar: ein verbrauchter Kauf wäre ein Fehler auf unserer Seite
  if (kauf.consumptionState === 1) return 'Kauf als verbraucht markiert'
  if (kauf.purchaseType != null && kauf.purchaseType !== PURCHASE_TYPE_PROMO) {
    if (!(kauf.purchaseType === PURCHASE_TYPE_TEST && testkaufErlaubt())) {
      return `purchaseType ${kauf.purchaseType}`
    }
    logger.warn({ userId, orderId: kauf.orderId }, 'Google Play: Testkauf akzeptiert (PLAY_ALLOW_TEST)')
  }
  // Anders als bei Apple gibt es keine Altkäufe ohne Token: Die App kauft nur
  // mit obfuscatedAccountId (CheckoutModal bricht ohne Token vorher ab).
  const token = typeof kauf.obfuscatedExternalAccountId === 'string'
    ? kauf.obfuscatedExternalAccountId.toLowerCase() : null
  if (!token) return 'obfuscatedExternalAccountId fehlt'
  if (token !== deriveAppAccountToken(userId)) {
    if (!allowUnclaimedForeignToken) return 'obfuscatedExternalAccountId gehört zu einem anderen Account'
    logger.warn({ userId, orderId: kauf.orderId },
      'Google Play Restore: Token eines anderen Accounts – Freischaltung nur, wenn der Kauf unbeansprucht ist')
  }
  return null
}

const zahlungInhaberStmt = db.prepare(`SELECT user_id AS userId FROM payments WHERE id = ?`)
const getUserEmailStmt = db.prepare(`SELECT email FROM user WHERE id = ?`)

/**
 * Liest, prüft, schaltet frei und bestätigt einen Kauf.
 * @returns {Promise<{ ok: false, grund: string } | { ok: true, neu: boolean, eigener: boolean }>}
 *   eigener: Der Kauf gehört (jetzt) diesem Konto – nur dann wird bestätigt.
 */
export async function verarbeitePlayKauf(api, userId, productId, purchaseToken, opts = {}) {
  let kauf
  try {
    kauf = await api.holeKauf(productId, purchaseToken)
  } catch (err) {
    if (err instanceof PlayKaufUnbekannt) return { ok: false, grund: err.message }
    throw err
  }
  // Der Pfad enthält schon das Produkt; die Antwort trägt es zusätzlich – zweite Sperre
  if (kauf?.productId && kauf.productId !== productId) {
    return { ok: false, grund: `productId-Mismatch (${kauf.productId} ≠ ${productId})` }
  }
  const grund = ablehnungsgrundPlay(kauf, userId, opts)
  if (grund) return { ok: false, grund }

  const zahlungsId = zahlungsIdFuer(kauf, purchaseToken)
  const neu = unlockForUser(userId, zahlungsId, null, productId, { quelle: QUELLE, store: STORE })
  const eigener = neu || zahlungInhaberStmt.get(zahlungsId)?.userId === userId

  // Gehört der Kauf einem anderen Konto, bleibt er unbestätigt: Google erstattet
  // ihn dann nach drei Tagen, statt dass er bezahlt und nirgends geliefert ist.
  if (eigener && kauf.acknowledgementState !== 1) {
    try {
      await api.bestaetige(productId, purchaseToken)
    } catch (err) {
      // Die App bestätigt nach unlocked:true zusätzlich selbst (finishTransaction)
      logger.error({ err: err.message, userId, zahlungsId }, 'Google Play: acknowledge fehlgeschlagen')
    }
  }

  if (neu) {
    const userRow = getUserEmailStmt.get(userId)
    if (userRow?.email) {
      sendPurchaseConfirmation({ to: userRow.email, purchaseDate: Date.now(), amount: PRODUCT_AMOUNTS[productId] })
    }
  }
  return { ok: true, neu, eigener }
}

/**
 * Wertet eine Real-Time Developer Notification aus (bereits base64-dekodiert).
 * Ausgewertet werden nur stornierte/erstattete Einmalkäufe (voidedPurchaseNotification).
 * Exportiert für Tests.
 * @returns {string} Ergebnis für das Log
 */
export function verarbeitePlayBenachrichtigung(note) {
  if (note?.packageName !== PLAY_PACKAGE_NAME) return `fremdes Paket ${note?.packageName} ignoriert`
  if (note.testNotification) return 'Testbenachrichtigung'
  // Abgeschlossene oder abgebrochene ausstehende Käufe holt die App beim
  // nächsten Start nach (queryPurchases) – der Server kann das Token keinem Konto zuordnen.
  if (note.oneTimeProductNotification) return `Einmalkauf-Meldung ${note.oneTimeProductNotification.notificationType} ignoriert`
  const v = note.voidedPurchaseNotification
  if (!v) return 'ignoriert'
  // productType 2 = Einmalkauf (1 wäre ein Abo)
  if (v.productType !== 2) return `Storno für productType ${v.productType} ignoriert`
  if (typeof v.purchaseToken !== 'string' || !v.purchaseToken) return 'Storno ohne purchaseToken ignoriert'

  const zweiteId = tokenId(v.purchaseToken)
  const zeile = erfasseErstattung(v.orderId || zweiteId, { zweiteId })
  if (!zeile) {
    logger.info({ orderId: v.orderId }, 'Google Play: Storno ohne passenden Kauf (unbekannt oder schon erfasst)')
    return 'kein passender Kauf'
  }
  logger.info({ ...zeile, refundType: v.refundType }, 'Google Play: Kauf als erstattet erfasst')
  auditSecurity('PAYMENT_REFUNDED', {
    paymentId: zeile.paymentId, userId: zeile.userId ?? undefined, quelle: 'google', entzogen: zeile.entzogen,
  })
  return 'erstattet'
}

/**
 * Prüft das OIDC-Token, mit dem das Pub/Sub-Push-Abo sich ausweist.
 * @param {string|undefined} authorization  Authorization-Header
 * @param {{ jwks: Function, audience: string, email: string }} cfg
 * @returns {Promise<boolean>}
 */
export async function pruefePubSubToken(authorization, { jwks, audience, email }) {
  const m = /^Bearer (\S+)$/.exec(authorization || '')
  if (!m) return false
  try {
    const { payload } = await jwtVerify(m[1], jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    })
    return payload.email === email && payload.email_verified === true
  } catch {
    return false
  }
}

/** Dekodiert message.data; null bei kaputtem Inhalt. */
export function dekodiereNachricht(data) {
  try {
    return JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

export const PLAY_NOTIFICATIONS_PFAD = '/api/v1/iap/play/notifications'

/**
 * Router-Fabrik: api und Pub/Sub-Konfiguration sind für Tests austauschbar.
 */
export function createPlayRouter({
  api = defaultPlayApi,
  pubsub = {
    jwks: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
    audience: process.env.PLAY_PUBSUB_AUDIENCE?.trim(),
    email: process.env.PLAY_PUBSUB_SA_EMAIL?.trim(),
  },
} = {}) {
  const router = express.Router()

  function nichtKonfiguriert(res) {
    return res.status(503).json({ error: 'Kauf über Google Play ist gerade nicht verfügbar' })
  }

  // ── POST /api/v1/iap/play/verify ─────────────────────────────
  router.post('/api/v1/iap/play/verify', iapVerifyLimiter, requireAuthUser, validate(playVerifySchema), async (req, res) => {
    if (!api.enabled) return nichtKonfiguriert(res)
    const { purchaseToken, productId } = req.body
    const userId = req.user.id
    try {
      const r = await verarbeitePlayKauf(api, userId, productId, purchaseToken)
      if (!r.ok) {
        logger.warn({ reason: r.grund, userId, productId }, 'Google Play: Kauf abgelehnt')
        return res.status(400).json({ error: 'Kauf konnte nicht verifiziert werden' })
      }
      // Wahrheitspflicht wie bei /iap/verify: unlocked nur, wenn das Konto
      // wirklich freigeschaltet ist und der Kauf ihm gehört.
      res.json({ success: true, unlocked: r.eigener && isEntitlementActive(userId) })
    } catch (err) {
      logger.error({ err, userId, productId }, 'Google Play: Kaufprüfung fehlgeschlagen')
      res.status(502).json({ error: 'Google Play ist gerade nicht erreichbar. Bitte später erneut versuchen.' })
    }
  })

  // ── POST /api/v1/iap/play/restore ────────────────────────────
  router.post('/api/v1/iap/play/restore', iapVerifyLimiter, requireAuthUser, validate(playRestoreSchema), async (req, res) => {
    if (!api.enabled) return nichtKonfiguriert(res)
    const userId = req.user.id
    let anyUnlocked = false
    for (const { purchaseToken, productId } of req.body.transactions) {
      try {
        const r = await verarbeitePlayKauf(api, userId, productId, purchaseToken, { allowUnclaimedForeignToken: true })
        if (!r.ok) {
          logger.warn({ reason: r.grund, userId, productId }, 'Google Play Restore: Kauf abgelehnt')
          continue
        }
        if (r.eigener) anyUnlocked = true
      } catch (err) {
        logger.error({ err, userId, productId }, 'Google Play Restore: Kaufprüfung fehlgeschlagen')
        return res.status(502).json({ error: 'Google Play ist gerade nicht erreichbar. Bitte später erneut versuchen.' })
      }
    }
    res.json({ success: true, unlocked: anyUnlocked || isEntitlementActive(userId) })
  })

  // ── POST /api/v1/iap/play/notifications ──────────────────────
  // Push-Abo des Pub/Sub-Themas mit den Real-Time Developer Notifications.
  // 2xx bestätigt die Nachricht, alles andere lässt Pub/Sub wiederholen –
  // darum werden kaputte oder fremde Nachrichten bestätigt und nur geloggt.
  router.post(PLAY_NOTIFICATIONS_PFAD, iapNotificationLimiter, async (req, res) => {
    if (!pubsub.audience || !pubsub.email) {
      logger.error('Google Play RTDN: PLAY_PUBSUB_AUDIENCE/PLAY_PUBSUB_SA_EMAIL fehlen')
      return res.status(503).json({ error: 'nicht konfiguriert' })
    }
    if (!(await pruefePubSubToken(req.headers.authorization, pubsub))) {
      logger.warn({ ip: req.ip }, 'Google Play RTDN: Push ohne gültiges OIDC-Token')
      return res.status(401).json({ error: 'nicht autorisiert' })
    }
    const parsed = playNotificationSchema.safeParse(req.body)
    const note = parsed.success ? dekodiereNachricht(parsed.data.message.data) : null
    if (!note) {
      logger.warn({ messageId: req.body?.message?.messageId }, 'Google Play RTDN: Nachricht nicht lesbar, bestätigt')
      return res.status(204).end()
    }
    try {
      const ergebnis = verarbeitePlayBenachrichtigung(note)
      logger.info({ messageId: parsed.data.message.messageId, ergebnis }, 'Google Play RTDN verarbeitet')
      return res.status(204).end()
    } catch (err) {
      logger.error({ err, messageId: parsed.data.message.messageId }, 'Google Play RTDN: nicht verarbeitet')
      return res.status(500).json({ error: 'nicht verarbeitet' })
    }
  })

  return router
}

export default createPlayRouter()
