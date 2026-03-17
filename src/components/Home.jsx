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

/** Lokales Datum als YYYY-MM-DD (keine UTC-Verschiebung). */
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** Berechnet den aktuellen Streak anhand von sig_activity (beliebiges Spiel).
 *  Fallback: sig_history für Nutzer mit alten Daten. */
function computeStreak() {
  const activity = JSON.parse(localStorage.getItem('sig_activity') || '[]')
  // Backwards-compat: alte sig_history-Einträge einbeziehen
  const legacy   = JSON.parse(localStorage.getItem('sig_history') || '[]').map(h => h.date)
  const dateSet  = new Set([...activity, ...legacy])
  if (!dateSet.size) return 0
  const msDay = 86_400_000
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr     = localDateStr(today)
  const yesterdayStr = localDateStr(new Date(today - msDay))
  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) return 0
  let d = dateSet.has(todayStr) ? new Date(today) : new Date(today - msDay)
  let streak = 0
  while (dateSet.has(localDateStr(d))) {
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

  const streak      = computeStreak()
  const totalPoints = playedGames.reduce((s, g) => s + g.total, 0)
  const maxPoints   = playedGames.length * 10
  const dailyMedal  = allPlayed ? getDailyMedal(totalPoints) : null

  return (
    <div className="screen home-screen">
      <header className="home-header">
        <img src="/logo.png" alt="Signifikation" className="app-logo" />
        <h1 className="sr-only">Signifikation</h1>
        <span className="beta-badge" aria-label="Beta-Version">Beta</span>
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

      {/* Teaser: kommendes Spiel */}
      <div className="game-card game-card--coming-soon" aria-hidden="true">
        <div className="game-card-head">
          <span className="game-card-title">???</span>
          <span className="game-card-meta">In Arbeit</span>
        </div>
        <p className="game-card-empty">Demnächst verfügbar</p>
        <button className="btn-primary btn-full" disabled>Bald verfügbar</button>
      </div>

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

      <footer className="legal-footer">
        <nav className="legal-links" aria-label="Rechtliche Links">
          <a href="/impressum.html">Impressum</a>
          <a href="/datenschutz.html">Datenschutz</a>
          <a href="/nutzungsbedingungen.html">Nutzungsbedingungen</a>
        </nav>
        <p className="build-info">
          v{__APP_VERSION__} · {__BUILD_DATE__}
        </p>
      </footer>

    </div>
  )
}
