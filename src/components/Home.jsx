import { useState, useEffect, useRef, useCallback } from 'react'
import { getDailyMedal } from '../utils/gameLogic'
import DayComplete from './DayComplete'
import '../test.css'
import {
  WEEKDAYS, MONTHS,
  localDateStr, getISOWeek, computeStreak, streakFlames, buildShareText,
} from '../utils/homeUtils'
import { shareAsImage } from '../utils/shareImage'
import { lsGet, lsSet } from '../utils/storage'

function LockIcon() {
  return (
    <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', marginBottom: '1px' }}>
      <rect x="0.5" y="4.5" width="8" height="6" rx="1" />
      <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default function Home({
  onStart, loading, error, lemmata = [],
  playedGames = [], allPlayed = false,
  zeitreise = null, zeitreiseError = false, onRetryZeitreise,
  zrPlayed = null, onPlayZeitreise, onViewZeitreise,
  wortzwilling = null, wortzwillingError = false, onRetryWortzwilling,
  wzPlayed = null, onPlayWortzwilling, onViewWortzwilling,
  zeitenwende = null, zeitenwendeError = false, zeitenwendeMissing = false, onRetryZeitenwende,
  zwPlayed = null, onPlayZeitenwende, onViewZeitenwende,
  gesamtausgabe = false,
  onUnlockGesamtausgabe = () => {},
}) {
  const [sheetOpen,         setSheetOpen]         = useState(false)
  const [desktopInfoOpen,   setDesktopInfoOpen]   = useState(false)
  const [shareSheetOpen,    setShareSheetOpen]    = useState(false)
  const [copied,            setCopied]            = useState(false)
  const [sharing,           setSharing]           = useState(false)
  const [imgState,          setImgState]          = useState(null)
  const [showDayComplete,   setShowDayComplete]   = useState(false)
  const [activeCard,        setActiveCard]        = useState(0)

  const entriesRef = useRef(null)

  const streak     = computeStreak()
  const today      = new Date()
  const dateStr    = localDateStr(today)
  const kw         = getISOWeek(today)
  const hasPlayed  = playedGames.length > 0 || !!zrPlayed || !!wzPlayed || !!zwPlayed

  const totalPoints    = playedGames.reduce((s, g) => s + g.total, 0)
  const maxPoints      = playedGames.length * 10
  const dailyMedal     = allPlayed ? getDailyMedal(totalPoints) : null
  const allThreePlayed = allPlayed && !!wzPlayed && (!zeitenwende || !!zwPlayed) && !!zrPlayed

  useEffect(() => {
    if (!allThreePlayed) return
    const key = `sig_day_complete_${localDateStr(new Date())}`
    if (!lsGet(key)) {
      lsSet(key, '1')
      setShowDayComplete(true)
    }
  }, [allThreePlayed])

  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // IntersectionObserver: aktive Karte tracken (nur mobil)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return
    const container = entriesRef.current
    if (!container) return
    const items = container.querySelectorAll('.test-entry')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setActiveCard(Array.from(items).indexOf(entry.target))
          }
        })
      },
      { root: container, threshold: 0.5 }
    )
    items.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  // inert auf nicht-aktiven Karten setzen (nur mobil)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.forEach((item, i) => {
      if (i === activeCard) item.removeAttribute('inert')
      else item.setAttribute('inert', '')
    })
  }, [activeCard])

  // Pfeiltasten-Navigation (nur mobil)
  const handleSnapKeyDown = useCallback((e) => {
    if (!window.matchMedia('(max-width: 699px)').matches) return
    if (e.key === 'ArrowDown') scrollToCard(Math.min(activeCard + 1, 4))
    if (e.key === 'ArrowUp')   scrollToCard(Math.max(activeCard - 1, 0))
  }, [activeCard, scrollToCard])

  async function shareImg() {
    if (sharing) return
    setSharing(true)
    try {
      const result = await shareAsImage(playedGames, zrPlayed, wzPlayed, streak, zwPlayed)
      if (result === 'shared' || result === 'downloaded') {
        setImgState(result)
        setTimeout(() => setImgState(null), 2500)
      }
    } catch {}
    finally { setSharing(false) }
  }

  async function shareResult() {
    const text = buildShareText(playedGames, zrPlayed, wzPlayed, streak, zwPlayed)
    if (navigator.share) { try { await navigator.share({ text }); return } catch {} }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {}
  }

  /* ── CTA-Text & Handler für Kollokationen ─────────────────── */
  const kollCtaText = loading     ? 'Lade …'
                    : allPlayed   ? 'Wörter ansehen'
                    : playedGames.length > 0 ? 'Weiteres Wort spielen'
                    : 'Quiz starten'

  return (
    <>
    <div className="test-page" lang="de">
      {showDayComplete && (
        <DayComplete
          onClose={() => setShowDayComplete(false)}
          playedGames={playedGames}
          zrPlayed={zrPlayed}
          wzPlayed={wzPlayed}
          zwPlayed={zwPlayed}
        />
      )}
      <div className="test-wrapper">

        {/* ── Titelseite ───────────────────────────────────── */}
        <header className="test-title-section" role="banner">
          <p className="test-overline">Tägliches Wortspiel · Linguistik</p>
          <h1 className="test-title">Signifikation</h1>
          <p className="test-subtitle">
            <time dateTime={dateStr}>
              {`${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
            </time>
          </p>
          <div className="test-title-right">
            {hasPlayed && (
              <button
                className="test-title-share"
                type="button"
                onClick={() => setShareSheetOpen(true)}
                aria-label="Ergebnis mitteilen"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1.5" y="3.5" width="12" height="9" rx="0.5"/>
                  <path d="M1.5 4.5 7.5 9 13.5 4.5"/>
                </svg>
              </button>
            )}
            {streak > 0 && (
              <span className="test-title-streak" aria-label={`${streak} Tage Streak`}>
                🔥 {streak}
              </span>
            )}
          </div>
        </header>

        {/* ── Streak ───────────────────────────────────────── */}
        {streak > 0 && (
          <div className="test-streak">
            <span className="test-streak-inner">
              <span aria-hidden="true">{streakFlames(streak)} </span>
              {streak} {streak === 1 ? 'Tag' : 'Tage'} am Stück
            </span>
          </div>
        )}

        {/* ── Raster: Wörter des Tages ─────────────────────── */}
        <nav className="test-raster" aria-label="Wörter des Tages">
          <span className="test-raster-label" aria-hidden="true">Wörter des Tages</span>
          <div className="test-raster-words">
            {lemmata.length > 0
              ? lemmata.map(l => <span key={l.id} className="test-raster-word">{l.lemma}</span>)
              : <span className="test-raster-word" style={{ color: 'var(--t-disabled)' }}>—</span>
            }
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">KW {kw} · {today.getFullYear()}</span>
            {hasPlayed && (
              <button
                className="test-title-share test-raster-share"
                type="button"
                onClick={() => setShareSheetOpen(true)}
                aria-label="Ergebnis mitteilen"
              >
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1.5" y="3.5" width="12" height="9" rx="0.5"/>
                  <path d="M1.5 4.5 7.5 9 13.5 4.5"/>
                </svg>
              </button>
            )}
          </div>
        </nav>

        {/* ── Doppellinie ───────────────────────────────────── */}
        <div className="test-rule--double" role="separator" aria-hidden="true" />

        {/* ── Einträge ─────────────────────────────────────── */}
        <p className="test-section-label" aria-hidden="true">Spielmodi</p>

        <main>
          <ol
            className="test-entries"
            aria-label="Spielmodi"
            ref={entriesRef}
            onKeyDown={handleSnapKeyDown}
          >

            {/* ── ① Kollokationen ─────────────────────────── */}
            <li className={`test-entry test-drop-cap${allPlayed ? ' test-entry--done' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">①</span>
                <span className="test-entry-marginalia">KOLLOKT.</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span className="test-dropcap-k" aria-hidden="true">K</span>
                  <h2 className="test-headword" aria-label="Kollokationen">ollokationen</h2>
                  <span className="test-ipa" aria-label="Aussprache: [kɔlokaˈtsi̯oːnən]">[kɔlokaˈtsi̯oːnən]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Wortspiel</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">täglich</span>
                </div>
                <p className="test-definition">
                  Welche Wörter treten am häufigsten gemeinsam auf? Bestimme die stärksten Kollokationen des Tages aus eigenen Korpusdaten.
                </p>

                {/* Gespielte Wörter */}
                {error && (
                  <p className="test-game-error">Kein Eintrag für heute verfügbar.</p>
                )}
                {!error && playedGames.length > 0 && (
                  <ul className="test-played-list">
                    {playedGames.map(g => (
                      <li key={g.id} className="test-played-entry">
                        <span className="test-played-word">{g.medal?.emoji ?? ''} {g.lemma}</span>
                        <span className="test-played-score">{g.total}/10</span>
                      </li>
                    ))}
                    {allPlayed && dailyMedal && (
                      <li className="test-played-total">
                        <strong>{dailyMedal.emoji} {dailyMedal.label}</strong> · {totalPoints}/{maxPoints} Punkte
                      </li>
                    )}
                  </ul>
                )}

                <div className="test-entry-footer">
                  <span className={`test-status${allPlayed ? ' test-status--done' : ''}`}>
                    {allPlayed ? 'Alle Wörter gespielt.' : playedGames.length > 0
                      ? `${playedGames.length} von ${lemmata.length || 3} Wörtern gespielt.`
                      : 'Noch nicht gespielt.'}
                  </span>
                  <button
                    className="test-cta"
                    type="button"
                    onClick={onStart}
                    disabled={!!loading || !!error}
                    aria-label={`${kollCtaText}: Kollokationen`}
                  >
                    {kollCtaText}
                    {!loading && !error && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
                  </button>
                </div>
              </div>
            </li>

            {/* ── ② Wort-Zwilling ──────────────────────────── */}
            <li className={`test-entry${!wortzwilling ? ' test-entry--disabled' : ''}${wzPlayed ? ' test-entry--done' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">②</span>
                <span className="test-entry-marginalia">KOMPAR.</span>
              </div>
              <div className="test-entry-body">
                <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">Gesamtausgabe</span>
                <div className="test-entry-head">
                  <h2 className="test-headword">Wort-Zwilling</h2>
                  <span className="test-ipa" aria-label="Aussprache: [ˈvɔʁtˌtsvɪlɪŋ]">[ˈvɔʁtˌtsvɪlɪŋ]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Wortspiel</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">komparativ</span>
                </div>
                <p className="test-definition">
                  Zwei bedeutungsnahe Wörter — zwei unterschiedliche Kollokationsprofile. Ordne zehn Kollokationen dem richtigen Lemma zu.
                </p>

                {wzPlayed && wortzwilling && (
                  <ul className="test-played-list">
                    <li className="test-played-entry">
                      <span className="test-played-word">{wzPlayed.medal?.emoji ?? ''} {wortzwilling.wortA} / {wortzwilling.wortB}</span>
                      <span className="test-played-score">{wzPlayed.total}/10</span>
                    </li>
                  </ul>
                )}

                {wortzwillingError && (
                  <p className="test-game-error">
                    Verbindungsfehler.{' '}
                    <button className="test-game-error-retry" type="button" onClick={onRetryWortzwilling}>
                      Erneut versuchen
                    </button>
                  </p>
                )}

                <div className="test-entry-footer">
                  <span className={`test-status${wzPlayed ? ' test-status--done' : ''}`}>
                    {!gesamtausgabe ? 'Teil der Gesamtausgabe.' : wortzwillingError ? '' : !wortzwilling ? 'Heute nicht verfügbar.' : wzPlayed ? 'Gespielt.' : 'Noch nicht gespielt.'}
                  </span>
                  {!gesamtausgabe ? (
                    <button className="test-cta test-cta--locked" type="button" onClick={onUnlockGesamtausgabe} aria-label="Gesamtausgabe freischalten">
                      <LockIcon /> Gesamtausgabe freischalten
                    </button>
                  ) : wortzwilling ? (
                    <button
                      className="test-cta"
                      type="button"
                      onClick={wzPlayed ? onViewWortzwilling : onPlayWortzwilling}
                      aria-label={wzPlayed ? 'Ergebnis ansehen: Wort-Zwilling' : 'Wort-Zwilling starten'}
                    >
                      {wzPlayed ? 'Ergebnis ansehen' : 'Wort-Zwilling starten'}
                      <span className="test-cta-arrow" aria-hidden="true"> →</span>
                    </button>
                  ) : (
                    <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
                  )}
                </div>
              </div>
            </li>

            {/* ── ③ Zeitenwende ────────────────────────────── */}
            <li className={`test-entry${!zeitenwende ? ' test-entry--disabled' : ''}${zwPlayed ? ' test-entry--done' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">③</span>
                <span className="test-entry-marginalia">DIACH.</span>
              </div>
              <div className="test-entry-body">
                <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">Gesamtausgabe</span>
                <div className="test-entry-head">
                  <h2 className="test-headword">Zeitenwende</h2>
                  <span className="test-ipa" aria-label="Aussprache: [ˈtsaɪ̯tənˌvɛndə]">[ˈtsaɪ̯tənˌvɛndə]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Wortspiel</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">diachron</span>
                </div>
                <p className="test-definition">
                  Gehört dieses Wort eher in die Zeit vor oder nach der Jahrtausendwende? Entscheide für zehn Kollokationen eines Lemmas.
                </p>

                {zwPlayed && zeitenwende && (
                  <ul className="test-played-list">
                    <li className="test-played-entry">
                      <span className="test-played-word">{zwPlayed.medal?.emoji ?? ''} {zeitenwende.lemma}</span>
                      <span className="test-played-score">{zwPlayed.total}/10</span>
                    </li>
                  </ul>
                )}

                {zeitenwendeError && (
                  <p className="test-game-error">
                    Verbindungsfehler.{' '}
                    <button className="test-game-error-retry" type="button" onClick={onRetryZeitenwende}>
                      Erneut versuchen
                    </button>
                  </p>
                )}

                <div className="test-entry-footer">
                  <span className={`test-status${zwPlayed ? ' test-status--done' : ''}`}>
                    {!gesamtausgabe ? 'Teil der Gesamtausgabe.' : zeitenwendeError ? 'Der Eintrag konnte gerade nicht geladen werden.' : zeitenwendeMissing || !zeitenwende ? 'Heute nicht verfügbar.' : zwPlayed ? 'Gespielt.' : 'Noch nicht gespielt.'}
                  </span>
                  {!gesamtausgabe ? (
                    <button className="test-cta test-cta--locked" type="button" onClick={onUnlockGesamtausgabe} aria-label="Gesamtausgabe freischalten">
                      <LockIcon /> Gesamtausgabe freischalten
                    </button>
                  ) : zeitenwende ? (
                    <button
                      className="test-cta"
                      type="button"
                      onClick={zwPlayed ? onViewZeitenwende : onPlayZeitenwende}
                      aria-label={zwPlayed ? 'Ergebnis ansehen: Zeitenwende' : 'Zeitenwende starten'}
                    >
                      {zwPlayed ? 'Ergebnis ansehen' : 'Zeitenwende starten'}
                      <span className="test-cta-arrow" aria-hidden="true"> →</span>
                    </button>
                  ) : (
                    <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
                  )}
                </div>
              </div>
            </li>

            {/* ── ④ Zeitreise ──────────────────────────────── */}
            <li className={`test-entry${!zeitreise ? ' test-entry--disabled' : ''}${zrPlayed ? ' test-entry--done' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">④</span>
                <span className="test-entry-marginalia">HIST.</span>
              </div>
              <div className="test-entry-body">
                <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">Gesamtausgabe</span>
                <div className="test-entry-head">
                  <h2 className="test-headword">Zeitreise</h2>
                  <span className="test-ipa" aria-label="Aussprache: [ˈtsaɪ̯tˌʁaɪ̯zə]">[ˈtsaɪ̯tˌʁaɪ̯zə]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Wortspiel</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">historisch</span>
                </div>
                <p className="test-definition">
                  Wie verändern sich Kollokationsmuster über Jahrhunderte? Vergleiche historische und gegenwärtige Belege aus fünf Jahrhunderten Sprachgeschichte.
                </p>

                {zrPlayed && (
                  <ul className="test-played-list">
                    <li className="test-played-entry">
                      <span className="test-played-word">{zrPlayed.medal?.emoji ?? ''} {zrPlayed.lemma}</span>
                      <span className="test-played-score">{zrPlayed.total} Punkte</span>
                    </li>
                  </ul>
                )}

                {zeitreiseError && (
                  <p className="test-game-error">
                    Verbindungsfehler.{' '}
                    <button className="test-game-error-retry" type="button" onClick={onRetryZeitreise}>
                      Erneut versuchen
                    </button>
                  </p>
                )}

                <div className="test-entry-footer">
                  <span className={`test-status${zrPlayed ? ' test-status--done' : ''}`}>
                    {!gesamtausgabe ? 'Teil der Gesamtausgabe.' : zeitreiseError ? '' : !zeitreise ? 'Heute nicht verfügbar.' : zrPlayed ? 'Gespielt.' : 'Noch nicht gespielt.'}
                  </span>
                  {!gesamtausgabe ? (
                    <button className="test-cta test-cta--locked" type="button" onClick={onUnlockGesamtausgabe} aria-label="Gesamtausgabe freischalten">
                      <LockIcon /> Gesamtausgabe freischalten
                    </button>
                  ) : zeitreise ? (
                    <button
                      className="test-cta"
                      type="button"
                      onClick={zrPlayed ? onViewZeitreise : onPlayZeitreise}
                      aria-label={zrPlayed ? 'Ergebnis ansehen: Zeitreise' : 'Zeitreise starten'}
                    >
                      {zrPlayed ? 'Ergebnis ansehen' : 'Zeitreise starten'}
                      <span className="test-cta-arrow" aria-hidden="true"> →</span>
                    </button>
                  ) : (
                    <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
                  )}
                </div>
              </div>
            </li>

            {/* ── ⑤ Demnächst ──────────────────────────────── */}
            <li className="test-entry test-entry--disabled" aria-hidden="true">
              <div className="test-entry-number">
                <span className="test-entry-num-glyph">⑤</span>
                <span className="test-entry-marginalia">i.V.</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <h2 className="test-headword">???</h2>
                  <span className="test-ipa">[ˈfʁaːɡəˌtsaɪ̯çən]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Wortspiel</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">in Arbeit</span>
                </div>
                <p className="test-definition">noch nicht lemmatisiert. — Belege in Bearbeitung; Aufnahme in späteren Auflagen vorgesehen.</p>
                <div className="test-entry-footer">
                  <span className="test-status">Demnächst verfügbar.</span>
                  <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
                </div>
              </div>
            </li>

          </ol>
        </main>

        {/* ── Anmerkung: nur Desktop (mobil via ☞ Bottom Sheet) ── */}
        <section className="test-footnote desktop-footnote" aria-label="Anmerkung: Was ist eine Kollokation?">
          <button
            className="test-footnote-toggle"
            type="button"
            onClick={() => setDesktopInfoOpen(v => !v)}
            aria-expanded={desktopInfoOpen}
            aria-controls="desktop-kollokation-note"
          >
            <span className="test-footnote-label" aria-hidden="true">Anm.</span>
            <span className="test-footnote-title">Was ist eine Kollokation?</span>
            <span className="test-footnote-chevron" aria-hidden="true">▾</span>
          </button>
          <div
            id="desktop-kollokation-note"
            className={`test-footnote-body${desktopInfoOpen ? ' open' : ''}`}
            role="region"
          >
            <p>
              Kollokationen sind <strong>charakteristische syntagmatische Wortverbindungen</strong>,
              in denen ein Element (die <strong>Basis</strong>) den anderen Bestandteil (den{' '}
              <strong>Kollokator</strong>) semantisch selegiert. Man sagt <em>blondes Haar</em> und
              nicht <em>gelbes Haar</em> — nicht weil Letzteres grammatisch falsch wäre, sondern
              weil der konventionalisierte Sprachgebrauch <em>blond</em> als typischen Kollokator
              von <em>Haar</em> fordert.<sup>1</sup>
            </p>
            <p>
              Kollokationen liegen zwischen freien Wortverbindungen (<em>rotes Auto</em>) und
              Idiomen (<em>ins Gras beißen</em>): semantisch motiviert, aber lexikalisch
              konventionalisiert.
            </p>
            <p>
              Der <strong>logDice-Wert</strong><sup>2</sup> misst die statistische Signifikanz
              von Kookkurrenzen im Korpus — je höher der Wert, desto charakteristischer die
              Verbindung. Die Daten stammen aus einem eigenen Wortprofil<sup>3</sup>,
              berechnet aus mehreren Milliarden Textwörtern freier deutschsprachiger Korpora.
            </p>
            <ol className="test-footnote-footnotes">
              <li>Hausmann, F.&thinsp;J. (2003): Was sind eigentlich Kollokationen? In: Steyer, K. (Hrsg.): <em>Wortverbindungen — mehr oder weniger fest</em>. de Gruyter, S.&thinsp;309–334.</li>
              <li>Rychlý, P. (2008): A Lexicographer-Friendly Association Score. In: <em>Proceedings of RASLAN 2008</em>, S.&thinsp;6–9.</li>
              <li>Eigenes Wortprofil, berechnet auf Basis freier deutschsprachiger Korpora (CC BY-SA), syntaktisch annotiert mit dem ZDL-Dependenzparser (BBAW).</li>
            </ol>
          </div>
        </section>

        {/* ── Vertikale Badge-Navigation (nur mobil) ───────── */}
        <nav className="snap-nav" aria-label="Spielmodus-Navigation">
          <div className="snap-nav-games">
            {[['①','Kollokationen'],['②','Wort-Zwilling'],['③','Zeitenwende'],['④','Zeitreise'],['⑤','Demnächst']].map(([glyph, label], i) => (
              <button
                key={i}
                className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
                aria-label={label}
                aria-current={activeCard === i ? 'true' : undefined}
                onClick={() => scrollToCard(i)}
              >{glyph}</button>
            ))}
          </div>
          <button
            className="snap-nav-info"
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Was ist eine Kollokation? – Erklärung öffnen"
          >☞</button>
        </nav>

        {/* ── Kompakter Mobile-Footer (nur mobil) ──────────── */}
        <div className="snap-footer">
          <nav className="snap-footer-links" aria-label="Rechtliche Links">
            <a href="/ueber.html" target="_blank" rel="noopener">Über</a>
            <a href="/impressum.html" target="_blank" rel="noopener">Impressum</a>
            <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutz</a>
          </nav>
          <span className="snap-footer-version">v{__APP_VERSION__}</span>
        </div>

        {/* ── Kolophon ─────────────────────────────────────── */}
        <footer className="test-colophon" role="contentinfo">
          <span className="test-colophon-ornament" aria-hidden="true">
          {[playedGames.length > 0, !!wzPlayed, !!zwPlayed, !!zrPlayed].map((played, i) =>
            played ? '✦' : '·'
          ).join(' ')}
        </span>
          <p className="feedback-hint colophon-feedback">
            Fehler oder Anregungen? <a href="mailto:info@signifikation.de">Schreib uns.</a>
          </p>
          <nav className="legal-links" aria-label="Rechtliche Links">
            <a href="/ueber.html">Über die App</a>
            <a href="/impressum.html">Impressum</a>
            <a href="/datenschutz.html">Datenschutz</a>
            <a href="/nutzungsbedingungen.html">Nutzungsbedingungen</a>
          </nav>
          <p className="test-colophon-edition">
            v{__APP_VERSION__} · {__BUILD_DATE__}
          </p>
        </footer>

      </div>
    </div>

    {/* ── Info Bottom Sheet ────────────────────────────────── */}
    {sheetOpen && (
      <div className="info-sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />
    )}
    <div
      className={`info-sheet${sheetOpen ? ' info-sheet--open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Was ist eine Kollokation?"
      aria-hidden={!sheetOpen}
    >
      <div className="info-sheet-header">
        <span className="info-sheet-label" aria-hidden="true">Anm.</span>
        <h2 className="info-sheet-title">Was ist eine Kollokation?</h2>
        <button className="info-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Schließen">✕</button>
      </div>
      <div className="info-sheet-body">
        <p>
          Kollokationen sind <strong>charakteristische syntagmatische Wortverbindungen</strong>,
          in denen ein Element (die <strong>Basis</strong>) den anderen Bestandteil (den{' '}
          <strong>Kollokator</strong>) semantisch selegiert. Man sagt <em>blondes Haar</em> und
          nicht <em>gelbes Haar</em> — nicht weil Letzteres grammatisch falsch wäre, sondern
          weil der konventionalisierte Sprachgebrauch <em>blond</em> als typischen Kollokator
          von <em>Haar</em> fordert.<sup>1</sup>
        </p>
        <p>
          Kollokationen liegen zwischen freien Wortverbindungen (<em>rotes Auto</em>) und
          Idiomen (<em>ins Gras beißen</em>): semantisch motiviert, aber lexikalisch
          konventionalisiert.
        </p>
        <p>
          Der <strong>logDice-Wert</strong><sup>2</sup> misst die statistische Signifikanz
          von Kookkurrenzen im Korpus — je höher der Wert, desto charakteristischer die
          Verbindung. Die Daten stammen aus einem eigenen Wortprofil<sup>3</sup>,
          berechnet aus mehreren Milliarden Textwörtern freier deutschsprachiger Korpora.
        </p>
        <ol className="info-sheet-footnotes">
          <li>Hausmann, F.&thinsp;J. (2003): Was sind eigentlich Kollokationen? In: Steyer, K. (Hrsg.): <em>Wortverbindungen — mehr oder weniger fest</em>. de Gruyter, S.&thinsp;309–334.</li>
          <li>Rychlý, P. (2008): A Lexicographer-Friendly Association Score. In: <em>Proceedings of RASLAN 2008</em>, S.&thinsp;6–9.</li>
          <li>Eigenes Wortprofil, berechnet auf Basis freier deutschsprachiger Korpora (CC BY-SA), syntaktisch annotiert mit dem ZDL-Dependenzparser (BBAW).</li>
        </ol>
      </div>
    </div>

    {/* ── Share Bottom Sheet ───────────────────────────────── */}
    {shareSheetOpen && (
      <div className="info-sheet-backdrop" onClick={() => setShareSheetOpen(false)} aria-hidden="true" />
    )}
    <div
      className={`share-sheet${shareSheetOpen ? ' share-sheet--open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Ergebnis mitteilen"
      aria-hidden={!shareSheetOpen}
    >
      <div className="share-sheet-header">
        <span className="share-sheet-label">Ergebnis mitteilen</span>
        <button className="info-sheet-close" type="button" onClick={() => setShareSheetOpen(false)} aria-label="Schließen">✕</button>
      </div>
      <button
        className="share-sheet-option"
        type="button"
        onClick={() => { shareImg(); setShareSheetOpen(false) }}
        disabled={sharing}
      >
        <span className="share-sheet-option-glyph">↗</span>
        <span>{sharing ? 'Wird erstellt…' : 'Als Bild mitteilen'}</span>
      </button>
      <button
        className="share-sheet-option"
        type="button"
        onClick={() => { shareResult(); setShareSheetOpen(false) }}
      >
        <span className="share-sheet-option-glyph">↗</span>
        <span>Als Text mitteilen</span>
      </button>
    </div>
    </>
  )
}
