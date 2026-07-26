// T-5.2 / F5 — S1 Code-Eingabe (Schueler-Einstieg).
//
// Eine einfache Code-Eingabe (keine Slots, weil D16-Decision die Wortliste
// behält — Wörter zwischen 4 und 10 Buchstaben). Paste-Support: alles, was
// nicht a-z0-9- ist, wird gefiltert; Groß-/Kleinschreibung wird normalisiert.
//
// Ein Submit fuehrt KEIN /join aus — das passiert erst in NameState mit
// dem dann ebenfalls gewünschten Namen. Hier nur Routing nach /c/:code.
//
// Zwei Erscheinungsformen:
//   • Vollroute /c → KioskShell-Vollbild (das schlichte Panel `inner`).
//   • embedded (Klassenraum-Tab) → Wörterbuch-Index im test-entry-Karten-
//     Design, analog zum Lehrer-Index: ① Beitreten (Code/QR), ② Fortsetzen
//     (nur wenn eine Sitzung in sessionStorage liegt), plus die Anmerkung
//     „Was ist der Klassenraum?" (Desktop-Fußnote / Mobile-Manicula ☞).

import { useState, useRef, useCallback, lazy, Suspense } from 'react'
import { navigate } from '../routing'
import KioskShell from './KioskShell'
import TabHeader from '../../TabHeader'
import Sheet from '../../ui/Sheet'
import JoinCodeForm from './JoinCodeForm'
import { useActiveSnapCard } from '../../../hooks/useActiveSnapCard'
import { useSwipeHint } from '../../../hooks/useSwipeHint'
import { peekKioskSession } from './hooks/useStudentSession'
import ClassroomStudentNote from './ClassroomStudentNote'

const ClassroomTeacherDemo = lazy(() => import('../teacher/demo/ClassroomTeacherDemo'))

