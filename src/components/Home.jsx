import { useState, useEffect } from 'react'
import { getDailyMedal } from '../utils/gameLogic'

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const MONTHS   = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const POS_LABEL = { 'Substantiv': 'Nomen', 'Verb': 'Verb', 'Adjektiv': 'Adj' }

function buildShareText(playedGames, zrPlayed) {
  const d = new Date()
  const dateStr = `${d.getDate()}. ${MONTHS[d.getMonth()]}`

  function blocks(score) {
    const filled = Math.round((score / 10) * 5)
    return '█'.repeat(filled) + '░'.repeat(5 - filled)
  }

  const lines = [`📖 Signifikation · ${dateStr}`, '']

  for (const g of playedGames) {
    const lbl = POS_LABEL[g.pos] || 'Wort'
    lines.push(`[${lbl}] ${g.lemma}  ${blocks(g.total)}  ${g.total}/10`)
  }

  if (playedGames.length > 0) lines.push('')

  if (zrPlayed) {
    lines.push(`[500 Jahre] ${zrPlayed.lemma}  ${blocks(zrPlayed.total)}  ${zrPlayed.total}/10`)
    lines.push('')
  }

  lines.push('💬 Schaffst du es besser? → signifikation.de')
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
                              zeitreise = null, zrPlayed = null, onPlayZeitreise, onViewZeitreise }) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [logoSmall, setLogoSmall] = useState(false)

  useEffect(() => {
    const el = document.querySelector('.screen')
    if (!el) return
    const onScroll = () => setLogoSmall(el.scrollTop > 40)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

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
        <img src="/logo.png" alt="Signifikation" className={`app-logo${logoSmall ? ' app-logo--small' : ''}`} />
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
              Kollokationen sind <strong>charakteristische syntagmatische Wortverbindungen</strong>,
              in denen ein Element (die <strong>Basis</strong>) den anderen Bestandteil (den{' '}
              <strong>Kollokator</strong>) semantisch selegiert. Man sagt <em>blondes Haar</em> und
              nicht <em>gelbes Haar</em> — nicht weil Letzteres grammatisch falsch wäre, sondern
              weil der konventionalisierte Sprachgebrauch <em>blond</em> als typischen Kollokator
              von <em>Haar</em> fordert.<sup>1</sup>
            </p>
            <p className="home-card-text">
              Kollokationen liegen zwischen freien Wortverbindungen (<em>rotes Auto</em>) und
              Idiomen (<em>ins Gras beißen</em>): semantisch motiviert, aber lexikalisch
              konventionalisiert.
            </p>
            <p className="home-card-text">
              Der <strong>logDice-Wert</strong><sup>2</sup> misst die statistische Signifikanz
              von Kookkurrenzen im Korpus — je höher der Wert, desto charakteristischer die
              Verbindung. Die Daten stammen aus dem <strong>DWDS-Wortprofil</strong><sup>3</sup>{' '}
              und dem <strong>DiaCollo</strong>-System<sup>4</sup>, basierend auf mehreren
              Milliarden Textwörtern aus Tageszeitungen, Literatur und historischen Korpora.
            </p>
            <ol className="home-card-footnotes">
              <li>Hausmann, F.&thinsp;J. (2003): Was sind eigentlich Kollokationen? In: Steyer, K. (Hrsg.): <em>Wortverbindungen — mehr oder weniger fest</em>. de Gruyter, S.&thinsp;309–334.</li>
              <li>Rychlý, P. (2008): A Lexicographer-Friendly Association Score. In: <em>Proceedings of RASLAN 2008</em>, S.&thinsp;6–9.</li>
              <li>Berlin-Brandenburgische Akademie der Wissenschaften (BBAW): <em>Digitales Wörterbuch der deutschen Sprache</em>. dwds.de</li>
              <li>Jurish, B. et&thinsp;al. (2014): DiaCollo: On the Trail of Diachronic Collocations. In: <em>Proceedings of DH 2014</em>.</li>
            </ol>
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
          disabled={!!loading || !!error}
        >
          {loading     ? 'Lade …'
           : allPlayed ? 'Wörter ansehen'
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
            onClick={zrPlayed ? onViewZeitreise : onPlayZeitreise}
          >
            {zrPlayed ? 'Ergebnis ansehen' : 'Zeitreise starten'}
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
        Fehler oder Anregungen? <a href="mailto:info@signifikation.de">Schreib uns.</a>
      </p>

      <footer className="legal-footer">
        <nav className="legal-links" aria-label="Rechtliche Links">
          <a href="/ueber.html">Über die App</a>
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
