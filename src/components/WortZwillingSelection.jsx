import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'
import SelectionThema from './SelectionThema'

function WZEntry({ lemma, pos }) {
  const { ipa, definitionen, loading } = useWiktionary({ lemma })
  return (
    <div className="lemma-info">
      <div className="lemma-header-row">
        <span className="lemma-name">{lemma}</span>
        {ipa
          ? <span className="lautschrift lemma-ipa">[{ipa}]</span>
          : loading && <span className="lemma-ipa-skeleton" aria-hidden="true" />
        }
        <span className="lemma-wortart-abbrev">{pos}</span>
      </div>
      {definitionen.length > 0 && (
        <div className="lemma-definition">
          {definitionen.slice(0, 2).map((d, i) => <p key={i}>{d}</p>)}
        </div>
      )}
    </div>
  )
}

export default function WortZwillingSelection({ data, thema, themaKurz, themaQuelle, onPlay, onBack }) {
  const { wortA, wortB, pos, notiz, link } = data ?? {}
  const [notizOpen, setNotizOpen] = useState(false)
  const wortart = pos || 'Substantiv'

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
          <span className="back-btn-chevron">‹</span>Zurück
        </button>
        <span className="quiz-game-badge">Wort-Zwilling</span>
        <h1 className="sr-only">Wort-Zwilling – Wortvorschau</h1>
        <SelectionThema thema={thema} themaKurz={themaKurz} themaQuelle={themaQuelle} />
      </header>

      <div className="secondary-selection-card">
        <div className="wz-pair-card">

          {/* Eintrag A */}
          <div className="lemma-card">
            <button className="lemma-card-main" onClick={onPlay}
              aria-label={`${wortA} vs. ${wortB} – Wort-Zwilling starten`}>
              <WZEntry lemma={wortA} pos={wortart} />
              <span className="lemma-arrow" aria-hidden="true">›</span>
            </button>
          </div>

          {/* vs.-Trennlinie mit i-Button */}
          <div className="wz-selection-vs">
            <span className="wz-vs-line" aria-hidden="true" />
            <span className="wz-vs-label" aria-hidden="true">vs.</span>
            <span className="wz-vs-line" aria-hidden="true" />
            {notiz && (
              <button
                className={`lemma-info-btn wz-vs-info-btn${notizOpen ? ' lemma-info-btn--active' : ''}`}
                onClick={() => setNotizOpen(o => !o)}
                aria-label={`Hinweis ${notizOpen ? 'ausblenden' : 'anzeigen'}`}
                aria-expanded={notizOpen}
              >i</button>
            )}
          </div>

          {/* Eintrag B */}
          <div className="lemma-card">
            <button className="lemma-card-main" onClick={onPlay}
              aria-label={`${wortA} vs. ${wortB} – Wort-Zwilling starten`}>
              <WZEntry lemma={wortB} pos={wortart} />
              <span className="lemma-arrow" aria-hidden="true">›</span>
            </button>
          </div>

          {/* Notiz-Panel */}
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
