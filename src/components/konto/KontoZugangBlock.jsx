import { useState } from 'react'
import { API } from '../../config'
import KontoAuthCard from './KontoAuthCard'

export default function KontoZugangBlock({ auth, gesamtausgabe }) {
  const [agreed, setAgreed] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState(null)

  async function handleCheckout() {
    if (!agreed || isBusy) return
    setIsBusy(true)
    setCheckoutError(null)
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
              {gesamtausgabe ? (
                <span className="konto-subscription-badge konto-subscription-badge--active">
                  ✓ Freigeschaltet
                </span>
              ) : (
                <span className="konto-subscription-badge konto-subscription-badge--locked">
                  Gesperrt
                </span>
              )}
            </div>

            {gesamtausgabe ? (
              <p className="konto-subscription-note">
                Zugriff auf alle Spielmodi und Funktionen.
              </p>
            ) : (
              <div className="konto-checkout">
                <ul className="konto-checkout-features" aria-label="Enthaltene Inhalte">
                  <li>Wort-Zwilling – Bedeutungsverwandtschaft entdecken</li>
                  <li>Zeitenwende – Semantischen Wandel verstehen</li>
                  <li>Zeitreise – Wortgeschichten erkunden</li>
                  <li>Klassenraum – Gemeinsam spielen (für Lehrkräfte)</li>
                </ul>

                <div className="konto-checkout-price" aria-label="Preis: 4 Euro 99, einmalig">
                  <span className="konto-checkout-amount">4,99 €</span>
                  <span className="konto-checkout-once">Einmalig · kein Abo</span>
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
                      AGB
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

                <button
                  className="test-cta"
                  type="button"
                  onClick={handleCheckout}
                  disabled={!agreed || isBusy}
                >
                  {isBusy ? 'Weiterleitung …' : 'Jetzt freischalten – 4,99 €'}
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

        {!auth.isLoggedIn && (
          <div className="test-entry-footer">
            <span className="test-status">Nicht angemeldet</span>
          </div>
        )}
      </div>
    </li>
  )
}
