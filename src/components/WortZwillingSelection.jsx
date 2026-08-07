import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'
import SelectionThema from './SelectionThema'
import EigenesLemma from './EigenesLemma'
import ExternalLink from './ExternalLink'
import WiktionaryHinweis from './WiktionaryHinweis'

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

export default function WortZwillingSelection({ data, thema, themaKurz, themaQuelle, onPlay, onViewDaily, wzPlayed = null, onBack, spezialwoche = null, swWzPlayed = null, onPlaySpezial, onViewSpezial, customLemma = null, onCustomPlay, onShowPremium }) {
  const { wortA, wortB, pos, notiz, link } = data ?? {}
  const [notizOpen, setNotizOpen] = useState(false)
  const wortart = pos || 'Substantiv'
  const isPlayed = !!wzPlayed

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
          <div className={`lemma-card${isPlayed ? ' lemma-card--played' : ''}`}>
            <button className="lemma-card-main" type="button"
              onClick={isPlayed ? onViewDaily : onPlay}
              aria-label={isPlayed ? `${wortA} vs. ${wortB} – Ergebnis ansehen` : `${wortA} vs. ${wortB} – Wort-Zwilling starten`}>
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
          <div className={`lemma-card${isPlayed ? ' lemma-card--played' : ''}`}>
            <button className="lemma-card-main" type="button"
              onClick={isPlayed ? onViewDaily : onPlay}
              aria-label={isPlayed ? `${wortA} vs. ${wortB} – Ergebnis ansehen` : `${wortA} vs. ${wortB} – Wort-Zwilling starten`}>
              <WZEntry lemma={wortB} pos={wortart} />
              <span className="lemma-arrow" aria-hidden="true">›</span>
            </button>
          </div>

          {/* Notiz-Panel */}
          {notizOpen && notiz && (
            <div className="lemma-notiz">
              <span>{notiz}</span>
              {link && (
                <ExternalLink href={link}
                  className="lemma-notiz-link"
                  aria-label="Mehr erfahren (öffnet externen Link)"
                >Mehr →</ExternalLink>
              )}
            </div>
          )}

        </div>

          {/* ── Wort der Woche ─── */}
          {spezialwoche?.wortzwilling && (() => {
            const sw = spezialwoche.wortzwilling
            const swWortart = sw.pos || 'Substantiv'
            const swIsPlayed = !!swWzPlayed
            const swLabel = `${sw.wortA} vs. ${sw.wortB} – Wort-Zwilling${swIsPlayed ? ' – Ergebnis ansehen' : ' starten'}`
            return (
              <>
                <div className="lemma-cards-spezial-divider" role="separator" aria-label="Wort der Woche">
                  <span className="lemma-cards-spezial-label">✦ Wort der Woche</span>
                </div>
                <div className="wz-pair-card">
                  <div className={`lemma-card lemma-card--spezial${swIsPlayed ? ' lemma-card--played' : ''}`}>
                    <button className="lemma-card-main" type="button"
                      onClick={swIsPlayed ? onViewSpezial : onPlaySpezial}
                      aria-label={swLabel}>
                      <WZEntry lemma={sw.wortA} pos={swWortart} />
                      <span className="lemma-arrow" aria-hidden="true">›</span>
                    </button>
                  </div>
                  <div className="wz-selection-vs">
                    <span className="wz-vs-line" aria-hidden="true" />
                    <span className="wz-vs-label" aria-hidden="true">vs.</span>
                    <span className="wz-vs-line" aria-hidden="true" />
                  </div>
                  <div className={`lemma-card lemma-card--spezial${swIsPlayed ? ' lemma-card--played' : ''}`}>
                    <button className="lemma-card-main" type="button"
                      onClick={swIsPlayed ? onViewSpezial : onPlaySpezial}
                      aria-label={swLabel}>
                      <WZEntry lemma={sw.wortB} pos={swWortart} />
                      <span className="lemma-arrow" aria-hidden="true">›</span>
                    </button>
                  </div>
                </div>
              </>
            )
          })()}

          {/* ── Eigenes Wort-Paar (Premium) ─── */}
          <EigenesLemma mode="wortzwilling" customLemma={customLemma} onPlay={onCustomPlay} onShowPremium={onShowPremium} />

          <WiktionaryHinweis />
      </div>
    </div>
  )
}
