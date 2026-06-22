import { memo, useRef, useCallback, useState } from 'react'
import TabHeader from './TabHeader'
import Sheet from './ui/Sheet'
import KursNote from './KursNote'
import { useActiveSnapCard } from '../hooks/useActiveSnapCard'
import { useScrollPersist } from '../hooks/useScrollPersist'
import StationDetail from './course/StationDetail'
import { useCourseStation, openCourseStation, closeCourseStation } from './course/courseRouting'
import '../styles/course.css'

// Lernpfad-Stationen laut Kurs-Tab-IA.md (Ebene 1). `apiId` mappt auf die
// course_stations-Zeile (Backend-Inhalt). Alle fünf Stationen haben seit AP10
// interaktiven Content und öffnen die Detailansicht; Druckmaterial für ②–⑤
// folgt (AP20), die „Üben"-Aufgaben sind aber vollständig.
const KURS_MODULES = [
  {
    id: 'wortpartner',
    apiId: 's1',
    glyph: '①',
    marginalia: 'KOLLO.',
    title: 'Wortpartner & Kollokationen',
    ipa: '[kɔlokaˈt͡si̯oːn]',
    category: 'Lexikologie',
    definition: 'Für ein Lemma die typischen Wortpartner schätzen, Häufigkeit von Typikalität trennen und mit dem Korpus abgleichen.',
  },
  {
    id: 'funktion',
    apiId: 's2',
    glyph: '②',
    marginalia: 'SYNT.',
    title: 'Wörter mit Funktion',
    ipa: '[ˈvœʁtɐ mɪt fʊŋkˈtsi̯oːn]',
    category: 'Syntax',
    definition: 'Subjekt, Objekt und Prädikativ verstehen — Wörter über ihre Funktion im Satz erkennen.',
  },
  {
    id: 'dependenz',
    apiId: 's3',
    glyph: '③',
    marginalia: 'DEP.',
    title: 'Wer hängt an wem?',
    ipa: '[ˈveːɐ̯ hɛŋt an veːm]',
    category: 'Syntax',
    definition: 'Grammatische Abhängigkeiten lesen: welche Wörter regieren welche — Dependenzen im Satz erkennen.',
  },
  {
    id: 'korpus',
    apiId: 's4',
    glyph: '④',
    marginalia: 'TEOR.',
    title: 'Texte, die zählen',
    ipa: '[ˈtɛkstə diː ˈtsɛːlən]',
    category: 'Theorie',
    definition: 'Wie entstehen Textkorpora? Repräsentativität, automatische Annotation und die Grenzen der Methode.',
  },
  {
    id: 'recherche',
    apiId: 's5',
    glyph: '⑤',
    marginalia: 'ANWND.',
    title: 'Belegen statt raten',
    ipa: '[bəˈleːɡən ʃtat ˈʁaːtn̩]',
    category: 'Anwendung',
    definition: 'Eigene Fragestellung in einem kleinen Beispielkorpus — eine Behauptung am echten Beleg prüfen.',
  },
]

