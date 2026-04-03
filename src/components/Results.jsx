import { useState, useEffect } from 'react'
import { getMedal, getRundInfo } from '../utils/gameLogic'
import { lsGet, lsParse } from '../utils/storage'
import { useBelege } from '../hooks/useBelege'
import BelegePanel from './BelegePanel'

function getKollHistory() {
  const newHistory = lsParse(lsGet('sig_koll_history'), [])
  const medalToEmoji = { 'Gold': '🥇', 'Silber': '🥈', 'Bronze': '🥉' }
  const oldHistory = lsParse(lsGet('sig_history'), [])
    .filter(h => !newHistory.find(n => n.date === h.date))
    .map(h => ({
      date: h.date,
      medal: h.medal === 'Weiter üben!' ? 'Teilgenommen' : h.medal,
      emoji: medalToEmoji[h.medal] ?? '🌱',
    }))
  return [...newHistory, ...oldHistory]
    .sort((a, b) => a.date < b.date ? -1 : 1)
    .slice(-14)
}

const THRESHOLDS = [
  { min: 10, label: 'Perfekt' },
  { min: 8,  label: 'Sehr gut' },
  { min: 6,  label: 'Gut' },
  { min: 4,  label: 'Solide' },
]

export default function Results({ lemma, roundScores, onRestart, onToSelection }) {
  const kollHistory = getKollHistory()
  const total     = roundScores.reduce((a, b) => a + b, 0)
  const hasBonus  = roundScores.length >= 4
  const maxPoints = hasBonus ? 10 : 9
  const medal     = getMedal(total)

  const [barsVisible, setBarsVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const { openBeleg, belegeCache, belegeLoading, loadBelege } = useBelege(lemma.lemma)

  const [logDiceOpen, setLogDiceOpen] = useState(false)

  return (
    <div className="screen results-screen">
      <header className="results-header">
        <h1 className="lemma-played-title">{lemma.lemma}</h1>
        <p className="total-score">{total} / {maxPoints} Punkte</p>
        <p className="result-feedback">{medal.label}</p>
        {lemma.notiz && (
          <div className="lemma-notiz results-notiz">
            <span>{lemma.notiz}</span>
            {lemma.link && (
              <a href={lemma.link} target="_blank" rel="noopener noreferrer" className="lemma-notiz-link"
                aria-label={`Mehr über ${lemma.lemma} erfahren (öffnet externen Link)`}>
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
            <div className="bar-track" role="img" aria-label={`${score} von 3 Punkten`}>
              <div className="bar-fill" style={{ width: barsVisible ? `${(score / 3) * 100}%` : '0%' }} aria-hidden="true" />
            </div>
            <span className="score-row-value" aria-hidden="true">{score}/3</span>
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
              className="extern-link"
              href={`https://de.wiktionary.org/wiki/${encodeURIComponent(lemma.lemma)}`}
              target="_blank" rel="noopener noreferrer"
              aria-label={`Mehr über „${lemma.lemma}" auf Wiktionary erfahren (öffnet externen Link)`}
            >Mehr erfahren ↗</a>
          </div>
          <button className="logdice-toggle" onClick={() => setLogDiceOpen(o => !o)} aria-expanded={logDiceOpen}>
            Was bedeutet logDice?
            <span className={`toggle-arrow ${logDiceOpen ? 'toggle-arrow--open' : ''}`} aria-hidden="true">›</span>
          </button>
          {logDiceOpen && (
            <div className="logdice-explanation">
              <p>Der <strong>logDice-Wert</strong> misst, wie stark zwei Wörter miteinander assoziiert sind. Je höher der Wert, desto typischer ist die Wortverbindung im Korpus. Der Maximalwert beträgt 14.</p>
              <p>Grundlage: Pavel Rychlý, <em>A Lexicographer-Friendly Association Score</em> (2008).</p>
            </div>
          )}
          <p className="belege-hint">Klicke auf ein Kollokat, um Beispielsätze anzuzeigen.</p>
        </div>

        {getRundInfo(lemma).map(({ key, label, desc }) => {
          const relCode = lemma.rundenInfo?.find(r => r.key === key)?.relCode ?? ''
          const top3 = (lemma.runden[key] || [])
            .filter(k => k.rang <= 3)
            .sort((a, b) => a.rang - b.rang)

          return (
            <div key={key} className="wortprofil-row">
              <span className="wortprofil-label">{label}</span>
              <span className="wortprofil-desc">{desc}</span>
              <div className="wortprofil-items">
                {top3.map(k => (
                  <button
                    key={k.wort}
                    className={`wortprofil-item${openBeleg === k.wort ? ' option--beleg-active' : ''}`}
                    onClick={() => loadBelege(k.wort, k.wort, { rel: relCode })}
                    aria-label={`${k.wort} – Korpusbelege ansehen`}
                    aria-pressed={openBeleg === k.wort}
                  >
                    {k.wort}
                    <span className="logdice" aria-hidden="true">{k.log_dice}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {openBeleg && (
          <BelegePanel
            lemma={lemma.lemma}
            collocate={openBeleg}
            data={belegeCache[openBeleg]}
            loading={belegeLoading}
          />
        )}
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

      <p className="quelle">Kollokationsdaten: Eigenes Wortprofil, berechnet aus freien deutschsprachigen Korpora (CC BY-SA).</p>

      {kollHistory.length > 0 && (
        <div className="history-strip">
          <span className="history-label">Dein Verlauf · Kollokationen</span>
          <div className="history-emojis" role="list" aria-label="Verlauf Kollokationen">
            {kollHistory.map((h, i) => (
              <span key={i} role="listitem" className="history-emoji"
                    title={`${h.date}: ${h.medal}`} aria-label={`${h.date}: ${h.medal}`}>
                {h.emoji}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
