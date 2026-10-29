import { useState, useEffect } from 'react'
import { API } from '../../config'
import { apiFetch } from '../../utils/apiFetch'
import { IAP, STORE, USES_STORE_BILLING, verifyRequest } from '../../plugins/iap.js'
import { restoreIapPurchases } from '../../utils/iapRestore'
import { logError } from '../../utils/logError'
import Sheet from '../ui/Sheet'
import ExternalLink from '../ExternalLink'
import './CheckoutModal.css'

export const PRICE_OPTIONS = [
  { value: '6.99', label: '6,99 €', sub: 'Petit',   productId: 'de.signifikation.gesamtausgabe.petit'  },
  { value: '9.99', label: '9,99 €', sub: 'Korpus',  productId: 'de.signifikation.gesamtausgabe.korpus' },
  { value: '14.99', label: '14,99 €', sub: 'Cicero', productId: 'de.signifikation.gesamtausgabe.cicero' },
]

// Name historisch: gemeint ist „Kauf über den Store der App“ – StoreKit (iOS)
// oder Google Play (Android). Nur im Web gibt es Mollie samt Checkbox.
const IS_NATIVE = USES_STORE_BILLING
const IS_PLAY = STORE === 'google'
const STORE_NAME = IS_PLAY ? 'Google Play' : 'Apple'

