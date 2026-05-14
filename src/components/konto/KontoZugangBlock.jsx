import { useState } from 'react'
import KontoAuthCard from './KontoAuthCard'
import CheckoutModal from './CheckoutModal'

export default function KontoZugangBlock({ auth, gesamtausgabe, gesamtausgabePermanent, freeAccessToday, freeAccessLabel }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  return (
    <li className="test-entry test-drop-cap">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">①</span>
        <span className="test-entry-marginalia">ZUGANG</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-dropcap-k" aria-hidden="true">Z</span>
          <h2 className="test-headword" aria-label="Zugang">ugang</h2>
          <span className="test-ipa">[ˈt͡suːɡaŋ]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Anmeldung</span>
        </div>
        {!auth.isLoggedIn && (
          <p className="test-definition">
            Melde dich an oder erstelle ein Konto, um deinen Spielfortschritt geräteübergreifend zu synchronisieren und die Gesamtausgabe freizuschalten.
          </p>
        )}

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
                    Sitzungen erstellen, starten und live verfolgen.
                  </p>
                </div>
              </>
            ) : freeAccessToday ? (
              <p className="konto-subscription-note konto-subscription-note--free">
                <span className="konto-free-star" aria-hidden="true">✦</span>
                Heute kostenlos{freeAccessLabel ? ` – ${freeAccessLabel}` : ''}. Du hast Zugriff auf alle Spielmodi.
              </p>
            ) : (
              <button
                className="test-cta"
                type="button"
                onClick={() => setCheckoutOpen(true)}
              >
                Gesamtausgabe freischalten
                <span className="test-cta-arrow" aria-hidden="true">→</span>
              </button>
            )}
          </div>
        )}

      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
      />
    </li>
  )
}
