import { useState } from 'react'
import { getDailyMedal } from '../utils/gameLogic'

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const MONTHS   = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function buildShareText(playedGames, zrPlayed) {
  const d = new Date()
  const dateStr = `${d.getDate()}. ${MONTHS[d.getMonth()]}`

  function blocks(score) {
    const filled = Math.round((score / 10) * 5)
    return '█'.repeat(filled) + '░'.repeat(5 - filled)
  }

  const lines = [`📖 Signifikation · ${dateStr}`, '']

  if (playedGames.length > 0) {
    lines.push('Kollokationen erkundet:')
    for (const g of playedGames) {
      lines.push(`${blocks(g.total)}  ${g.total}/10 · ${g.medal}`)
    }
    lines.push('')
  }

  if (zrPlayed) {
    lines.push('Zeitreise durch 500 Jahre:')
    lines.push(`${blocks(zrPlayed.total)}  ${zrPlayed.total}/10 · ${zrPlayed.medal}`)
    lines.push('')
  }

  if (playedGames.length > 0) {
    const kollTotal = playedGames.reduce((s, g) => s + g.total, 0)
    const daily = getDailyMedal(kollTotal)
    lines.push(`🏅 ${daily.label}`)
  }

  lines.push('signifikation.de')
  return lines.join('\n')
}

function todayLabel() {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const MEDAL_CLASS = { 'Gold': 'gold', 'Silber': 'silber', 'Bronze': 'bronze', 'Weiter üben!': 'ueben' }

function getHistory() {
  return JSON.parse(localStorage.getItem('sig_history') || '[]')
}

/** Berechnet den aktuellen Streak (aufeinanderfolgende Tage mit abgeschlossenem Spiel). */
function computeStreak(history) {
  if (!history.length) return 0
  const dateSet = new Set(history.map(h => h.date))
  const msDay = 86_400_000
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr     = today.toISOString().slice(0, 10)
  const yesterdayStr = new Date(today - msDay).toISOString().slice(0, 10)
  // Kein Streak mehr falls weder heute noch gestern gespielt
  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) return 0
  let d = dateSet.has(todayStr) ? new Date(today) : new Date(today - msDay)
  let streak = 0
  while (dateSet.has(d.toISOString().slice(0, 10))) {
    streak++
    d = new Date(d - msDay)
  }
  return streak
}

function streakFlames(n) {
  if (n >= 30) return '🔥🔥🔥'
  if (n >= 7)  return '🔥🔥'
  return '🔥'
}

export default function Home({ onStart, loading, error, playedGames = [], allPlayed = false,
                              zeitreise = null, zrPlayed = null, onPlayZeitreise }) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function shareResult() {
    const text = buildShareText(playedGames, zrPlayed)
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch {}
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {}
  }

  const allHistory  = getHistory()
  const history     = allHistory.slice(0, 14).reverse() // älteste zuerst → neueste rechts
  const streak      = computeStreak(allHistory)
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

      {streak > 0 && (
        <div className="streak-pill">
          <span className="streak-flames">{streakFlames(streak)}</span>
          <div className="streak-text">
            <span className="streak-count">{streak}</span>
            <span className="streak-label">{streak === 1 ? 'Tag' : 'Tage'} am Stück</span>
          </div>
        </div>
      )}

      <div className="home-card">
        <button
          className="home-card-toggle"
          onClick={() => setInfoOpen(o => !o)}
          aria-expanded={infoOpen}
        >
          <span>Was ist eine Kollokation?</span>
          <span className={`toggle-arrow ${infoOpen ? 'toggle-arrow--open' : ''}`} aria-hidden="true">›</span>
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

      {/* Zeitreise-Spielkarte */}
      {zeitreise && (
        <div className="game-card">
          <div className="game-card-head">
            <span className="game-card-title">Zeitreise</span>
            <span className="game-card-meta">5 Perioden · max. 10 Punkte · {Math.min(...zeitreise.paare.map(p => Number(p.jahrzehnt)))}–{Math.max(...zeitreise.paare.map(p => Number(p.jahrzehnt)))}</span>
          </div>

          {zrPlayed ? (
            <div className="game-played-entry">
              <span className="game-played-word">{zrPlayed.lemma}</span>
              <span className="game-played-score">{zrPlayed.total}/10 · {zrPlayed.medal}</span>
            </div>
          ) : (
            <p className="game-card-empty">Heute noch nicht gespielt</p>
          )}

          <button
            className="btn-primary btn-full"
            onClick={onPlayZeitreise}
            disabled={!!zrPlayed}
          >
            {zrPlayed ? 'Bereits gespielt' : 'Zeitreise starten'}
          </button>
        </div>
      )}

      {playedGames.length > 0 && (
        <button
          className={`btn-share${copied ? ' btn-share--copied' : ''}`}
          onClick={shareResult}
          aria-label="Ergebnis teilen oder kopieren"
        >
          {copied ? '✓ Kopiert!' : '↗ Ergebnis teilen'}
        </button>
      )}

      <p className="feedback-hint">
        Fehler oder Anregungen? Schreib uns.
      </p>

      {history.length > 0 && (
        <div className="history-strip">
          <span className="history-label">Verlauf</span>
          <div className="history-dots" role="list" aria-label="Spielverlauf der letzten Tage">
            {history.map((h, i) => (
              <span
                key={i}
                role="listitem"
                className={`history-dot history-dot--${MEDAL_CLASS[h.medal] ?? 'ueben'}`}
                aria-label={`${h.date}: ${h.medal}, ${h.total} von ${h.maxTotal} Punkten`}
                title={`${h.date}: ${h.medal} · ${h.total}/${h.maxTotal} Punkte`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
