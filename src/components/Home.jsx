import { useState, useEffect, useRef, useCallback } from 'react'
import { getDailyMedal } from '../utils/gameLogic'
import DayComplete from './DayComplete'
import Sheet from './ui/Sheet'
import {
  WEEKDAYS, MONTHS,
  localDateStr, getISOWeek, computeStreak, streakFlames, buildShareText,
} from '../utils/homeUtils'
import { shareAsImage } from '../utils/shareImage'
import { lsGet, lsSet } from '../utils/storage'
import { logError } from '../utils/logError'
import { useActiveSnapCard } from '../hooks/useActiveSnapCard'
import { useSnapCardNav } from '../hooks/useSnapCardNav'
import { useScrollPersist } from '../hooks/useScrollPersist'
import KollokationNote from './KollokationNote'
import { MOBILE_MEDIA_QUERY } from '../config'
import GameEntry from './GameEntry'
import LegalLinks from './LegalLinks'

import { memo } from 'react'

function Home({
  onStart, loading, error, lemmata = [],
  thema = '',
  playedGames = [], allPlayed = false,
  wortzwilling = null, wortzwillingError = false, onRetryWortzwilling,
  wzPlayed = null, onPlayWortzwilling,
  zeitenwende = null, zeitenwendeError = false, zeitenwendeMissing = false, onRetryZeitenwende,
  zwPlayed = null, onPlayZeitenwende,
  lueckenfuellerLemma = null, lfPlayed = null, onPlayLueckenfueller,
  serverDatum = null,
}) {
  const [sheetOpen,         setSheetOpen]         = useState(false)
  const [desktopInfoOpen,   setDesktopInfoOpen]   = useState(false)
  const [shareSheetOpen,    setShareSheetOpen]    = useState(false)
  const [,                  setCopied]            = useState(false)
  const [sharing,           setSharing]           = useState(false)
  const [,                  setImgState]          = useState(null)
  const [showDayComplete,   setShowDayComplete]   = useState(false)
  const [dayFlip,           setDayFlip]           = useState(false)
  // A1: einmaliger mobiler Wisch-Hinweis (Snap-Navigation zwischen Modi entdecken).
  const [showSwipeHint,     setShowSwipeHint]     = useState(false)
  const [swipeHintFade,     setSwipeHintFade]     = useState(false)

  const entriesRef  = useRef(null)
  // Timer-Handles für Banner-Resets, damit ein Unmount sie aufräumen kann.
  const imgStateTimer = useRef(null)
  const copiedTimer   = useRef(null)
  const swipeHintTimer = useRef(null)
  const swipeFadeTimer = useRef(null)

  useEffect(() => {
    return () => {
      if (imgStateTimer.current) clearTimeout(imgStateTimer.current)
      if (copiedTimer.current)   clearTimeout(copiedTimer.current)
      if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current)
      if (swipeFadeTimer.current) clearTimeout(swipeFadeTimer.current)
    }
  }, [])

  // A1: Wisch-Hinweis nur mobil und nur beim allerersten Mal zeigen; nach erster
  // Scroll-Interaktion (oder als Fallback nach 8 s) ausblenden und merken.
  const dismissSwipeHint = useCallback(() => {
    if (swipeHintTimer.current) { clearTimeout(swipeHintTimer.current); swipeHintTimer.current = null }
    lsSet('sig_home_swipe_hint', '1')
    setSwipeHintFade(true)
    swipeFadeTimer.current = setTimeout(() => setShowSwipeHint(false), 400)
  }, [])

  useEffect(() => {
    if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return undefined
    if (lsGet('sig_home_swipe_hint')) return undefined
    setShowSwipeHint(true)
    swipeHintTimer.current = setTimeout(() => dismissSwipeHint(), 8000)
    return () => { if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current) }
  }, [dismissSwipeHint])

  const handleEntriesScroll = useCallback(() => {
    if (showSwipeHint && !swipeHintFade) dismissSwipeHint()
  }, [showSwipeHint, swipeHintFade, dismissSwipeHint])

  const streak     = computeStreak()
  const today      = new Date()
  const dateStr    = localDateStr(today)
  const kw         = getISOWeek(today)
  const hasPlayed  = playedGames.length > 0 || !!wzPlayed || !!zwPlayed || !!lfPlayed

  const totalPoints    = playedGames.reduce((s, g) => s + g.total, 0)
  const maxPoints      = playedGames.length * 10
  const dailyMedal     = allPlayed ? getDailyMedal(totalPoints) : null
  const allThreePlayed = allPlayed && !!wzPlayed && (!zeitenwende || !!zwPlayed) && (!lueckenfuellerLemma?.lueckenfueller || !!lfPlayed)

  useEffect(() => {
    if (!allThreePlayed) return
    const key = `sig_day_complete_${localDateStr(new Date())}`
    if (!lsGet(key)) {
      lsSet(key, '1')
      setShowDayComplete(true)
    }
  }, [allThreePlayed])

  // Tagesübergang: wenn der letzte gesehene Tag != heute, einmaliger Seitenwechsel
  useEffect(() => {
    const lastSeen = lsGet('sig_last_seen_date')
    if (lastSeen && lastSeen !== dateStr) {
      setDayFlip(true)
      const t = setTimeout(() => setDayFlip(false), 360)
      lsSet('sig_last_seen_date', dateStr)
      return () => clearTimeout(t)
    }
    lsSet('sig_last_seen_date', dateStr)
  }, [dateStr])

  const activeCard = useActiveSnapCard(entriesRef)
  const { scrollToCard, handleSnapKeyDown } = useSnapCardNav(entriesRef, activeCard)
  useScrollPersist(entriesRef, 'home')

  async function shareImg() {
    if (sharing) return
    setSharing(true)
    try {
      const result = await shareAsImage(playedGames, wzPlayed, streak, zwPlayed, lfPlayed)
      if (result === 'shared' || result === 'downloaded') {
        setImgState(result)
        if (imgStateTimer.current) clearTimeout(imgStateTimer.current)
        imgStateTimer.current = setTimeout(() => setImgState(null), 2500)
      }
    } catch (err) {
      logError('Home.shareImg', err)
    }
    finally { setSharing(false) }
  }

  async function shareResult() {
    const text = buildShareText(playedGames, wzPlayed, streak, zwPlayed, lfPlayed)
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch {
        // User-Abbruch oder unsupported – fällt auf clipboard-Pfad zurück.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2200)
    } catch (err) {
      logError('Home.shareResult.clipboard', err)
    }
  }

  /* ── CTA-Text & Handler für Kollokationen ─────────────────── */
  const kollCtaText = loading     ? 'Lade …'
                    : allPlayed   ? 'Wörter ansehen'
                    : playedGames.length > 0 ? 'Weiteres Wort spielen'
                    : 'Quiz starten'

  return (
    <>
    <div className={`test-page${dayFlip ? ' test-page-flip--right' : ''}`} lang="de">
      {showDayComplete && (
        <DayComplete
          onClose={() => setShowDayComplete(false)}
          playedGames={playedGames}
          wzPlayed={wzPlayed}
          zwPlayed={zwPlayed}
          lfPlayed={lfPlayed}
          serverDatum={serverDatum}
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

        {/* ── Raster: Thema / Wörter des Tages ────────────── */}
        <nav className="test-raster" aria-label={thema ? 'Thema des Tages' : 'Wörter des Tages'}>
          <span className="test-raster-label" aria-hidden="true">{thema ? 'Thema des Tages' : 'Wörter des Tages'}</span>
          {thema ? (
            <div className="test-raster-thema">{thema}</div>
          ) : (
            <div className="test-raster-words">
              {lemmata.length > 0
                ? lemmata.map(l => <span key={l.id} className="test-raster-word">{l.lemma}</span>)
                : <span className="test-raster-word test-raster-word--empty">—</span>
              }
            </div>
          )}
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

        <main>
          <ol
            className="test-entries"
            aria-label="Spielmodi"
            ref={entriesRef}
            onKeyDown={handleSnapKeyDown}
            onScroll={handleEntriesScroll}
          >

            {/* ── ① Kollokationen ─────────────────────────── */}
            <li className={`test-entry test-drop-cap${allPlayed ? ' test-entry--done' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">①</span>
                <span className="test-entry-marginalia">KOLLOKT.</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span
                    className={`test-dropcap-k${today.getDate() === 1 ? ' test-dropcap-k--ornament' : ''}`}
                    aria-hidden="true"
                  >K</span>
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
            <GameEntry
              glyph="②"
              marginalia="KOMPAR."
              category="komparativ"
              headword="Wort-Zwilling"
              ipa="[ˈvɔʁtˌtsvɪlɪŋ]"
              ipaAriaLabel="Aussprache: [ˈvɔʁtˌtsvɪlɪŋ]"
              definition="Zwei bedeutungsnahe Wörter — zwei unterschiedliche Kollokationsprofile. Ordne zehn Kollokationen dem richtigen Lemma zu."
              available={!!wortzwilling}
              played={wzPlayed}
              playedLabel={wortzwilling ? `${wortzwilling.wortA} / ${wortzwilling.wortB}` : null}
              errorState={wortzwillingError}
              onRetry={onRetryWortzwilling}
              onPlay={onPlayWortzwilling}
              statusText={
                wortzwillingError ? ''
                : !wortzwilling ? 'Heute nicht verfügbar.'
                : wzPlayed ? 'Gespielt.'
                : 'Noch nicht gespielt.'
              }
              ctaText={wzPlayed ? 'Ergebnis ansehen' : 'Wort-Zwilling starten'}
              ctaAriaLabel={wzPlayed ? 'Ergebnis ansehen: Wort-Zwilling' : 'Wort-Zwilling starten'}
            />

            {/* ── ③ Zeitenwende ────────────────────────────── */}
            <GameEntry
              glyph="③"
              marginalia="DIACH."
              category="diachron"
              headword="Zeitenwende"
              ipa="[ˈtsaɪ̯tənˌvɛndə]"
              ipaAriaLabel="Aussprache: [ˈtsaɪ̯tənˌvɛndə]"
              definition="Gehört dieses Wort eher in die Zeit vor oder nach der Jahrtausendwende? Entscheide für zehn Kollokationen eines Lemmas."
              available={!!zeitenwende}
              played={zwPlayed}
              playedLabel={zeitenwende?.lemma ?? null}
              errorState={zeitenwendeError}
              onRetry={onRetryZeitenwende}
              onPlay={onPlayZeitenwende}
              statusText={
                zeitenwendeError ? 'Der Eintrag konnte gerade nicht geladen werden.'
                : zeitenwendeMissing || !zeitenwende ? 'Heute nicht verfügbar.'
                : zwPlayed ? 'Gespielt.'
                : 'Noch nicht gespielt.'
              }
              ctaText={zwPlayed ? 'Ergebnis ansehen' : 'Zeitenwende starten'}
              ctaAriaLabel={zwPlayed ? 'Ergebnis ansehen: Zeitenwende' : 'Zeitenwende starten'}
            />

            {/* ── ④ Lückenfüller ───────────────────────────── */}
            <GameEntry
              glyph="④"
              marginalia="KONSTR."
              category="konstruktiv"
              headword="Lückenfüller"
              ipa="[ˈlʏkənˌfʏlɐ]"
              ipaAriaLabel="Aussprache: [ˈlʏkənˌfʏlɐ]"
              definition="Ein echter Korpussatz mit fehlender Kollokation — welches Wort gehört in die Lücke? Drei Runden, vier Optionen, zehn Punkte."
              available={!!lueckenfuellerLemma?.lueckenfueller}
              played={lfPlayed}
              playedLabel={lueckenfuellerLemma?.lemma ?? null}
              onPlay={onPlayLueckenfueller}
              statusText={
                !lueckenfuellerLemma?.lueckenfueller ? 'Heute nicht verfügbar.'
                : lfPlayed ? 'Gespielt.'
                : 'Noch nicht gespielt.'
              }
              ctaText={lfPlayed ? 'Ergebnis ansehen' : 'Lückenfüller starten'}
              ctaAriaLabel={lfPlayed ? 'Ergebnis ansehen: Lückenfüller' : 'Lückenfüller starten'}
            />

            {/* ── ⑤ Platzhalter (i.V.) ─────────────────────── */}
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
            <KollokationNote footnotesClass="test-footnote-footnotes" />
          </div>
        </section>

        {/* ── Vertikale Badge-Navigation (nur mobil) ───────── */}
        <nav className="snap-nav" aria-label="Spielmodus-Navigation">
          <div className="snap-nav-games">
            {[['①','Kollokationen'],['②','Wort-Zwilling'],['③','Zeitenwende'],['④','Lückenfüller'],['⑤','In Vorbereitung']].map(([glyph, label], i) => (
              <button
                key={label}
                type="button"
                className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
                aria-label={label}
                aria-current={activeCard === i ? 'true' : undefined}
                onClick={() => scrollToCard(i)}
              >{glyph}</button>
            ))}
          </div>
          {allThreePlayed && (
            <button
              className="snap-nav-btn snap-nav-btn--complete"
              type="button"
              onClick={() => setShowDayComplete(true)}
              aria-label="Tagesabschluss ansehen"
            >✦</button>
          )}
          <button
            className="snap-nav-info"
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Was ist eine Kollokation? – Erklärung öffnen"
          >☞</button>
        </nav>

        {/* ── Kompakter Mobile-Footer (nur mobil) ──────────── */}
        <div className="snap-footer">
          <LegalLinks variant="compact" />
          <span className="snap-footer-version">v{__APP_VERSION__}</span>
        </div>

        {/* ── Kolophon ─────────────────────────────────────── */}
        <footer className="test-colophon" role="contentinfo">
          {allThreePlayed ? (
            <button
              className="test-colophon-ornament test-colophon-ornament--link"
              type="button"
              onClick={() => setShowDayComplete(true)}
              aria-label="Tagesabschluss ansehen"
              title="Tagesabschluss ansehen"
            >
              {[playedGames.length > 0, !!wzPlayed, !!zwPlayed, !!lfPlayed].map((played) =>
                played ? '✦' : '·'
              ).join(' ')}
            </button>
          ) : (
            <span className="test-colophon-ornament" aria-hidden="true">
              {[playedGames.length > 0, !!wzPlayed, !!zwPlayed, !!lfPlayed].map((played) =>
                played ? '✦' : '·'
              ).join(' ')}
            </span>
          )}
          <p className="feedback-hint colophon-feedback">
            Fehler oder Anregungen? <a href="mailto:info@signifikation.de">Schreib uns.</a>
          </p>
          <LegalLinks variant="full" />
          <p className="test-colophon-edition">
            v{__APP_VERSION__} · {__BUILD_DATE__}
          </p>
        </footer>

      </div>
    </div>

    {/* ── A1: Mobiler Wisch-Hinweis (einmalig) ──────────────── */}
    {showSwipeHint && (
      <p
        className={`home-swipe-hint${swipeHintFade ? ' home-swipe-hint--fade' : ''}`}
        aria-hidden="true"
      >
        <span className="home-swipe-hint__glyph">↕</span> Wische für weitere Wortspiele
      </p>
    )}

    {/* ── Info Bottom Sheet ────────────────────────────────── */}
    <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} aria-label="Was ist eine Kollokation?">
      <Sheet.Header />
      <div className="info-sheet-header">
        <span className="info-sheet-label" aria-hidden="true">Anm.</span>
        <h2 className="info-sheet-title">Was ist eine Kollokation?</h2>
        <button className="info-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Schließen">✕</button>
      </div>
      <Sheet.Body>
        <div className="info-sheet-body">
          <KollokationNote footnotesClass="info-sheet-footnotes" />
        </div>
      </Sheet.Body>
    </Sheet>

    {/* ── Share Bottom Sheet ───────────────────────────────── */}
    <Sheet open={shareSheetOpen} onClose={() => setShareSheetOpen(false)} aria-label="Ergebnis mitteilen">
      <Sheet.Header />
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
    </Sheet>
    </>
  )
}

// memo: Home ist der groesste Screen — Re-Render nur bei echten Prop-Aenderungen (F-M2)
export default memo(Home)