export default function StudentJoinEntry({ initialNotice = null, embedded = false, onNavigateToKonto = null }) {
  // Fehlerhinweis: explizit übergebener initialNotice (Tests) ODER ein von
  // NameState bei ungültigem Code hinterlegter, transienter sessionStorage-
  // Hinweis (einmalig lesen + löschen, damit er nach Reload nicht klebt).
  const [initialError] = useState(() => {
    if (initialNotice) return initialNotice
    try {
      const n = sessionStorage.getItem('classroom:joinNotice')
      if (n) { sessionStorage.removeItem('classroom:joinNotice'); return n }
    } catch {}
    return null
  })
  // Deep-Link von der Lehrer-Landingpage: /?tab=klassenraum&demo=1 öffnet die
  // login-freie Vorschau direkt (nur in der eingebetteten Tab-Ansicht).
  const [showDemo, setShowDemo] = useState(() => {
    if (!embedded || typeof window === 'undefined') return false
    try { return new URLSearchParams(window.location.search).get('demo') === '1' } catch { return false }
  })

  // Persistierte Sitzung einmalig beim Mount lesen (für die „Fortsetzen"-Karte).
  const [resume] = useState(() => (embedded ? peekKioskSession() : null))

  // Anmerkung „Was ist der Klassenraum?" — Desktop-Fußnote + Mobile-Sheet.
  const [sheetOpen,       setSheetOpen]       = useState(false)
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false)

  // Snap-Navigation (mobil) wie auf der Spielmodi-/Lehrer-Startseite.
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)
  const scrollToCard = useCallback((i) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  const { show: showSwipeHint, fade: swipeHintFade, onInteract: handleEntriesScroll } = useSwipeHint('klassenraum-student', embedded)

  // Login-freie Lehrer-Vorschau (② Sitzungen in der Nicht-Premium-Ansicht).
  if (showDemo) {
    return (
      <Suspense fallback={null}>
        <ClassroomTeacherDemo
          onBack={() => setShowDemo(false)}
          onGoPremium={onNavigateToKonto || undefined}
        />
      </Suspense>
    )
  }

  // Schlichtes Panel — Vollroute /c (KioskShell-Vollbild).
  const inner = (
    <div className="classroom-kiosk__panel">
      <p className="classroom-kiosk__overline">Live-Sitzung · Beitreten</p>
      <h1 className="classroom-kiosk__title">Klassenraum</h1>
      <p className="classroom-kiosk__lead">
        Tipp den Zugangscode deiner Lehrkraft ein — oder scanne den QR-Code.
      </p>
      <JoinCodeForm initialError={initialError} />
    </div>
  )

  if (!embedded) {
    return <KioskShell confirmExit={false}>{inner}</KioskShell>
  }

  // Eingebettet im Klassenraum-Tab → Wörterbuch-Index. test-page liefert die
  // --t-*-Tokens + das Mobil-Layout des geteilten Headers; classroom-kiosk die
  // --k-*-Tokens für das Code-Feld; classroom-student-entry mappt --t-* aus --*.
  const snapNav = resume
    ? [['①', 'Beitreten'], ['②', 'Sitzungen'], ['③', 'Fortsetzen']]
    : [['①', 'Beitreten'], ['②', 'Sitzungen']]

  return (
    <div className="classroom-kiosk test-page classroom-student-entry" data-testid="classroom-student-tab">
      <div className="test-wrapper">
        <TabHeader />
        <nav className="test-raster" aria-label="Klassenraum">
          <span className="test-raster-label" aria-hidden="true">Klassenraum</span>
          <div className="test-raster-words">
            <span className="test-raster-word">Live-Sitzung beitreten</span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">Schüler:in</span>
          </div>
        </nav>
        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Klassenraum" ref={entriesRef} data-testid="classroom-student-index" onScroll={handleEntriesScroll}>

            {/* ① Beitreten ─────────────────────────────────────── */}
            <li className="test-entry test-drop-cap">
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">①</span>
                <span className="test-entry-marginalia">CODE</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span className="test-dropcap-k" aria-hidden="true">B</span>
                  <h2 className="test-headword" aria-label="Beitreten">eitreten</h2>
                  <span className="test-ipa" aria-label="Aussprache: [ˈbaɪ̯tʁeːtn̩]">[ˈbaɪ̯tʁeːtn̩]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Schüler:in</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">Zugang</span>
                </div>
                <p className="test-definition">
                  Tipp den Zugangscode deiner Lehrkraft ein — oder scanne den QR-Code.
                </p>

                <div className="classroom-student-entry__form">
                  <JoinCodeForm initialError={initialError} scanButtonClassName="test-cta classroom-student-entry__scan" />
                </div>
              </div>
            </li>

            {/* ② Sitzungen → login-freie Lehrer-Vorschau ─────────── */}
            <li className="test-entry">
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">②</span>
                <span className="test-entry-marginalia">VORSCHAU</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <h2 className="test-headword">Sitzungen</h2>
                  <span className="test-ipa" aria-label="Aussprache: [ˈzɪtsʊŋən]">[ˈzɪtsʊŋən]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Lehrkraft</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">Vorschau</span>
                </div>
                <p className="test-definition">
                  Du leitest eine Klasse? Sieh dir an, wie eine Live-Sitzung
                  abläuft — Modus, Schüleransicht, Beitritt — ganz ohne Login.
                </p>
                <div className="test-entry-footer">
                  <span className="test-status">Ohne Anmeldung.</span>
                  <button
                    type="button"
                    className="test-cta"
                    onClick={() => setShowDemo(true)}
                    data-testid="classroom-student-demo-open"
                  >
                    Vorschau ansehen
                    <span className="test-cta-arrow" aria-hidden="true"> →</span>
                  </button>
                </div>
              </div>
            </li>

            {/* ③ Fortsetzen ────────────────────── (nur bei aktiver Sitzung) */}
            {resume && (
              <li className="test-entry test-drop-cap">
                <div className="test-entry-number" aria-hidden="true">
                  <span className="test-entry-num-glyph">③</span>
                  <span className="test-entry-marginalia">LIVE</span>
                </div>
                <div className="test-entry-body">
                  <div className="test-entry-head">
                    <h2 className="test-headword">Fortsetzen</h2>
                    <span className="test-ipa" aria-label="Aussprache: [ˈfɔʁtˌzɛtsn̩]">[ˈfɔʁtˌzɛtsn̩]</span>
                  </div>
                  <div className="test-entry-grammar" aria-hidden="true">
                    <span className="test-pos">Sitzung</span>
                    <span className="test-pos-rule" />
                    <span className="test-entry-category">aktiv</span>
                  </div>
                  <p className="test-definition">
                    Du bist noch in einer Sitzung{resume.displayName ? ` als „${resume.displayName}“` : ''} —
                    kehre zurück und spiel weiter.
                  </p>
                  <div className="test-entry-footer">
                    <span className="test-status">Code {String(resume.code).toUpperCase()}</span>
                    <button
                      type="button"
                      className="test-cta"
                      onClick={() => navigate(`/c/${encodeURIComponent(resume.code)}`)}
                      data-testid="classroom-student-resume"
                    >
                      Zurück in deine Sitzung
                      <span className="test-cta-arrow" aria-hidden="true"> →</span>
                    </button>
                  </div>
                </div>
              </li>
            )}

          </ol>
        </main>

        {/* ── Anmerkung: nur Desktop (mobil via ☞ Bottom Sheet) ── */}
        <section className="test-footnote desktop-footnote" aria-label="Anmerkung: Was ist der Klassenraum?">
          <button
            className="test-footnote-toggle"
            type="button"
            onClick={() => setDesktopInfoOpen(v => !v)}
            aria-expanded={desktopInfoOpen}
            aria-controls="desktop-student-note"
          >
            <span className="test-footnote-label" aria-hidden="true">Anm.</span>
            <span className="test-footnote-title">Was ist der Klassenraum?</span>
            <span className="test-footnote-chevron" aria-hidden="true">▾</span>
          </button>
          <div
            id="desktop-student-note"
            className={`test-footnote-body${desktopInfoOpen ? ' open' : ''}`}
            role="region"
          >
            <ClassroomStudentNote />
          </div>
        </section>

        {/* Vertikale Badge-Navigation + Manicula (nur mobil). */}
        <nav className="snap-nav" aria-label="Klassenraum-Navigation">
          <div className="snap-nav-games">
            {snapNav.map(([glyph, label], i) => (
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
          <button
            className="snap-nav-info"
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Was ist der Klassenraum? – Erklärung öffnen"
          >☞</button>
        </nav>

        {/* ── Mobiler Bedienhinweis (einmal pro Sitzung) ──────────── */}
        {showSwipeHint && (
          <p
            className={`swipe-hint${swipeHintFade ? ' swipe-hint--fade' : ''}`}
            aria-hidden="true"
          >
            <span className="swipe-hint__glyph">↕</span> Weitere Karten wischen
            {' · '}
            <span className="swipe-hint__glyph">☞</span> so funktioniert&apos;s
          </p>
        )}

        {/* ── Info Bottom Sheet (nur mobil erreichbar) ─────────── */}
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} aria-label="Was ist der Klassenraum?">
          <Sheet.Header />
          <div className="info-sheet-header">
            <span className="info-sheet-label" aria-hidden="true">Anm.</span>
            <h2 className="info-sheet-title">Was ist der Klassenraum?</h2>
            <button className="info-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Schließen">✕</button>
          </div>
          <Sheet.Body>
            <div className="info-sheet-body">
              <ClassroomStudentNote />
            </div>
          </Sheet.Body>
        </Sheet>
      </div>
    </div>
  )
}
