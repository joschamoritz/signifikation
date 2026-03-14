import { useState } from 'react'
import { getDailyMedal } from '../utils/gameLogic'

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const MONTHS   = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function todayLabel() {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const MEDAL_CLASS = { 'Gold': 'gold', 'Silber': 'silber', 'Bronze': 'bronze', 'Weiter üben!': 'ueben' }

function getHistory() {
  return JSON.parse(localStorage.getItem('sig_history') || '[]')
}

export default function Home({ onStart, loading, error, playedGames = [], allPlayed = false }) {
  const [infoOpen, setInfoOpen] = useState(false)

  const history     = getHistory().slice(0, 14).reverse() // älteste zuerst → neueste rechts
  const totalPoints = playedGames.reduce((s, g) => s + g.total, 0)
  const maxPoints   = playedGames.length * 10
  const dailyMedal  = allPlayed ? getDailyMedal(totalPoints) : null

  return (
    <div className="screen home-screen">
      <header className="home-header">
        <img src="/logo.png" alt="Signifikation" className="app-logo" />
        <span className="beta-badge">Beta</span>
      </header>

      <p className="home-date">{todayLabel()}</p>

      <div className="home-card">
        <button className="home-card-toggle" onClick={() => setInfoOpen(o => !o)}>
          <span>Was ist eine Kollokation?</span>
          <span className={`toggle-arrow ${infoOpen ? 'toggle-arrow--open' : ''}`}>›</span>
        </button>
        {infoOpen && (
          <div className="home-card-body">
            <p className="home-card-text">
              Kollokationen sind Wortverbindungen, die im Sprachgebrauch statistisch
              besonders häufig gemeinsam auftreten — etwa <em>blondes Haar</em> oder{' '}
              <em>eine Frage stellen</em>. Der logDice-Wert misst, wie stark zwei
              Wörter miteinander assoziiert sind.
            </p>
            <p className="home-card-text">
              Wähle ein Wort und mutmaße, welche Nomen, Verben und Adjektive
              statistisch stark mit ihm kollokkieren.
            </p>
            <p className="home-card-text">
              Die Kollokationsdaten stammen aus dem <strong>DWDS-Wortprofil</strong> (Version 2026),
              das auf rund 7,5 Milliarden Wörtern aus großen Tageszeitungen (<em>FAZ</em>, <em>SZ</em>,{' '}
              <em>Zeit</em>, <em>NZZ</em> u.&thinsp;a.) sowie dem DWDS-Kernkorpus basiert.
            </p>
          </div>
        )}
      </div>

      {/* Kollokationen-Spielkarte */}
      <div className="game-card">
        <div className="game-card-head">
          <span className="game-card-title">Kollokationen</span>
          <span className="game-card-meta">3 Runden + Bonus · max. 10 Punkte</span>
        </div>

        {playedGames.length > 0 && (
          <div className="game-played-list">
            {playedGames.map(g => (
              <div key={g.id} className="game-played-entry">
                <span className="game-played-word">{g.lemma}</span>
                <span className="game-played-score">{g.total}/10 · {g.medal}</span>
              </div>
            ))}
            {playedGames.length > 1 && (
              <div className={`game-played-total${dailyMedal ? ' game-played-total--medal' : ''}`}>
                {dailyMedal
                  ? <><strong>{dailyMedal.label}</strong> · {totalPoints} / {maxPoints} Punkte</>
                  : <>Gesamt: {totalPoints} / {maxPoints} Punkte · noch {3 - playedGames.length} Wort{3 - playedGames.length !== 1 ? 'e' : ''} übrig</>
                }
              </div>
            )}
          </div>
        )}

        {playedGames.length === 0 && !error && (
          <p className="game-card-empty">Heute noch nicht gespielt</p>
        )}

        {error && (
          <p className="home-error">
            Kein Eintrag für heute verfügbar.<br/>
            <small>{error}</small>
          </p>
        )}

        <button
          className="btn-primary btn-full"
          onClick={onStart}
          disabled={!!loading || !!error || allPlayed}
        >
          {loading   ? 'Lade …'
           : allPlayed ? 'Alle Wörter heute gespielt'
           : playedGames.length > 0 ? 'Weiteres Wort spielen'
           : 'Quiz starten'}
        </button>
      </div>

      <p className="feedback-hint">
        Fehler oder Anregungen?{' '}
        <a className="feedback-link" href="mailto:">Schreib uns.</a>
      </p>

      {history.length > 0 && (
        <div className="history-strip">
          <span className="history-label">Verlauf</span>
          <div className="history-dots">
            {history.map((h, i) => (
              <span
                key={i}
                className={`history-dot history-dot--${MEDAL_CLASS[h.medal] ?? 'ueben'}`}
                title={`${h.date}: ${h.medal} · ${h.total}/${h.maxTotal} Punkte`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
