export default function KontoRechtlichesBlock() {
  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">④</span>
        <span className="test-entry-marginalia">INFO</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Rechtliches & Info</h2>
          <span className="test-ipa">[ˈʁɛçtlɪçəs]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Dokumentation</span>
        </div>
        <p className="test-definition">
          Informationen über die App, Impressum, Datenschutzerklärung und Nutzungsbedingungen.
        </p>

        <nav className="konto-legal-links" aria-label="Rechtliche Links">
          <a 
            href="/ueber.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="konto-legal-link"
          >
            <span className="konto-legal-link-text">Über die App</span>
            <span className="konto-legal-link-arrow" aria-hidden="true">→</span>
          </a>
          <a 
            href="/impressum.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="konto-legal-link"
          >
            <span className="konto-legal-link-text">Impressum</span>
            <span className="konto-legal-link-arrow" aria-hidden="true">→</span>
          </a>
          <a 
            href="/datenschutz.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="konto-legal-link"
          >
            <span className="konto-legal-link-text">Datenschutz</span>
            <span className="konto-legal-link-arrow" aria-hidden="true">→</span>
          </a>
          <a 
            href="/nutzungsbedingungen.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="konto-legal-link"
          >
            <span className="konto-legal-link-text">Nutzungsbedingungen</span>
            <span className="konto-legal-link-arrow" aria-hidden="true">→</span>
          </a>
        </nav>

        <div className="test-entry-footer">
          <span className="test-status">Version 1.0.0</span>
        </div>
      </div>
    </li>
  )
}
