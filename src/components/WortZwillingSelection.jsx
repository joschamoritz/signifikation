export default function WortZwillingSelection({ data, thema, onPlay, onBack }) {
  const { wortA, wortB, pos, notiz, link } = data ?? {}

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
          <span className="back-btn-chevron">‹</span>Zurück
        </button>
        <span className="quiz-game-badge">Wort-Zwilling</span>
        <h1 className="sr-only">Wort-Zwilling – Wortvorschau</h1>
        {thema && <p className="selection-thema">{thema}</p>}
      </header>

      <div className="secondary-selection-card">
        <div className="lemma-info">
          <div className="lemma-header-row">
            <span className="lemma-name">{wortA} / {wortB}</span>
            <span className="lemma-wortart-abbrev">{pos || 'Substantiv'}</span>
          </div>
          <p className="secondary-selection-description">
            Zwei bedeutungsnahe Wörter — zwei unterschiedliche Kollokationsprofile.
            Ordne zehn Kollokationen dem richtigen Lemma zu.
          </p>
          {notiz && (
            <p className="secondary-selection-notiz">{notiz}</p>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="lemma-notiz-link"
            >Mehr →</a>
          )}
        </div>
        <div className="secondary-selection-footer">
          <button className="test-cta secondary-selection-play-btn" type="button" onClick={onPlay}>
            Wort-Zwilling starten <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
