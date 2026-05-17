import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { API } from '../../config'
import { apiFetch } from '../../utils/apiFetch'
import KontoAuthCard from './KontoAuthCard'
import CheckoutModal from './CheckoutModal'

const IS_NATIVE = Capacitor.isNativePlatform()

export default function KontoZugangBlock({ auth, gesamtausgabe, gesamtausgabePermanent, freeAccessToday, freeAccessLabel }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [loginHint, setLoginHint] = useState(false)
  const authCardRef = useRef(null)

  function handleBuyClick() {
    if (!auth.isLoggedIn) {
      setLoginHint(true)
      authCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setLoginHint(false)
    setCheckoutOpen(true)
  }

  // Hintergrund-Transaktionen verarbeiten (Ask to Buy, SCA, App-Neustart nach Crash)
  useEffect(() => {
    if (!IS_NATIVE) return
    let listener = null
    const setup = async () => {
      const { IAP } = await import('../../plugins/iap.js')
      listener = await IAP.addListener('transactionUpdate', async (data) => {
        try {
          const res = await apiFetch(`${API}/iap/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              jwsRepresentation: data.jwsRepresentation,
              productId: data.productId,
            }),
          })
          if (res.ok) {
            await IAP.finishTransaction({ transactionId: data.transactionId }).catch(() => {})
            auth.loadSession?.()
          }
          // Bei 401 (nicht eingeloggt): Transaktion bleibt unfertig, wird beim nächsten Start erneut geliefert
        } catch {}
      })
    }
    setup()
    return () => { listener?.remove() }
  }, [auth.loadSession])

  const showSubscriptionBadge = gesamtausgabePermanent
    ? <span className="konto-subscription-badge konto-subscription-badge--active">✓ Freigeschaltet</span>
    : freeAccessToday
      ? <span className="konto-subscription-badge konto-subscription-badge--free">Heute kostenlos</span>
      : <span className="konto-subscription-badge konto-subscription-badge--locked">Gesperrt</span>

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

        <div ref={authCardRef}>
          <KontoAuthCard auth={auth} />
        </div>

        {/* Gesamtausgabe-Status – immer sichtbar */}
        <div className="konto-subscription-status">
          <div className="konto-subscription-header">
            <span className="konto-subscription-label">Gesamtausgabe</span>
            {showSubscriptionBadge}
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
            <>
              <p className="konto-subscription-note konto-subscription-note--free">
                <span className="konto-free-star" aria-hidden="true">✦</span>
                Heute kostenlos{freeAccessLabel ? ` – ${freeAccessLabel}` : ''}. Du hast Zugriff auf alle Spielmodi.
              </p>
              <div className="konto-subscription-unlock">
                <button
                  className="test-cta"
                  type="button"
                  onClick={handleBuyClick}
                >
                  Dauerhaft freischalten
                  <span className="test-cta-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="konto-subscription-note">
                Wort-Zwilling, Zeitenwende, Lückenfüller und Klassenraum freischalten.
              </p>
              <div className="konto-subscription-unlock">
                <button
                  className="test-cta"
                  type="button"
                  onClick={handleBuyClick}
                >
                  Gesamtausgabe freischalten
                  <span className="test-cta-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </>
          )}

          {loginHint && !auth.isLoggedIn && (
            <p className="konto-login-hint" role="alert">
              Bitte oben anmelden, um den Kauf abzuschließen.
            </p>
          )}
        </div>

      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={auth.loadSession}
      />
    </li>
  )
}
