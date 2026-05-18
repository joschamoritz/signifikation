import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { API } from '../../config'
import { apiFetch } from '../../utils/apiFetch'
import { IAP } from '../../plugins/iap.js'
import CheckoutModal from './CheckoutModal'

const IS_NATIVE = Capacitor.isNativePlatform()

const FEATURES = [
  { label: 'Wort-Zwilling',  desc: 'Zwei Wörter, ein Kollokationsnetz' },
  { label: 'Zeitenwende',    desc: 'Kollokatoren im Jahrtausendvergleich' },
  { label: 'Lückenfüller',   desc: 'Satzlücken mit Korpusdaten füllen' },
  { label: 'Klassenraum',    desc: 'Live-Sessions für den Unterricht' },
]

export default function KontoPremiumBlock({ auth, gesamtausgabePermanent, freeAccessToday, freeAccessLabel }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [loginHint, setLoginHint] = useState(false)

  function handleBuyClick() {
    if (!auth.isLoggedIn) {
      setLoginHint(true)
      return
    }
    setLoginHint(false)
    setCheckoutOpen(true)
  }

  useEffect(() => {
    if (!IS_NATIVE) return
    let listener = null
    const setup = async () => {
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
        } catch {}
      })
    }
    setup()
    return () => { listener?.remove() }
  }, [auth.loadSession])

  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">②</span>
        <span className="test-entry-marginalia">PREMIUM</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Gesamtausgabe</h2>
          <span className="test-ipa">[ɡəˈzamtˌʔaʊ̯sɡaːbə]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Lizenz</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Premium</span>
        </div>

        {gesamtausgabePermanent ? (
          <>
            <p className="test-definition">
              Vollzugang zu allen Spielmodi und Funktionen.
            </p>
            <ul className="konto-premium-features konto-premium-features--active" aria-label="Enthaltene Funktionen">
              {FEATURES.map(f => (
                <li key={f.label} className="konto-premium-feature">
                  <span className="konto-premium-feature-marker" aria-hidden="true">✓</span>
                  <div className="konto-premium-feature-content">
                    <span className="konto-premium-feature-label">{f.label}</span>
                  </div>
                </li>
              ))}
            </ul>
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
        ) : (
          <>
            {!freeAccessToday && (
              <p className="test-definition">
                Schalte alle Spielmodi und den Klassenraum dauerhaft frei.
              </p>
            )}

            <ul className="konto-premium-features" aria-label="Enthaltene Funktionen">
              {FEATURES.map(f => (
                <li key={f.label} className="konto-premium-feature">
                  <span className="konto-premium-feature-marker" aria-hidden="true">—</span>
                  <div className="konto-premium-feature-content">
                    <span className="konto-premium-feature-label">{f.label}</span>
                    <span className="konto-premium-feature-desc">{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="konto-subscription-unlock">
              <button className="konto-iap-cta" type="button" onClick={handleBuyClick}>
                <span>{freeAccessToday ? 'Dauerhaft freischalten' : 'Gesamtausgabe freischalten'}</span>
                <span className="konto-iap-cta-price">ab 6,99 €</span>
              </button>
              {loginHint && (
                <p className="konto-login-hint" role="alert">
                  Bitte oben anmelden, um den Kauf abzuschließen.
                </p>
              )}
            </div>

            {freeAccessToday && (
              <p className="konto-subscription-note konto-subscription-note--free">
                <span className="konto-free-star" aria-hidden="true">✦</span>
                Heute kostenlos{freeAccessLabel ? ` – ${freeAccessLabel}` : ''}. Du hast Zugriff auf alle Spielmodi.
              </p>
            )}
          </>
        )}
      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={auth.loadSession}
      />
    </li>
  )
}
