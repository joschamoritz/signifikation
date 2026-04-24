import KontoAuthCard from './KontoAuthCard'

export default function KontoZugangBlock({ auth, gesamtausgabe, onUnlock }) {
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

        <KontoAuthCard {...auth} />

        {/* Gesamtausgabe-Status */}
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
                Kostenlos bis Paywall aktiv. Zugriff auf alle Spielmodi und Funktionen.
              </p>
            ) : (
              <div className="konto-subscription-unlock">
                <p className="konto-subscription-note">
                  Schalte Wort-Zwilling, Zeitenwende und Klassenraum frei.
                </p>
                <button
                  className="test-cta"
                  type="button"
                  onClick={onUnlock}
                >
                  Jetzt freischalten
                  <span className="test-cta-arrow" aria-hidden="true"> →</span>
                </button>
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
