import { useState } from 'react'
import { API } from '../../config'
import Sheet from '../ui/Sheet'
import './CheckoutModal.css'

const PRICE_OPTIONS = [
  { value: '6.99', label: '6,99 €', sub: 'Petit' },
  { value: '9.99', label: '9,99 €', sub: 'Korpus' },
  { value: '14.99', label: '14,99 €', sub: 'Cicero' },
]

export default function CheckoutModal({ isOpen, onClose }) {
  const [agreed, setAgreed] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)
  const [selectedPrice, setSelectedPrice] = useState('6.99')

  const selectedOption = PRICE_OPTIONS.find(o => o.value === selectedPrice)

  async function handleCheckout() {
    if (!agreed || isBusy) return
    setIsBusy(true)
    setCheckoutError(null)
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ price: selectedPrice, agreedToDigitalWaiver: agreed }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setCheckoutError('Die Gesamtausgabe ist bereits freigeschaltet.')
        return
      }
      if (!res.ok) {
        setCheckoutError(data.error || 'Zahlung konnte nicht gestartet werden.')
        return
      }
      window.location.assign(data.checkoutUrl)
    } catch {
      setCheckoutError('Netzwerkfehler. Bitte erneut versuchen.')
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
              <a href="/nutzungsbedingungen.html" target="_blank" rel="noopener noreferrer">
                Nutzungsbedingungen
              </a>{' '}
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
            {isBusy ? 'Weiterleitung …' : `Jetzt freischalten – ${selectedOption.label}`}
            {!isBusy && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
          </button>

          <p className="konto-checkout-footnote">
            Zahlung über Mollie · SSL-verschlüsselt ·{' '}
            Gemäß §&nbsp;19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.
          </p>
        </div>
      </Sheet.Body>
    </Sheet>
  )
}
