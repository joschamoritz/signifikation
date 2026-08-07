import { useState } from 'react'
import { useWiktionary } from '../hooks/useWiktionary'
import SelectionThema from './SelectionThema'
import EigenesLemma from './EigenesLemma'
import ExternalLink from './ExternalLink'
import WiktionaryHinweis from './WiktionaryHinweis'

export default function LueckenfuellerSelection({ data, thema, themaKurz, themaQuelle, onPlay, onViewDaily, lfPlayed = null, onBack, spezialwoche = null, swLfPlayed = null, onPlaySpezial, onViewSpezial, customLemma = null, onCustomPlay, onShowPremium }) {
  const { lemma, pos, notiz, link } = data ?? {}
  const [notizOpen, setNotizOpen] = useState(false)
  const isPlayed = !!lfPlayed
  const { ipa, definitionen } = useWiktionary({ lemma })

  return (
    <div className="screen selection-screen">
      <header className="selection-header">
        <button className="back-btn" type="button" onClick={onBack} aria-label="Zurück zur Startseite">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className="quiz-game-badge">Lückenfüller</span>
        <h1 className="sr-only">Lückenfüller – Wortvorschau</h1>
        <SelectionThema thema={thema} themaKurz={themaKurz} themaQuelle={themaQuelle} />
      </header>

      <div className="secondary-selection-card">
        <div className="lemma-card-wrap">
          <div className={`lemma-card${isPlayed ? ' lemma-card--played' : ''}`}>
            <button
              className="lemma-card-main"
              type="button"
              onClick={isPlayed ? onViewDaily : onPlay}
              aria-label={isPlayed ? `${lemma} – Ergebnis ansehen` : `${lemma} – Lückenfüller starten`}
            >
              <div className="lemma-info">
                <div className="lemma-header-row">
                  <span className="lemma-name">{lemma}</span>
                  {ipa && <span className="lautschrift lemma-ipa">[{ipa}]</span>}
                  {pos && <span className="lemma-wortart-abbrev">{pos}</span>}
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
                type="button"
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
                <ExternalLink href={link}
                  className="lemma-notiz-link"
                  aria-label="Mehr erfahren (öffnet externen Link)"
                >Mehr →</ExternalLink>
              )}
            </div>
          )}
        </div>

        {/* ── Wort der Woche ─── */}
        {spezialwoche?.lueckenfuellerLemma?.lueckenfueller && (
          <>
            <div className="lemma-cards-spezial-divider" role="separator" aria-label="Wort der Woche">
              <span className="lemma-cards-spezial-label">✦ Wort der Woche</span>
            </div>
            <div className="lemma-card-wrap">
              <div className={`lemma-card lemma-card--spezial${swLfPlayed ? ' lemma-card--played' : ''}`}>
                <button
                  className="lemma-card-main"
                  type="button"
                  onClick={swLfPlayed ? onViewSpezial : onPlaySpezial}
                  aria-label={`${spezialwoche.lueckenfuellerLemma.lemma} – Lückenfüller${swLfPlayed ? ' – Ergebnis ansehen' : ' starten'}`}
                >
                  <div className="lemma-info">
                    <div className="lemma-header-row">
                      <span className="lemma-name">{spezialwoche.lueckenfuellerLemma.lemma}</span>
                      {spezialwoche.lueckenfuellerLemma.wortart && (
                        <span className="lemma-wortart-abbrev">{spezialwoche.lueckenfuellerLemma.wortart}</span>
                      )}
                    </div>
                    {spezialwoche.lueckenfuellerLemma.definitionen?.length > 0 && (
                      <div className="lemma-definition">
                        {spezialwoche.lueckenfuellerLemma.definitionen.slice(0, 2).map((d, i) => <p key={i}>{d}</p>)}
                      </div>
                    )}
                  </div>
                  <span className="lemma-arrow" aria-hidden="true">›</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Eigenes Lemma (Premium) ─── */}
        <EigenesLemma mode="lueckenfueller" customLemma={customLemma} onPlay={onCustomPlay} onShowPremium={onShowPremium} />

        <WiktionaryHinweis />
      </div>
    </div>
  )
}