function KursTab({ gesamtausgabe = false, onNavigateToKonto }) {
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)
  useScrollPersist(entriesRef, 'kurs')

  // Anm./Manicula („Was ist der Kurs?") — Einheitlichkeit mit Spielmodi & Klassenraum.
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const stationId = useCourseStation()

  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const openStation = useCallback((mod) => {
    if (!mod.apiId) return
    if (!gesamtausgabe) { onNavigateToKonto?.(); return }
    openCourseStation(mod.apiId)
  }, [gesamtausgabe, onNavigateToKonto])

  // Ebene 2: Station-Detail, sobald ein Stations-Hash gesetzt ist.
  if (stationId) {
    return (
      <StationDetail
        stationId={stationId}
        onBack={closeCourseStation}
        onNavigateToKonto={onNavigateToKonto}
      />
    )
  }

  return (
    <div className="test-page kurs-tab">
      <div className="test-wrapper">
        <TabHeader />

        <nav className="test-raster" aria-label="Kurs-Übersicht">
          <span className="test-raster-label" aria-hidden="true">Kurs</span>
          <div className="test-raster-words">
            <span className="test-raster-word">Didaktischer Lernpfad</span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">
              {gesamtausgabe ? 'Freigeschaltet' : 'Basis'}
            </span>
          </div>
        </nav>

        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Kurs-Module" ref={entriesRef}>

            {KURS_MODULES.map((mod) => {
              const active = !!mod.apiId
              return (
                <li
                  key={mod.id}
                  className={`test-entry${active ? '' : ' test-entry--disabled'}`}
                >
                  <div className="test-entry-number" aria-hidden="true">
                    <span className="test-entry-num-glyph">{mod.glyph}</span>
                    <span className="test-entry-marginalia">{mod.marginalia}</span>
                  </div>
                  <div className="test-entry-body">
                    <div className="test-entry-head">
                      <h2 className="test-headword">{mod.title}</h2>
                      <span className="test-ipa" aria-label={`Aussprache: ${mod.ipa}`}>{mod.ipa}</span>
                    </div>
                    <div className="test-entry-grammar" aria-hidden="true">
                      <span className="test-pos">Station</span>
                      <span className="test-pos-rule" />
                      <span className="test-entry-category">{mod.category}</span>
                    </div>
                    <p className="test-definition">{mod.definition}</p>

                    <div className="test-entry-footer">
                      {active ? (
                        <>
                          <span className="test-status">
                            {gesamtausgabe ? 'Bereit.' : 'Teil der Gesamtausgabe.'}
                          </span>
                          <button
                            type="button"
                            className="test-cta"
                            onClick={() => openStation(mod)}
                          >
                            {gesamtausgabe ? 'Öffnen' : 'Freischalten'}
                            <span className="test-cta-arrow" aria-hidden="true">›</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="test-status">In Entwicklung.</span>
                          <span className="test-cta test-cta--disabled" aria-hidden="true">
                            Bald verfügbar
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}

          </ol>

          {/* ── Anmerkung: nur Desktop (mobil via ☞ Bottom Sheet) ── */}
          <section className="test-footnote desktop-footnote" aria-label="Anmerkung: Was ist der Kurs?">
            <button
              className="test-footnote-toggle"
              type="button"
              onClick={() => setDesktopInfoOpen(v => !v)}
              aria-expanded={desktopInfoOpen}
              aria-controls="desktop-kurs-note"
            >
              <span className="test-footnote-label" aria-hidden="true">Anm.</span>
              <span className="test-footnote-title">Was ist der Kurs? Und die Niveaustufen?</span>
              <span className="test-footnote-chevron" aria-hidden="true">▾</span>
            </button>
            <div
              id="desktop-kurs-note"
              className={`test-footnote-body${desktopInfoOpen ? ' open' : ''}`}
              role="region"
            >
              <KursNote footnotesClass="test-footnote-footnotes" />
            </div>
          </section>

          {/* ── Vertikale Badge-Navigation (nur mobil) ───────── */}
          <nav className="snap-nav" aria-label="Kurs-Navigation">
            <div className="snap-nav-games">
              {KURS_MODULES.map((mod, i) => (
                <button
                  key={mod.id}
                  className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
                  aria-label={`Station ${i + 1}: ${mod.title}`}
                  aria-current={activeCard === i ? 'true' : undefined}
                  onClick={() => scrollToCard(i)}
                >{mod.glyph}</button>
              ))}
            </div>
            <button
              className="snap-nav-info"
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label="Was ist der Kurs? – Erklärung öffnen"
            >☞</button>
            <div className="snap-nav-spacer" aria-hidden="true" />
          </nav>
        </main>
      </div>

      {/* ── Info Bottom Sheet (mobil) ───────────────────────── */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} aria-label="Was ist der Kurs?">
        <Sheet.Header />
        <div className="info-sheet-header">
          <span className="info-sheet-label" aria-hidden="true">Anm.</span>
          <h2 className="info-sheet-title">Was ist der Kurs?</h2>
          <button className="info-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Schließen">✕</button>
        </div>
        <Sheet.Body>
          <div className="info-sheet-body">
            <KursNote footnotesClass="info-sheet-footnotes" />
          </div>
        </Sheet.Body>
      </Sheet>
    </div>
  )
}

export default memo(KursTab)
