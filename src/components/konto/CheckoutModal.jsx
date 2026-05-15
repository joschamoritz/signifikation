import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { API } from '../../config'
import { apiFetch } from '../../utils/apiFetch'
import Sheet from '../ui/Sheet'
import ExternalLink from '../ExternalLink'
import './CheckoutModal.css'

const PRICE_OPTIONS = [
  { value: '6.99', label: '6,99 €', sub: 'Petit',   productId: 'de.signifikation.gesamtausgabe.petit'  },
  { value: '9.99', label: '9,99 €', sub: 'Korpus',  productId: 'de.signifikation.gesamtausgabe.korpus' },
  { value: '14.99', label: '14,99 €', sub: 'Cicero', productId: 'de.signifikation.gesamtausgabe.cicero' },
]

const IS_NATIVE = Capacitor.isNativePlatform()

export default function CheckoutModal({ isOpen, onClose, onSuccess }) {
  const [agreed, setAgreed] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [selectedPrice, setSelectedPrice] = useState('6.99')

  const selectedOption = PRICE_OPTIONS.find(o => o.value === selectedPrice)

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
    const { IAP } = await import('../../plugins/iap.js')
    const result = await IAP.purchase({ productId: selectedOption.productId })
    if (result.status === 'cancelled') return
    if (result.status === 'pending') {
      throw new Error('Zahlung wird noch verarbeitet. Bitte warte kurz und versuche es erneut.')
    }
    const res = await apiFetch(`${API}/iap/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        jwsRepresentation: result.jwsRepresentation,
        productId: result.productId,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Freischaltung fehlgeschlagen.')
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
    try {
      const { IAP } = await import('../../plugins/iap.js')
      const { transactions } = await IAP.restorePurchases()
      if (!transactions?.length) {
        setCheckoutError('Keine früheren Käufe gefunden.')
        return
      }
      const res = await apiFetch(`${API}/iap/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transactions }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Wiederherstellung fehlgeschlagen.')
      if (data.unlocked) { onSuccess?.(); onClose() }
      else setCheckoutError('Kein gültiger Kauf gefunden.')
    } catch (err) {
      setCheckoutError(err.message || 'Netzwerkfehler.')
    } finally {
      setIsBusy(false)
    }
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
          <ul className="konto-checkout-features" aria-label="Enthaltene Inhalte">
            <li>Wort-Zwilling – Bedeutungsverwandtschaft entdecken</li>
            <li>Zeitenwende – Semantischen Wandel verstehen</li>
            <li>Lückenfüller – Korpussätze mit Lücken füllen</li>
            <li>Klassenraum – Gemeinsam spielen (für Lehrkräfte)</li>
          </ul>

          <div className="konto-price-selector-wrap">
            <p className="konto-price-selector-intro">Du entscheidest, wie viel du beiträgst:</p>
            <div className="konto-price-selector" role="group" aria-label="Betrag wählen">
              {PRICE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`konto-price-option${selectedPrice === opt.value ? ' konto-price-option--selected' : ''}`}
                  type="button"
                  onClick={() => setSelectedPrice(opt.value)}
                  aria-pressed={selectedPrice === opt.value}
                >
                  <span className="konto-price-option-amount">{opt.label}</span>
                  <span className="konto-price-option-label">{opt.sub}</span>
                </button>
              ))}
            </div>
            <p className="konto-checkout-once">Einmalig · kein Abo</p>
          </div>

          <label className="konto-checkout-legal-label">
            <input
              className="konto-checkout-legal-input"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span className="konto-checkout-legal-text">
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

          {checkoutError && (
            <p className="konto-checkout-error" role="alert">
              {checkoutError}
            </p>
          )}

          {!agreed && !checkoutError && (
            <p className="konto-checkout-hint">
              Bitte Zustimmung oben bestätigen.
            </p>
          )}

          <button
            className="test-cta"
            type="button"
            onClick={handleCheckout}
            disabled={!agreed || isBusy}
          >
            {isBusy ? 'Wird verarbeitet …' : `Jetzt freischalten – ${selectedOption.label}`}
            {!isBusy && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
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
              ? 'Zahlung über Apple In-App Purchase · Einmalig · kein Abo'
              : 'Zahlung über Mollie · SSL-verschlüsselt · Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.'
            }
          </p>
        </div>
      </Sheet.Body>
    </Sheet>
  )
}