export default function CheckoutModal({ isOpen, onClose, onSuccess }) {
  const [agreed, setAgreed] = useState(IS_NATIVE)
  const [isBusy, setIsBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [selectedPrice, setSelectedPrice] = useState('9.99')
  const [iapProducts, setIapProducts] = useState([])
  // null = noch nicht geprueft, true/false = Ergebnis von getProducts
  const [productsAvailable, setProductsAvailable] = useState(null)

  const selectedOption = PRICE_OPTIONS.find(o => o.value === selectedPrice)

  // In der App: Store-Preise laden (displayPrice bzw. formatierter Play-Preis in der Währung des Nutzers).
  //
  // Der Fehlerfall war frueher unsichtbar: .catch(() => {}) schluckte alles, und
  // getLivePrice fiel auf die fest eingetragenen Labels zurueck — die exakt den
  // echten Preisen entsprechen. Der Kauf-Screen sah also normal aus, und erst
  // beim Tippen kam "Produkt nicht gefunden" aus IAPPlugin.swift. Genau so ist
  // am 2026-08-07 eine Einreichung gescheitert (die drei Produkte standen in
  // App Store Connect auf "Vom Entwickler abgelehnt" und wurden von StoreKit
  // nicht ausgeliefert). Jetzt sichtbar machen statt still weiterlaufen.
  useEffect(() => {
    if (!isOpen || !IS_NATIVE) return
    let cancelled = false
    setProductsAvailable(null)
    IAP.getProducts({ productIds: PRICE_OPTIONS.map(o => o.productId) })
      .then(({ products }) => {
        if (cancelled) return
        setIapProducts(products || [])
        const complete = (products || []).length === PRICE_OPTIONS.length
        setProductsAvailable(complete)
        if (!complete) {
          logError('CheckoutModal.getProducts.incomplete',
            new Error(`${STORE_NAME} lieferte ${products?.length ?? 0} von ${PRICE_OPTIONS.length} Produkten`))
        }
      })
      .catch((err) => {
        if (cancelled) return
        setProductsAvailable(false)
        logError('CheckoutModal.getProducts', err)
      })
    return () => { cancelled = true }
  }, [isOpen])

  // Nur in der App relevant: im Web gibt es keinen Store, dort zaehlen die
  // EUR-Labels und der Mollie-Pfad.
  const iapUnavailable = IS_NATIVE && productsAvailable === false

  // Preis anzeigen: Store-Preis in der App, sonst hardcoded EUR
  function getLivePrice(option) {
    if (IS_NATIVE && iapProducts.length) {
      const p = iapProducts.find(p => p.id === option.productId)
      if (p) return p.price
    }
    return option.label
  }

  async function handleCheckoutWeb() {
    const res = await apiFetch(`${API}/payments/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ price: selectedPrice, agreedToDigitalWaiver: agreed }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 409) throw Object.assign(new Error('already'), { code: 409 })
    if (!res.ok) throw new Error(data.error || 'Zahlung konnte nicht gestartet werden.')
    window.location.assign(data.checkoutUrl)
  }

  async function handleCheckoutIAP() {
    // Account-Binding-Token vom Server holen – Apple übernimmt es signiert
    // ins JWS, Google als obfuscatedAccountId; der Server prüft es gegen den Account.
    let appAccountToken = null
    try {
      const tokenRes = await apiFetch(`${API}/iap/app-account-token`, { credentials: 'include' })
      if (tokenRes.ok) ({ appAccountToken } = await tokenRes.json())
    } catch {
      // Apple: Kauf bleibt möglich – Server akzeptiert Transaktionen ohne Token (Legacy-Pfad)
    }
    // Google Play kennt keinen Legacy-Pfad: Ohne Token lehnt der Server den Kauf
    // ab, also gar nicht erst abbuchen lassen.
    if (IS_PLAY && !appAccountToken) {
      throw new Error('Der Kauf konnte nicht vorbereitet werden. Bitte prüfe deine Internetverbindung und versuche es erneut.')
    }
    const result = await IAP.purchase({
      productId: selectedOption.productId,
      ...(appAccountToken ? { appAccountToken } : {}),
    })
    if (result.status === 'cancelled') return
    if (result.status === 'pending') {
      setCheckoutError(IS_PLAY
        ? 'Die Zahlung ist noch nicht abgeschlossen. Sobald Google Play sie bestätigt, wird die Gesamtausgabe beim nächsten Öffnen der App freigeschaltet.'
        : 'Kauf wartet auf Bestätigung (z. B. Familienfreigabe). Du erhältst eine Mitteilung, sobald er abgeschlossen ist.')
      return
    }
    // Der Store hat hier bereits abgebucht. Reißt jetzt das Netz ab, bleibt die
    // Transaktion unfinished (Play: unbestätigt) und kommt beim nächsten Start
    // über den globalen Listener (iapTransactionListener.js) erneut — das muss
    // der Nutzer wissen, statt nur „Load failed“ zu lesen.
    let res
    try {
      const { url, body } = verifyRequest(result)
      res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error(`Der Kauf ist bei ${STORE_NAME} abgeschlossen, die Freischaltung konnte aber gerade nicht bestätigt werden. `
        + 'Sie wird automatisch nachgeholt, sobald du wieder online bist – oder tippe auf „Kauf wiederherstellen“.')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Freischaltung fehlgeschlagen.')
    // 200 heißt „verstanden“, nicht „freigeschaltet“: Gehört die Transaktion
    // bereits einem anderen Konto, ist nichts freigeschaltet. Dann NICHT
    // finishTransaction rufen — unfinished bleibt sie in Transaction.updates
    // und kann nach dem Anmelden am richtigen Konto erneut verifiziert werden.
    if (!data.unlocked) {
      throw new Error('Dieser Kauf ist bereits einem anderen Konto zugeordnet. '
        + 'Bitte melde dich mit dem Konto an, mit dem du gekauft hast.')
    }
    // Transaktion erst nach erfolgreicher Server-Bestätigung abschließen
    await IAP.finishTransaction({ transactionId: result.transactionId }).catch(() => {})
    onSuccess?.()
    onClose()
  }

  async function handleCheckout() {
    if (!agreed || isBusy) return
    setIsBusy(true)
    setCheckoutError(null)
    try {
      if (IS_NATIVE) {
        await handleCheckoutIAP()
      } else {
        await handleCheckoutWeb()
      }
    } catch (err) {
      if (err.code === 409) {
        setCheckoutError('Die Gesamtausgabe ist bereits freigeschaltet.')
      } else {
        setCheckoutError(err.message || 'Netzwerkfehler. Bitte erneut versuchen.')
      }
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRestore() {
    if (isBusy) return
    setIsBusy(true)
    setCheckoutError(null)
    const result = await restoreIapPurchases()
    setIsBusy(false)
    if (result.ok) { onSuccess?.(); onClose(); return }
    if (result.reason === 'none')      setCheckoutError('Keine früheren Käufe gefunden.')
    else if (result.reason === 'not-found') setCheckoutError('Kein gültiger Kauf gefunden.')
    else setCheckoutError(result.message || 'Netzwerkfehler.')
  }

  return (
    <Sheet open={isOpen} onClose={onClose} aria-label="Gesamtausgabe freischalten">
      <Sheet.Header />
      <Sheet.Body>
        <div className="checkout-sheet-header">
          <span className="checkout-sheet-label" aria-hidden="true">Betrag</span>
          <h2 className="checkout-sheet-title">Gesamtausgabe freischalten</h2>
          <button className="info-sheet-close" type="button" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="checkout-sheet-body">
          <div className="konto-price-selector-wrap">
            <p className="konto-price-selector-intro">
              Alle drei Stufen schalten denselben Funktionsumfang frei –
              wähle deinen Unterstützungsbeitrag:
            </p>
            <div className="konto-price-selector" role="group" aria-label="Beitrag wählen">
              {PRICE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`konto-price-option${selectedPrice === opt.value ? ' konto-price-option--selected' : ''}`}
                  type="button"
                  onClick={() => setSelectedPrice(opt.value)}
                  aria-pressed={selectedPrice === opt.value}
                >
                  <span className="konto-price-option-amount">{getLivePrice(opt)}</span>
                  <span className="konto-price-option-label">{opt.sub}</span>
                </button>
              ))}
            </div>
            {/* Kaufgegenstand exakt benennen: Die Spielmodi sind gratis – hier
                stehen nur die tatsächlich freigeschalteten Premium-Funktionen
                (App-Review-Guideline 2.3.1, keine irreführende Paywall). */}
            <p className="konto-checkout-once">Unterrichtsmaterial · Klassenraum · Unbegrenzte Lemmata — einmal kaufen, kein Abo</p>
          </div>

          {!IS_NATIVE && (
            <label className="konto-checkout-legal-label">
              <input
                className="konto-checkout-legal-input"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="konto-checkout-legal-text">
                Ich bestätige, dass ich meinen <strong>Wohnsitz in Deutschland</strong> habe.
                Ich stimme ausdrücklich zu, dass Sie mit der Ausführung des Vertrages vor
                Ablauf der Widerrufsfrist beginnen. Ich habe zur Kenntnis genommen, dass ich
                mein <strong>Widerrufsrecht mit Beginn der Ausführung des Vertrages verliere</strong>{' '}
                (§&nbsp;356 Abs.&nbsp;5 BGB). Ich habe die{' '}
                <ExternalLink href="https://signifikation.de/nutzungsbedingungen.html">
                  Nutzungsbedingungen
                </ExternalLink>{' '}
                zur Kenntnis genommen.
              </span>
            </label>
          )}

          {checkoutError && (
            <p className="konto-checkout-error" role="alert">
              {checkoutError}
            </p>
          )}

          {iapUnavailable && !checkoutError && (
            <p className="konto-checkout-error" role="alert">
              Der Kauf ist gerade nicht verfügbar – {IS_PLAY ? 'Google Play' : 'der App Store'} liefert
              die Produkte nicht aus. Bitte versuche es später noch einmal.
            </p>
          )}

          {!agreed && !checkoutError && !iapUnavailable && (
            <p className="konto-checkout-hint">
              Bitte Zustimmung oben bestätigen.
            </p>
          )}

          <button
            className="konto-iap-cta"
            type="button"
            onClick={handleCheckout}
            disabled={!agreed || isBusy || iapUnavailable}
          >
            <span>{isBusy ? 'Wird verarbeitet …' : 'Jetzt kaufen'}</span>
            {!isBusy && <span className="konto-iap-cta-price">{getLivePrice(selectedOption)}</span>}
          </button>

          {IS_NATIVE && (
            <button
              className="konto-checkout-restore"
              type="button"
              onClick={handleRestore}
              disabled={isBusy}
            >
              Bereits gekauft? Kauf wiederherstellen
            </button>
          )}

          <p className="konto-checkout-footnote">
            {IS_NATIVE
              ? (IS_PLAY ? 'Zahlung über Google Play · Einmalig · kein Abo' : 'Zahlung über Apple In-App Purchase · Einmalig · kein Abo')
              : 'Zahlung über Mollie · SSL-verschlüsselt · Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.'
            }
          </p>
        </div>
      </Sheet.Body>
    </Sheet>
  )
}
