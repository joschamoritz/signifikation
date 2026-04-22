export default function KontoEinstellungenBlock({ isLoggedIn }) {
  return (
    <li className={`test-entry${!isLoggedIn ? ' test-entry--disabled' : ''}`}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">③</span>
        <span className="test-entry-marginalia">EINST.</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Einstellungen</h2>
          <span className="test-ipa">[ˈaɪ̯nˌʃtɛlʊŋən]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Anpassung</span>
        </div>
        <p className="test-definition">
          Push-Benachrichtigungen, Erscheinungsbild und Sprache konfigurieren.
        </p>

        {!isLoggedIn ? (
          <div className="konto-placeholder">
            <p className="konto-placeholder-text">
              Melde dich an, um Einstellungen zu verwalten.
            </p>
          </div>
        ) : (
          <div className="konto-settings-content">
            <div className="konto-setting-item">
              <div className="konto-setting-info">
                <span className="konto-setting-label">Push-Benachrichtigungen</span>
                <span className="konto-setting-desc">Tägliche Erinnerung zum Spielen</span>
              </div>
              <label className="konto-toggle">
                <input type="checkbox" disabled />
                <span className="konto-toggle-slider" />
              </label>
            </div>

            <div className="konto-setting-item">
              <div className="konto-setting-info">
                <span className="konto-setting-label">Erscheinungsbild</span>
                <span className="konto-setting-desc">Hell, Dunkel oder Automatisch</span>
              </div>
              <select className="konto-select" disabled>
                <option>Hell</option>
                <option>Dunkel</option>
                <option>Automatisch</option>
              </select>
            </div>

            <div className="konto-setting-item">
              <div className="konto-setting-info">
                <span className="konto-setting-label">Sprache</span>
                <span className="konto-setting-desc">Oberflächensprache der App</span>
              </div>
              <select className="konto-select" disabled>
                <option>Deutsch</option>
                <option>English</option>
              </select>
            </div>
          </div>
        )}

        <div className="test-entry-footer">
          <span className="test-status">In Entwicklung</span>
        </div>
      </div>
    </li>
  )
}
