import { useState } from 'react'
import { API } from '../../config'
import KontoAuthCard from './KontoAuthCard'

const PRICE_OPTIONS = [
  { value: '6.99', label: '6,99 €', sub: 'Petit' },
  { value: '9.99', label: '9,99 €', sub: 'Korpus' },
  { value: '14.99', label: '14,99 €', sub: 'Cicero' },
]

export default function KontoZugangBlock({ auth, gesamtausgabe, gesamtausgabePermanent, freeAccessToday, freeAccessLabel }) {
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
        body: JSON.stringify({ price: selectedPrice }),
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
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">①</span>
        <span className="test-entry-marginalia">ZUGANG</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Zugang</h2>
          <span className="test-ipa">[ˈt͡suːɡaŋ]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Anmeldung</span>
        </div>
        <p className="test-definition">
          Melde dich an oder erstelle ein Konto, um deinen Spielfortschritt geräteübergreifend zu synchronisieren und die Gesamtausgabe freizuschalten.
        </p>

        <KontoAuthCard auth={auth} />

        {/* Gesamtausgabe-Status: nur für eingeloggte Nutzer */}
        {auth.isLoggedIn && (
          <div className="konto-subscription-status">
            <div className="konto-subscription-header">
              <span className="konto-subscription-label">Gesamtausgabe</span>
              {gesamtausgabePermanent ? (
                <span className="konto-subscription-badge konto-subscription-badge--active">
                  ✓ Freigeschaltet
                </span>
              ) : freeAccessToday ? (
                <span className="konto-subscription-badge konto-subscription-badge--free">
                  Heute kostenlos
                </span>
              ) : (
                <span className="konto-subscription-badge konto-subscription-badge--locked">
                  Gesperrt
                </span>
              )}
            </div>

            {gesamtausgabePermanent ? (
              <>
                <p className="konto-subscription-note">
                  Zugriff auf alle Spielmodi und Funktionen.
                </p>
                <div className="konto-teacher-note" role="status">
                  <p className="konto-teacher-note-title">
                    <span className="konto-teacher-note-symbol" aria-hidden="true">§</span>
                    Klassenraum aktiv
                  </p>
                  <p className="konto-teacher-note-text">
                    Du kannst im Tab Klassenraum Sitzungen erstellen, starten, exportieren und Ergebnisse live verfolgen.
                  </p>
                </div>
              </>
            ) : freeAccessToday ? (
              <p className="konto-subscription-note">
                Heute kostenlos{freeAccessLabel ? ` – ${freeAccessLabel}` : ''}. Du hast Zugriff auf alle Spielmodi.
              </p>
            ) : (
              <div className="konto-checkout">
                <ul className="konto-checkout-features" aria-label="Enthaltene Inhalte">
                  <li>Wort-Zwilling – Bedeutungsverwandtschaft entdecken</li>
                  <li>Zeitenwende – Semantischen Wandel verstehen</li>
                  <li>Zeitreise – Wortgeschichten erkunden</li>
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
                    Ich stimme zu, dass die Bereitstellung der digitalen Inhalte sofort beginnt
                    und mein <strong>Widerrufsrecht damit erlischt</strong> (§&nbsp;356 Abs.&nbsp;5 BGB).
                    Ich habe die{' '}
                    <a href="/nutzungsbedingungen.html" target="_blank" rel="noopener noreferrer">
                      Nutzungsbedingungen
                    </a>{' '}
                    und das{' '}
                    <a href="/impressum.html" target="_blank" rel="noopener noreferrer">
                      Impressum
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
            )}
          </div>
        )}

      </div>
    </li>
  )
}
