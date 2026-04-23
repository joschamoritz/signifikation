export default function ZeitreiseSelection({ data, thema, onPlay, onBack }) {
  const { lemma, wortart, notiz, link, pos } = data ?? {}

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
          <span className="back-btn-chevron">‹</span>Zurück
        </button>
        <span className="quiz-game-badge">Zeitreise</span>
        <h1 className="sr-only">Zeitreise – Wortvorschau</h1>
        {thema && <p className="selection-thema">{thema}</p>}
      </header>

      <div className="secondary-selection-card">
        <div className="lemma-info">
          <div className="lemma-header-row">
            <span className="lemma-name">{lemma}</span>
            <span className="lemma-wortart-abbrev">{wortart || pos || 'Substantiv'}</span>
          </div>
          <p className="secondary-selection-description">
            Wie haben sich die typischen Begleiter dieses Wortes über Jahrhunderte verändert?
            Vergleiche Kollokationen aus fünf verschiedenen Sprachperioden.
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
            Zeitreise starten <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
