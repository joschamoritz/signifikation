import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'

export default function ZeitreiseSelection({ data, thema, onPlay, onBack }) {
  const { lemma, wortart, notiz, link } = data ?? {}
  const [notizOpen, setNotizOpen] = useState(false)
  const { ipa, definitionen, loading } = useWiktionary({ lemma })

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
            {ipa
              ? <span className="lautschrift lemma-ipa">[{ipa}]</span>
              : loading && <span className="lemma-ipa-skeleton" aria-hidden="true" />
            }
            <span className="lemma-wortart-abbrev">{wortart || 'Substantiv'}</span>
          </div>

          {definitionen.length > 0 && (
            <div className="lemma-definition">
              {definitionen.slice(0, 2).map((d, i) => <p key={i}>{d}</p>)}
            </div>
          )}
        </div>

        {notiz && (
          <div className="secondary-selection-notiz-wrap">
            <button
              className={`lemma-info-btn${notizOpen ? ' lemma-info-btn--active' : ''}`}
              onClick={() => setNotizOpen(o => !o)}
              aria-label={`Hinweis ${notizOpen ? 'ausblenden' : 'anzeigen'}`}
              aria-expanded={notizOpen}
            >i</button>
            {notizOpen && (
              <div className="lemma-notiz secondary-selection-notiz-panel">
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
        )}

        <div className="secondary-selection-footer">
          <button className="test-cta secondary-selection-play-btn" type="button" onClick={onPlay}>
            Zeitreise starten <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
