import { useRef } from 'react'
import KontoAuthCard from './KontoAuthCard'

export default function KontoZugangBlock({ auth }) {
  const authCardRef = useRef(null)

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
          <span className="test-pos">Substantiv</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Anmeldung</span>
        </div>
        {!auth.isLoggedIn && (
          <p className="test-definition">
            Melde dich an oder erstelle ein Konto, um deinen Spielfortschritt geräteübergreifend zu synchronisieren.
          </p>
        )}

        <div ref={authCardRef}>
          <KontoAuthCard auth={auth} />
        </div>
      </div>
    </li>
  )
}
