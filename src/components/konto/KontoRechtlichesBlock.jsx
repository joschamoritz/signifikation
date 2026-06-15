import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

const BASE = 'https://signifikation.de'

function LegalLink({ href, children }) {
  const handleClick = async (e) => {
    if (Capacitor.isNativePlatform()) {
      e.preventDefault()
      await Browser.open({ url: `${BASE}${href}` })
    }
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="konto-legal-link" onClick={handleClick}>
      <span className="konto-legal-link-text">{children}</span>
      <span className="konto-legal-link-arrow" aria-hidden="true">→</span>
    </a>
  )
}

export default function KontoRechtlichesBlock() {
  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">⑤</span>
        <span className="test-entry-marginalia">INFO</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Rechtliches & Info</h2>
          <span className="test-ipa">[ˈʁɛçtlɪçəs]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Impressum</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Dokumentation</span>
        </div>
        <p className="test-definition">
          Informationen über die App, Impressum, Datenschutzerklärung und Nutzungsbedingungen.
        </p>

        <nav className="konto-legal-links" aria-label="Rechtliche Links">
          <LegalLink href="/ueber.html">Über die App</LegalLink>
          <LegalLink href="/impressum.html">Impressum</LegalLink>
          <LegalLink href="/datenschutz.html">Datenschutz</LegalLink>
          <LegalLink href="/nutzungsbedingungen.html">Nutzungsbedingungen</LegalLink>
        </nav>

        <div className="test-entry-footer">
          <span className="test-status">Version {__APP_VERSION__}</span>
        </div>
      </div>
    </li>
  )
}
