import { useState, useRef } from 'react'
import KontoAuthCard from './KontoAuthCard'
import CheckoutModal from './CheckoutModal'

export default function KontoZugangBlock({ auth, gesamtausgabe, gesamtausgabePermanent, freeAccessToday, freeAccessLabel }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const swipeStartY = useRef(0)

  function handleSheetTouchStart(e) {
    swipeStartY.current = e.touches[0].clientY
  }

  function handleSheetTouchMove(e) {
    e.preventDefault()
  }

  function handleSheetTouchEnd(e) {
    const swipeEndY = e.changedTouches[0].clientY
    const swipeDistance = swipeEndY - swipeStartY.current
    if (swipeDistance > 100) {
      setCheckoutOpen(false)
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
              <button
                className="test-cta"
                type="button"
                onClick={() => setCheckoutOpen(true)}
              >
                Kaufen
                <span className="test-cta-arrow" aria-hidden="true">→</span>
              </button>
            )}
          </div>
        )}

      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
      />
    </li>
  )
}
