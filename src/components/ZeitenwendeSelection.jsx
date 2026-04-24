import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'

export default function ZeitenwendeSelection({ data, thema, onPlay, onBack }) {
  const { lemma, ipa: savedIpa, definitionen: savedDefs, notiz, link } = data ?? {}
  const [notizOpen, setNotizOpen] = useState(false)
  const { ipa, definitionen } = useWiktionary({
    lemma,
    initialIpa: savedIpa || '',
    initialDefinitionen: savedDefs || [],
  })

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
        <div className="lemma-card-wrap">
          <div className="lemma-card">
            <button
              className="lemma-card-main"
              onClick={onPlay}
              aria-label={`${lemma} – Zeitenwende starten`}
            >
              <div className="lemma-info">
                <div className="lemma-header-row">
                  <span className="lemma-name">{lemma}</span>
                  {ipa && <span className="lautschrift lemma-ipa">[{ipa}]</span>}
                </div>
                {definitionen.length > 0 && (
                  <div className="lemma-definition">
                    {definitionen.slice(0, 2).map((d, i) => <p key={i}>{d}</p>)}
                  </div>
                )}
              </div>
              <span className="lemma-arrow" aria-hidden="true">›</span>
            </button>

            {notiz && (
              <button
                className={`lemma-info-btn${notizOpen ? ' lemma-info-btn--active' : ''}`}
                onClick={() => setNotizOpen(o => !o)}
                aria-label={`Hinweis ${notizOpen ? 'ausblenden' : 'anzeigen'}`}
                aria-expanded={notizOpen}
              >i</button>
            )}
          </div>

          {notizOpen && notiz && (
            <div className="lemma-notiz">
              <span>{notiz}</span>
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer"
                  className="lemma-notiz-link"
                  aria-label="Mehr erfahren (öffnet externen Link)"
                >Mehr →</a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
