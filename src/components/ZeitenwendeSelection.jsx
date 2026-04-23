export default function ZeitenwendeSelection({ data, thema, onPlay, onBack }) {
  const { lemma, ipa, definitionen, notiz, link } = data ?? {}

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
          <span className="back-btn-chevron">‹</span>Zurück
        </button>
        <span className="quiz-game-badge">Zeitenwende</span>
        <h1 className="sr-only">Zeitenwende – Wortvorschau</h1>
        {thema && <p className="selection-thema">{thema}</p>}
      </header>

      <div className="secondary-selection-card">
        <div className="lemma-info">
          <div className="lemma-header-row">
            <span className="lemma-name">{lemma}</span>
            {ipa && <span className="lautschrift lemma-ipa">[{ipa}]</span>}
          </div>
          {definitionen?.length > 0 && (
            <div className="lemma-definition">
              {definitionen.slice(0, 2).map((d, i) => <p key={i}>{d}</p>)}
            </div>
          )}
          <p className="secondary-selection-description">
            Gehört dieses Wort eher in die Zeit vor oder nach der Jahrtausendwende?
            Entscheide für zehn Kollokationen.
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
            Zeitenwende starten <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
