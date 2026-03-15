import { useState, useEffect } from 'react'
import { getMedal, getRundInfo } from '../utils/gameLogic'
import { API_BASE } from '../config'
import BelegeSatz from './BelegeSatz'

const THRESHOLDS = [
  { min: 10, label: 'Perfekt' },
  { min: 8,  label: 'Sehr gut' },
  { min: 6,  label: 'Gut' },
  { min: 4,  label: 'Solide' },
]

export default function Results({ lemma, roundScores, onRestart, onToSelection }) {
  const total     = roundScores.reduce((a, b) => a + b, 0)
  const hasBonus  = roundScores.length >= 4
  const maxPoints = hasBonus ? 10 : 9
  const medal     = getMedal(total)

  const [barsVisible, setBarsVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const [logDiceOpen,   setLogDiceOpen]   = useState(false)
  const [belegeInfoOpen, setBelegeInfoOpen] = useState(false)
  const [openBeleg,     setOpenBeleg]     = useState(null)   // cacheKey
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)

  async function loadBelege(roundKey, rel, collocate) {
    const cacheKey = `${roundKey}-${collocate}`
    // Schon offen → schließen
    if (openBeleg === cacheKey) { setOpenBeleg(null); return }
    // Im Cache → direkt öffnen
    if (belegeCache[cacheKey] !== undefined) { setOpenBeleg(cacheKey); return }

    setOpenBeleg(cacheKey)
    setBelegeLoading(true)
    try {
      const r = await fetch(
        `${API_BASE}/api/belege?collocate=${encodeURIComponent(collocate)}&lemma=${encodeURIComponent(lemma.lemma)}&rel=${rel}`
      )
      const data = await r.json()
      setBelegeCache(prev => ({ ...prev, [cacheKey]: Array.isArray(data) ? data : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [cacheKey]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  return (
    <div className="screen results-screen">
      <header className="results-header">
        <p className="lemma-played-title">{lemma.lemma}</p>
        <p className="total-score">{total} / {maxPoints} Punkte</p>
        <p className="result-feedback">{medal.label}</p>
        {lemma.notiz && (
          <div className="lemma-notiz results-notiz">
            <span>{lemma.notiz}</span>
            {lemma.link && (
              <a href={lemma.link} target="_blank" rel="noopener noreferrer" className="lemma-notiz-link">
                Mehr →
              </a>
            )}
          </div>
        )}
      </header>

      <div className="round-scores-card">
        {roundScores.slice(0, 3).map((score, i) => (
          <div key={i} className="score-row">
            <span className="score-row-label">R{i + 1} {getRundInfo(lemma)[i]?.label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: barsVisible ? `${(score / 3) * 100}%` : '0%' }} />
            </div>
            <span className="score-row-value">{score}/3</span>
          </div>
        ))}
        {hasBonus && (
          <div className="score-row">
            <span className="score-row-label score-row-label--bonus">Bonus</span>
            <div className="bar-track">
              <div className="bar-fill bar-fill--bonus" style={{ width: barsVisible ? `${roundScores[3] * 100}%` : '0%' }} />
            </div>
            <span className="score-row-value">{roundScores[3]}/1</span>
          </div>
        )}
      </div>

      <div className="wortprofil-card">
        <div className="wortprofil-header">
          <div className="wortprofil-title-row">
            <p className="wortprofil-title">Wortprofil · {lemma.lemma}</p>
            <a
              className="dwds-link"
              href={`https://www.dwds.de/wb/${encodeURIComponent(lemma.lemma)}`}
              target="_blank" rel="noopener noreferrer"
            >Mehr erfahren ↗</a>
          </div>
          <button className="logdice-toggle" onClick={() => setLogDiceOpen(o => !o)} aria-expanded={logDiceOpen}>
            Was bedeutet logDice?
            <span className={`toggle-arrow ${logDiceOpen ? 'toggle-arrow--open' : ''}`} aria-hidden="true">›</span>
          </button>
          {logDiceOpen && (
            <div className="logdice-explanation">
              <p>Der <strong>logDice-Wert</strong> misst, wie stark zwei Wörter miteinander assoziiert sind. Je höher der Wert, desto typischer ist die Wortverbindung im DWDS-Korpus. Der Maximalwert beträgt 14.</p>
              <p>Grundlage: Pavel Rychlý, <em>A Lexicographer-Friendly Association Score</em> (2008).</p>
            </div>
          )}
          <button className="logdice-toggle" onClick={() => setBelegeInfoOpen(o => !o)} aria-expanded={belegeInfoOpen}>
            Belege anzeigen lassen
            <span className={`toggle-arrow ${belegeInfoOpen ? 'toggle-arrow--open' : ''}`} aria-hidden="true">›</span>
          </button>
          {belegeInfoOpen && (
            <div className="logdice-explanation">
              <p>Klicke auf ein <strong>Kollokat</strong> (eines der Wörter unten), um echte Beispielsätze aus dem DWDS-Korpus zu sehen. Die Belege sind die fünf aktuellsten Treffer, in denen beide Wörter als Phrase vorkommen – gesucht wird direkt im Zeitungskorpus des DWDS.</p>
            </div>
          )}
        </div>

        {getRundInfo(lemma).map(({ key, label, relCode, desc }) => {
          const top3 = (lemma.runden[key] || [])
            .filter(k => k.rang <= 3)
            .sort((a, b) => a.rang - b.rang)
          const activeItem  = top3.find(k => openBeleg === `${key}-${k.wort}`)
          const belegData   = activeItem ? belegeCache[`${key}-${activeItem.wort}`] : null

          return (
            <div key={key} className="wortprofil-row">
              <span className="wortprofil-label">{label}</span>
              <span className="wortprofil-desc">{desc}</span>
              <div className="wortprofil-items">
                {top3.map(k => {
                  const isActive = openBeleg === `${key}-${k.wort}`
                  return (
                    <button
                      key={k.wort}
                      className={`wortprofil-item${isActive ? ' wortprofil-item--active' : ''}`}
                      onClick={() => loadBelege(key, relCode, k.wort)}
                      title="Korpusbelege anzeigen"
                    >
                      {k.wort}
                      <span className="logdice">{k.log_dice}</span>
                    </button>
                  )
                })}
              </div>

              {activeItem && (
                <div className="belege-panel">
                  <p className="belege-panel-title">
                    Belege: <em>{lemma.lemma}</em> + <em>{activeItem.wort}</em>
                  </p>
                  {belegeLoading && !belegData ? (
                    <p className="belege-status">Lade Belege …</p>
                  ) : belegData?.length ? (
                    belegData.map((b, bi) => (
                      <div key={bi} className="beleg-item">
                        <BelegeSatz tokens={b.tokens} />
                        <p className="beleg-quelle">{b.quelle}</p>
                      </div>
                    ))
                  ) : (
                    <p className="belege-status">Keine Belege gefunden.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="thresholds">
        {THRESHOLDS.map(t => (
          <span key={t.min} className={`threshold${total >= t.min ? ' reached' : ''}`}>
            {t.label} {t.min}+
          </span>
        ))}
      </div>

      <div className="results-actions">
        <button className="btn-secondary" onClick={onToSelection}>
          Alle Wörter ansehen
        </button>
        <button className="btn-primary" onClick={onRestart}>
          Zur Startseite
        </button>
      </div>
    </div>
  )
}
