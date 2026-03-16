import { useState } from 'react'

export default function LemmaSelection({ lemmata, playedIds = [], onSelect, onBack }) {
  const [openNotiz, setOpenNotiz] = useState(null)

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">← Zurück</button>
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="sr-only">Wortauswahl</h1>
        <p className="quiz-instruction">Wähle ein Wort und finde seine stärksten Kollokate</p>
      </header>

      <div className="lemma-cards">
        {lemmata.map(lemma => {
          const played = playedIds.includes(lemma.id)
          return (
          <div key={lemma.id} className="lemma-card-wrap">
            <div className={`lemma-card${played ? ' lemma-card--played' : ''}`}>
              <button
                className="lemma-card-main"
                onClick={() => !played && onSelect(lemma)}
                disabled={played}
              >
                <div className="lemma-info">
                  <span className="lemma-name">{lemma.lemma}</span>
                  <span className="lemma-wortart-chip">{lemma.wortart}</span>
                </div>
                <span className="lemma-arrow">{played ? '✓' : '›'}</span>
              </button>
              {lemma.notiz && (
                <button
                  className={`lemma-info-btn ${openNotiz === lemma.id ? 'lemma-info-btn--active' : ''}`}
                  onClick={() => setOpenNotiz(o => o === lemma.id ? null : lemma.id)}
                  aria-label="Hinweis anzeigen"
                >i</button>
              )}
            </div>
            {openNotiz === lemma.id && lemma.notiz && (
              <div className="lemma-notiz">
                <span>{lemma.notiz}</span>
                {lemma.link && (
                  <a
                    href={lemma.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lemma-notiz-link"
                    aria-label={`Mehr über ${lemma.lemma} erfahren (öffnet externen Link)`}
                  >Mehr →</a>
                )}
              </div>
            )}
          </div>
          )
        })}
      </div>

    </div>
  )
}
