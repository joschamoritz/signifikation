import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'

function ZwillingEntry({ lemma, pos, loading: parentLoading }) {
  const { ipa, definitionen, loading } = useWiktionary({ lemma })
  const isLoading = parentLoading || loading

  return (
    <div className="lemma-info">
      <div className="lemma-header-row">
        <span className="lemma-name">{lemma}</span>
        {ipa
          ? <span className="lautschrift lemma-ipa">[{ipa}]</span>
          : isLoading && <span className="lemma-ipa-skeleton" aria-hidden="true" />
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
        {thema && <p className="selection-thema">{thema}</p>}
      </header>

      <div className="secondary-selection-card">
        <ZwillingEntry lemma={wortA} pos={wortart} />
        <div className="wz-selection-divider" aria-hidden="true" />
        <ZwillingEntry lemma={wortB} pos={wortart} />

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
            Wort-Zwilling starten <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
