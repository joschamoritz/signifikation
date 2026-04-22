export default function KontoStatistikenBlock({ isLoggedIn }) {
  return (
    <li className={`test-entry${!isLoggedIn ? ' test-entry--disabled' : ''}`}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">②</span>
        <span className="test-entry-marginalia">STATS</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Statistiken</h2>
          <span className="test-ipa">[ʃtaˈtɪstɪkən]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Spielhistorie</span>
        </div>
        <p className="test-definition">
          Deine Spielhistorie der letzten 365 Tage, geräteübergreifender Fortschritt und Streak-Übersicht.
        </p>

        {!isLoggedIn ? (
          <div className="konto-placeholder">
            <p className="konto-placeholder-text">
              Melde dich an, um deine Statistiken zu sehen.
            </p>
          </div>
        ) : (
          <div className="konto-stats-content">
            <div className="konto-stats-grid">
              <div className="konto-stat-card">
                <span className="konto-stat-label">Aktueller Streak</span>
                <span className="konto-stat-value">🔥 0 Tage</span>
              </div>
              <div className="konto-stat-card">
                <span className="konto-stat-label">Längster Streak</span>
                <span className="konto-stat-value">0 Tage</span>
              </div>
              <div className="konto-stat-card">
                <span className="konto-stat-label">Gespielte Tage</span>
                <span className="konto-stat-value">0</span>
              </div>
              <div className="konto-stat-card">
                <span className="konto-stat-label">Gesamtpunkte</span>
                <span className="konto-stat-value">0</span>
              </div>
            </div>

            <div className="konto-history-section">
              <h3 className="konto-section-title">Spielhistorie (365 Tage)</h3>
              <p className="konto-placeholder-text">
                Noch keine Spiele aufgezeichnet.
              </p>
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
