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

export default function WortZwillingSelection({ data, thema, themaKurz, themaQuelle, onPlay, onBack, spezialwoche = null, swWzPlayed = null, onPlaySpezial, onViewSpezial }) {
  const { wortA, wortB, pos, notiz, link } = data ?? {}
  const [notizOpen, setNotizOpen] = useState(false)
  const wortart = pos || 'Substantiv'

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" type="button" onClick={onBack} aria-label="Zurück zur Startseite"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        <span className="quiz-game-badge">Wort-Zwilling</span>
        <h1 className="sr-only">Wort-Zwilling – Wortvorschau</h1>
        <SelectionThema thema={thema} themaKurz={themaKurz} themaQuelle={themaQuelle} />
      </header>

      <div className="secondary-selection-card">
        <div className="wz-pair-card">

          {/* Eintrag A */}
          <div className="lemma-card">
            <button className="lemma-card-main" type="button" onClick={onPlay}
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
                type="button"
                onClick={() => setNotizOpen(o => !o)}
                aria-label={`Hinweis ${notizOpen ? 'ausblenden' : 'anzeigen'}`}
                aria-expanded={notizOpen}
              >i</button>
            )}
          </div>

          {/* Eintrag B */}
          <div className="lemma-card">
            <button className="lemma-card-main" type="button" onClick={onPlay}
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

          {/* ── Wort der Woche ─── */}
          {spezialwoche?.wortzwilling && (
            <>
              <div className="lemma-cards-spezial-divider" role="separator" aria-label="Wort der Woche">
                <span className="lemma-cards-spezial-label">✦ Wort der Woche</span>
              </div>
              <div className="lemma-card-wrap">
                <div className={`lemma-card lemma-card--spezial${swWzPlayed ? ' lemma-card--played' : ''}`}>
                  <button
                    className="lemma-card-main"
                    type="button"
                    onClick={swWzPlayed ? onViewSpezial : onPlaySpezial}
                    aria-label={`${spezialwoche.wortzwilling.wortA} vs. ${spezialwoche.wortzwilling.wortB} – Wort-Zwilling${swWzPlayed ? ' – Ergebnis ansehen' : ' starten'}`}
                  >
                    <div className="lemma-info">
                      <div className="lemma-header-row">
                        <span className="lemma-name">
                          {spezialwoche.wortzwilling.wortA}
                          <span style={{ color: 'var(--muted)', fontWeight: 400, margin: '0 0.3em' }}>vs.</span>
                          {spezialwoche.wortzwilling.wortB}
                        </span>
                      </div>
                    </div>
                    <span className="lemma-arrow" aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </>
          )}
      </div>
    </div>
  )
}
