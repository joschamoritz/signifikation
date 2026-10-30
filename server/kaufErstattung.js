/**
 * Erstattete Käufe (Mollie-Webhook, App-Store-Benachrichtigung REFUND / REFUND_REVERSED).
 *
 * Eine Erstattung setzt den Kauf auf 'refunded' und entzieht die Gesamtausgabe (Entscheidung Nutzer
 * 2026-10-27): Freischaltung aus, Rolle premium → user. Ausgenommen sind Admin-Konten und Konten, die
 * noch einen anderen bezahlten Kauf haben. Nimmt Apple die Erstattung zurück, wird wieder freigeschaltet.
 * Status und Freischaltung ändern sich in einer Transaktion.
 */
import db from './db.js'

const PRODUKT = 'gesamtausgabe'

const setzeStatusStmt = db.prepare(`
  UPDATE payments SET status = @neu
  WHERE id IN (@id, @zweiteId) AND status = @alt
  RETURNING id, user_id AS userId
`)

const rolleStmt = db.prepare(`SELECT role FROM user_profiles WHERE user_id = ?`)

const weitererKaufStmt = db.prepare(`
  SELECT 1 FROM payments WHERE user_id = ? AND product = ? AND status = 'paid' LIMIT 1
`)

const entziehStmt = db.prepare(`
  UPDATE user_entitlements
  SET gesamtausgabe_unlocked = 0, unlocked_at = NULL, source = 'none', updated_at = @jetzt
  WHERE user_id = @userId AND gesamtausgabe_unlocked = 1
`)

const herabstufenStmt = db.prepare(`
  UPDATE user_profiles SET role = 'user', updated_at = @jetzt
  WHERE user_id = @userId AND role = 'premium'
`)

const sicherStmt = db.prepare(`
  INSERT INTO user_entitlements (user_id, gesamtausgabe_unlocked, unlocked_at, source, created_at, updated_at)
  VALUES (@userId, 0, NULL, 'none', @jetzt, @jetzt)
  ON CONFLICT(user_id) DO NOTHING
`)

const freischaltenStmt = db.prepare(`
  UPDATE user_entitlements
  SET gesamtausgabe_unlocked = 1,
      unlocked_at = CASE WHEN unlocked_at IS NULL THEN @jetzt ELSE unlocked_at END,
      source = CASE WHEN gesamtausgabe_unlocked = 1 THEN source ELSE @quelle END,
      updated_at = @jetzt
  WHERE user_id = @userId
`)

const premiumStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (@userId, 'premium', @jetzt, @jetzt)
  ON CONFLICT(user_id) DO UPDATE SET role = 'premium', updated_at = excluded.updated_at
  WHERE user_profiles.role <> 'admin'
`)

const istAdmin = (userId) => rolleStmt.get(userId)?.role === 'admin'

/**
 * Kauf als erstattet erfassen und die Gesamtausgabe entziehen.
 * @param {string} id  Zahlungs-ID (Mollie tr_…, App Store originalTransactionId)
 * @param {{ zweiteId?: string, jetzt?: number }} [opts]  zweiteId: weitere ID desselben Kaufs (App Store transactionId)
 * @returns {null | { paymentId: string, userId: string|null, entzogen: boolean }}  null: kein bezahlter Kauf mit dieser ID
 */
export const erfasseErstattung = db.transaction((id, { zweiteId = id, jetzt = Date.now() } = {}) => {
  const zeile = setzeStatusStmt.get({ id, zweiteId, alt: 'paid', neu: 'refunded' })
  if (!zeile) return null
  const { userId } = zeile
  let entzogen = false
  if (userId && !istAdmin(userId) && !weitererKaufStmt.get(userId, PRODUKT)) {
    const frei = entziehStmt.run({ userId, jetzt }).changes > 0
    const rolle = herabstufenStmt.run({ userId, jetzt }).changes > 0
    entzogen = frei || rolle
  }
  return { paymentId: zeile.id, userId, entzogen }
})

/**
 * Zurückgenommene Erstattung (App Store REFUND_REVERSED): Kauf zählt wieder, Gesamtausgabe wieder frei.
 * @returns {null | { paymentId: string, userId: string|null, freigeschaltet: boolean }}
 */
export const nimmErstattungZurueck = db.transaction((id, { zweiteId = id, quelle = 'apple-iap', jetzt = Date.now() } = {}) => {
  const zeile = setzeStatusStmt.get({ id, zweiteId, alt: 'refunded', neu: 'paid' })
  if (!zeile) return null
  const { userId } = zeile
  if (!userId) return { paymentId: zeile.id, userId, freigeschaltet: false }
  sicherStmt.run({ userId, jetzt })
  freischaltenStmt.run({ userId, jetzt, quelle })
  premiumStmt.run({ userId, jetzt })
  return { paymentId: zeile.id, userId, freigeschaltet: true }
})

// Sperreintrag (status 'gesperrt', ohne Konto, Betrag 0): zählt nicht als Kauf oder Erstattung
// (Kennzahlen lesen nur 'paid' und 'refunded'), blockiert aber jede Freischaltung dieser ID,
// weil iap.js eine Zeile mit status <> 'paid' als beansprucht behandelt.
const sperreStmt = db.prepare(`
  INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (@id, NULL, '0.00', 'EUR', 'gesperrt', @produkt, @jetzt)
  ON CONFLICT(id) DO NOTHING
`)
const entsperreStmt = db.prepare(`DELETE FROM payments WHERE id IN (@id, @zweiteId) AND status = 'gesperrt'`)

/**
 * Erstattung eines Kaufs, den der Server (noch) nicht kennt, etwa weil der Beleg nie eingereicht wurde:
 * Sperreintrag anlegen, damit ein später eingereichter Beleg von vor der Erstattung nichts freischaltet
 * (Security-Audit 2026-10-30). Bestehende Zeilen bleiben unverändert.
 * @returns {number}  Anzahl neu angelegter Sperreinträge
 */
export const sperreUnbekanntenKauf = db.transaction((id, { zweiteId = id, jetzt = Date.now() } = {}) => {
  let neu = 0
  for (const x of new Set([id, zweiteId].filter(Boolean))) neu += sperreStmt.run({ id: x, produkt: PRODUKT, jetzt }).changes
  return neu
})

/** Zurückgenommene Erstattung eines unbekannten Kaufs: Sperreintrag wieder entfernen. */
export function hebeSperreAuf(id, { zweiteId = id } = {}) {
  return entsperreStmt.run({ id, zweiteId }).changes
}
