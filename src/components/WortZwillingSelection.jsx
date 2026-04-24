import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'
import SelectionThema from './SelectionThema'

function ZwillingEntry({ lemma, pos, onPlay }) {
  const { ipa, definitionen, loading } = useWiktionary({ lemma })

  return (
    <button
      className="lemma-card-main"
      onClick={onPlay}
      aria-label={`${lemma} – Wort-Zwilling starten`}
    >
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
      <span className="lemma-arrow" aria-hidden="true">›</span>
    </button>
  )
}

export default function WortZwillingSelection({ data, thema, onPlay, onBack }) {
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
        <SelectionThema thema={thema} />
      </header>

      <div className="secondary-selection-card">

        {/* Eintrag A mit i-Button */}
        <div className="lemma-card-wrap">
          <div className="lemma-card">
            <ZwillingEntry lemma={wortA} pos={wortart} onPlay={onPlay} />
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

        {/* vs.-Trennlinie */}
        <div className="wz-selection-vs" aria-hidden="true">vs.</div>

        {/* Eintrag B */}
        <div className="lemma-card-wrap">
          <div className="lemma-card">
            <ZwillingEntry lemma={wortB} pos={wortart} onPlay={onPlay} />
          </div>
        </div>

      </div>
    </div>
  )
}
