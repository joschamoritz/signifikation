// Klassenraum-Index — die Landing-Ansicht des Lehrer-Tabs.
//
// Wörterbuch-Index des Klassenraum-Modus (analog zur Spielmodi-Startseite).
// Variante A (2026-06-13): Die fruheren reinen Textkarten „Anleitung" und
// „Beitritt" sind keine eigenen Index-Eintraege mehr — ihr Inhalt liegt jetzt
// als Anmerkung unten (Desktop-Fußnote) bzw. hinter der Manicula ☞ (Mobile),
// exakt wie „Was ist eine Kollokation?" auf der Spielmodi-Startseite. Dadurch
// bleiben die Prime-Slots fuer das, was zaehlt:
//   ① Sessions   — Session-Verwaltung (STEPS.LIST)
//   ② Vorbereiten — Teaser (in Vorbereitung), bewusst deaktiviert
//
// Jeder aktive Eintrag öffnet — wie ein Modus-Klick auf der Spielmodi-Seite —
// eine Vollbild-Unterseite (kein Bottom-Sheet).

import { useRef, useState, useCallback } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'
import { useActiveSnapCard } from '../../../../hooks/useActiveSnapCard'
import Sheet from '../../../ui/Sheet'
import ClassroomHowItWorksNote from '../components/ClassroomHowItWorksNote'

// Badge-Navigation (mobil, links): identisch zur Spielmodi-Startseite.
const SNAP_NAV = [['①', 'Sessions'], ['②', 'Vorbereiten']]

export default function ClassroomIndexStep() {
  const { dispatch } = useTeacherClassroom()
  const { sessions, loading } = useSessionsList({ limit: 50 })

  const [sheetOpen,       setSheetOpen]       = useState(false)
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false)

  // Scroll-Snap-Navigation wie Home (test-entries + snap-nav).
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)
  const scrollToCard = useCallback((i) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const sessionCount = sessions.length
  const sessionStatus = loading
    ? 'Wird geladen …'
    : sessionCount === 0
      ? 'Noch keine Session angelegt.'
      : `${sessionCount} ${sessionCount === 1 ? 'Session' : 'Sessions'} angelegt.`

  return (
    <>
      <main>
      <ol className="test-entries" aria-label="Klassenraum" ref={entriesRef} data-testid="classroom-index">

        {/* ① Sessions ──────────────────────────────────────── */}
        <li className="test-entry test-drop-cap">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">①</span>
            <span className="test-entry-marginalia">LIVE</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <span className="test-dropcap-k" aria-hidden="true">S</span>
              <h2 className="test-headword" aria-label="Sessions">essions</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈsɛʃn̩s]">[ˈsɛʃn̩s]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Verwaltung</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Live-Stunde</span>
            </div>
            <p className="test-definition">
              Lege eine neue Live-Session an oder setze eine laufende fort —
              ein Modus, ein Lemma, ein Beitrittscode für die ganze Klasse.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">{sessionStatus}</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => dispatch({ type: 'GO_TO_LIST' })}
                data-testid="classroom-index-sessions"
              >
                Sessions verwalten
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

        {/* ② Vorbereiten ───────────────────────────────────── */}
        <li className="test-entry classroom-entry--disabled">
          <div className="test-entry-number">
            <span className="test-entry-num-glyph">②</span>
            <span className="test-entry-marginalia">PLAN</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Vorbereiten</h2>
              <span className="test-ipa">[ˈfoːɐ̯bəˌʁaɪ̯tn̩]</span>
            </div>
            <div className="test-entry-grammar">
              <span className="test-pos">Planung</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">in Arbeit</span>
            </div>
            <p className="test-definition">
              Sessions im Voraus zusammenstellen und für die nächste Stunde
              bereithalten — geplant für eine spätere Auflage.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">Demnächst verfügbar.</span>
              <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
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
