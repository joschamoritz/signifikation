// Klassenraum-Index — die Landing-Ansicht des Lehrer-Tabs.
//
// Wörterbuch-Index des Klassenraum-Modus (analog zur Spielmodi-Startseite):
// vier Einträge mit fester Funktion, nicht eine Liste gespielter Sessions.
//   ① Anleitung  — Unterseite „So funktioniert der Klassenraum" (STEPS.HOWTO)
//   ② Sessions   — Session-Verwaltung (STEPS.LIST)
//   ③ Beitritt   — Unterseite „So treten Schüler bei" (STEPS.JOIN)
//   ④ Vorbereiten — Teaser (in Vorbereitung), bewusst deaktiviert
//
// Jeder aktive Eintrag öffnet — wie ein Modus-Klick auf der Spielmodi-Seite —
// eine Vollbild-Unterseite (kein Bottom-Sheet). Reine Navigation/Info.

import { useRef, useCallback } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'
import { useActiveSnapCard } from '../../../../hooks/useActiveSnapCard'

// Badge-Navigation (mobil, links): identisch zur Spielmodi-Startseite.
const SNAP_NAV = [['①', 'Anleitung'], ['②', 'Sessions'], ['③', 'Beitritt'], ['④', 'Vorbereiten']]

export default function ClassroomIndexStep() {
  const { dispatch } = useTeacherClassroom()
  const { sessions, loading } = useSessionsList({ limit: 50 })

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

        {/* ① Anleitung ─────────────────────────────────────── */}
        <li className="test-entry test-drop-cap">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">①</span>
            <span className="test-entry-marginalia">INFO</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <span className="test-dropcap-k" aria-hidden="true">A</span>
              <h2 className="test-headword" aria-label="Anleitung">nleitung</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈanlaɪ̯tʊŋ]">[ˈanlaɪ̯tʊŋ]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Klassenraum</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Überblick</span>
            </div>
            <p className="test-definition">
              Was ist der Klassenraum? Eine Live-Stunde in drei Schritten:
              Session anlegen, Code an die Klasse, gemeinsam spielen und auswerten.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">Immer verfügbar.</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => dispatch({ type: 'GO_TO_HOWTO' })}
                data-testid="classroom-index-how"
              >
                So funktioniert's
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

        {/* ② Sessions ──────────────────────────────────────── */}
        <li className="test-entry test-drop-cap">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">②</span>
            <span className="test-entry-marginalia">LIVE</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Sessions</h2>
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

        {/* ③ Beitritt ──────────────────────────────────────── */}
        <li className="test-entry test-drop-cap">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">③</span>
            <span className="test-entry-marginalia">ZUGANG</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Beitritt</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈbaɪ̯tʁɪt]">[ˈbaɪ̯tʁɪt]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Schüler</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Zugang</span>
            </div>
            <p className="test-definition">
              Wie kommt die Klasse rein? Über einen kurzen Code oder den
              QR-Code — ohne Anmeldung, ohne Konto, direkt im Browser.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">Code &amp; QR.</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => dispatch({ type: 'GO_TO_JOIN' })}
                data-testid="classroom-index-join"
              >
                So treten Schüler bei
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

        {/* ④ Vorbereiten ───────────────────────────────────── */}
        <li className="test-entry classroom-entry--disabled">
          <div className="test-entry-number">
            <span className="test-entry-num-glyph">④</span>
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
      </nav>
    </>
  )
}
