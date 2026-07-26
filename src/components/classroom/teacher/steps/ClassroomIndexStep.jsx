// Klassenraum-Index — die Landing-Ansicht des Lehrer-Tabs.
//
// Wörterbuch-Index des Klassenraum-Modus (analog zur Spielmodi-Startseite).
// Variante A (2026-06-13): Die fruheren reinen Textkarten „Anleitung“ und
// „Beitritt“ sind keine eigenen Index-Eintraege mehr — ihr Inhalt liegt jetzt
// als Anmerkung unten (Desktop-Fußnote) bzw. hinter der Manicula ☞ (Mobile),
// exakt wie „Was ist eine Kollokation?“ auf der Spielmodi-Startseite. Dadurch
// bleiben die Prime-Slots fuer das, was zaehlt:
//   ① Beitreten — selbst einer Sitzung beitreten (Route /c), auch für
//                 Lehrkräfte (Ausprobieren / mit Kolleg:innen mitspielen)
//   ② Sitzungen  — Session-Verwaltung (STEPS.LIST)
//
// Einheitliche Tab-IA: Nicht-Premium sieht dieselben Slots — ① Beitreten +
// ② Sitzungen (dort die login-freie Lehrer-Demo). „Vorbereiten“ entfiel
// (verlustfrei: „Neue Sitzung“ aus der Liste + zurück = wartende Lobby).

import { useRef, useState, useCallback } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'
import { useActiveSnapCard } from '../../../../hooks/useActiveSnapCard'
import { useSwipeHint } from '../../../../hooks/useSwipeHint'
import { lsGet, lsSet } from '../../../../utils/storage'
import Sheet from '../../../ui/Sheet'
import ClassroomHowItWorksNote from '../components/ClassroomHowItWorksNote'
import JoinCodeForm from '../../student/JoinCodeForm'
import '../../student/KioskShell.css'

const FIRSTRUN_HINT_KEY = 'sig_classroom_firstrun_hint'

// Badge-Navigation (mobil, links): identisch zur Spielmodi-Startseite.
const SNAP_NAV = [['①', 'Beitreten'], ['②', 'Sitzungen']]

export default function ClassroomIndexStep() {
  const { dispatch } = useTeacherClassroom()
  const { sessions, loading } = useSessionsList({ limit: 50 })

  const [sheetOpen,       setSheetOpen]       = useState(false)
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false)
  // Erstnutzer-Hinweis: einmalig, nur solange keine Sitzung existiert.
  const [hintDismissed, setHintDismissed] = useState(() => !!lsGet(FIRSTRUN_HINT_KEY))
  const dismissHint = useCallback(() => { lsSet(FIRSTRUN_HINT_KEY, '1'); setHintDismissed(true) }, [])

  // Scroll-Snap-Navigation wie Home (test-entries + snap-nav).
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)
  const scrollToCard = useCallback((i) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  const { show: showSwipeHint, fade: swipeHintFade, onInteract: handleEntriesScroll } = useSwipeHint('klassenraum-teacher')

  const sessionCount = sessions.length
  const sessionStatus = loading
    ? 'Wird geladen …'
    : sessionCount === 0
      ? 'Noch keine Sitzung angelegt.'
      : `${sessionCount} ${sessionCount === 1 ? 'Sitzung' : 'Sitzungen'} angelegt.`

  return (
    <>
      {!loading && sessionCount === 0 && !hintDismissed && (
        <aside className="classroom-firstrun" role="note" data-testid="classroom-firstrun">
          <div className="classroom-firstrun__body">
            <span className="classroom-firstrun__label" aria-hidden="true">Neu hier?</span>
            <p className="classroom-firstrun__text">
              Starte deine erste Live-Sitzung in Sekunden — mit den Wörtern von heute.
            </p>
            <button
              type="button"
              className="test-cta classroom-firstrun__cta"
              onClick={() => { dismissHint(); dispatch({ type: 'GO_TO_LIST' }) }}
              data-testid="classroom-firstrun-start"
            >
              Erste Sitzung starten
              <span className="test-cta-arrow" aria-hidden="true"> →</span>
            </button>
          </div>
          <button
            type="button"
            className="classroom-firstrun__close"
            onClick={dismissHint}
            aria-label="Hinweis schließen"
          >✕</button>
        </aside>
      )}

      <main>
      <ol className="test-entries" aria-label="Klassenraum" ref={entriesRef} data-testid="classroom-index" onScroll={handleEntriesScroll}>

        {/* ① Beitreten — auch Lehrkräfte können selbst mitspielen ─ */}
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
              <span className="test-pos">Mitspielen</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Zugang</span>
            </div>
            <p className="test-definition">
              Tritt selbst einer Sitzung bei — zum Ausprobieren oder mit
              Kolleg:innen. Code eingeben oder QR scannen.
            </p>
            <div className="classroom-student-entry__form">
              <JoinCodeForm scanButtonClassName="test-cta classroom-student-entry__scan" />
            </div>
          </div>
        </li>

        {/* ② Sitzungen ──────────────────────────────────────── */}
        <li className="test-entry">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">②</span>
            <span className="test-entry-marginalia">LIVE</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Sitzungen</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈzɪtsʊŋən]">[ˈzɪtsʊŋən]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Verwaltung</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Live-Stunde</span>
            </div>
            <p className="test-definition">
              Lege eine neue Live-Sitzung an oder setze eine laufende fort —
              Modus, Wörter, ein Zugangscode für die ganze Klasse.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">{sessionStatus}</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => dispatch({ type: 'GO_TO_LIST' })}
                data-testid="classroom-index-sessions"
              >
                Sitzungen verwalten
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

      </ol>
      </main>

      {/* ── Anmerkung: nur Desktop (mobil via ☞ Bottom Sheet) ── */}
      <section className="test-footnote desktop-footnote" aria-label="Anmerkung: So funktioniert der Klassenraum">
        <button
          className="test-footnote-toggle"
          type="button"
          onClick={() => setDesktopInfoOpen(v => !v)}
          aria-expanded={desktopInfoOpen}
          aria-controls="desktop-classroom-note"
        >
          <span className="test-footnote-label" aria-hidden="true">Anm.</span>
          <span className="test-footnote-title">So funktioniert der Klassenraum</span>
          <span className="test-footnote-chevron" aria-hidden="true">▾</span>
        </button>
        <div
          id="desktop-classroom-note"
          className={`test-footnote-body${desktopInfoOpen ? ' open' : ''}`}
          role="region"
        >
          <ClassroomHowItWorksNote />
        </div>
      </section>

      {/* Vertikale Badge-Navigation (nur mobil) — wie die Spielmodi-Startseite. */}
      <nav className="snap-nav" aria-label="Klassenraum-Navigation">
        <div className="snap-nav-games">
          {SNAP_NAV.map(([glyph, label], i) => (
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
          aria-label="So funktioniert der Klassenraum – Erklärung öffnen"
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
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} aria-label="So funktioniert der Klassenraum">
        <Sheet.Header />
        <div className="info-sheet-header">
          <span className="info-sheet-label" aria-hidden="true">Anm.</span>
          <h2 className="info-sheet-title">So funktioniert der Klassenraum</h2>
          <button className="info-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Schließen">✕</button>
        </div>
        <Sheet.Body>
          <div className="info-sheet-body">
            <ClassroomHowItWorksNote />
          </div>
        </Sheet.Body>
      </Sheet>
    </>
  )
}
