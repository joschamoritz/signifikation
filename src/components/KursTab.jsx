import { memo, useRef, useCallback, useState, useEffect } from 'react'
import TabHeader from './TabHeader'
import Sheet from './ui/Sheet'
import KursNote from './KursNote'
import Colophon from './Colophon'
import { useActiveSnapCard } from '../hooks/useActiveSnapCard'
import { useSnapCardNav } from '../hooks/useSnapCardNav'
import { useScrollPersist } from '../hooks/useScrollPersist'
import StationDetail from './course/StationDetail'
import { useCourseStation, openCourseStation, closeCourseStation } from './course/courseRouting'
import { useGlobalNiveau, NIVEAU_LABELS } from './course/useGlobalNiveau'
import { apiGet } from '../api/client'
import { API } from '../config'
import '../styles/course.css'

// Lernpfad-Stationen laut Kurs-Tab-IA.md (Ebene 1). `apiId` mappt auf die
// course_stations-Zeile (Backend-Inhalt). Alle fünf Stationen haben seit AP10
// interaktiven Content und öffnen die Detailansicht; Druckmaterial für ②–⑤
// folgt (AP20), die „Üben"-Aufgaben sind aber vollständig.
// Exportiert für den Konsistenz-Test (K3): die Reihenfolge hier bestimmt die
// "Weiter zur nächsten Station"-Sprünge (NextStationCta in StationDetail.jsx),
// der dort angezeigte Glyph kommt aber aus dem Server-order_no. Beide Quellen
// müssen übereinstimmen — s. KursTab.orderConsistency.test.js.
export const KURS_MODULES = [
  {
    id: 'wortpartner',
    apiId: 's1',
    glyph: '①',
    marginalia: 'KOLLO.',
    title: 'Wortpartner & Kollokationen',
    ipa: '[kɔlokaˈt͡si̯oːn]',
    category: 'Lexikologie',
    definition: 'Für ein Wort die typischen Wortpartner schätzen, häufige von typischen Verbindungen trennen und am Korpus prüfen.',
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

function KursTab({ gesamtausgabe = false, loggedIn = false, onNavigateToKonto }) {
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)
  const { scrollToCard, handleSnapKeyDown } = useSnapCardNav(entriesRef, activeCard)
  useScrollPersist(entriesRef, 'kurs')

  // Anm./Manicula („Was ist der Kurs?") — Einheitlichkeit mit Spielmodi & Klassenraum.
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const stationId = useCourseStation()
  const [niveau] = useGlobalNiveau()

  // Stations-Fortschritt (gelöst/gesamt je Niveau) für die Übersicht. Üben ist
  // frei → für jeden eingeloggten Nutzer laden; best effort (optional).
  const [summary, setSummary] = useState([])
  // Verhindert, dass vor der ersten Antwort überall „Bereit." statt der
  // geladenen Fortschrittszahl steht (sichtbares Nachspringen bei Stammnutzern).
  const [summaryReady, setSummaryReady] = useState(false)
  useEffect(() => {
    if (!loggedIn) { setSummary([]); setSummaryReady(true); return undefined }
    // Die Übersicht ist nur bei geschlossener Station sichtbar. Während eine
    // Station offen ist, nicht laden — beim Zurückkehren (stationId → null)
    // feuert der Effekt erneut und holt den aktualisierten Fortschritt.
    if (stationId) return undefined
    let cancelled = false
    const controller = new AbortController()
    setSummaryReady(false)
    ;(async () => {
      try {
        const json = await apiGet(`${API}/course/progress`, { signal: controller.signal })
        if (!cancelled) setSummary(json.summary ?? [])
      } catch { /* Fortschrittsanzeige optional */ }
      finally { if (!cancelled) setSummaryReady(true) }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [loggedIn, stationId])

  const progressFor = useCallback(
    (apiId) => summary.find((s) => s.stationId === apiId && s.level === niveau) ?? null,
    [summary, niveau],
  )

  // Üben ist frei, aber Login nötig (Fortschritt/Sperre ans Konto gebunden).
  // Bewusst IMMER die Station öffnen, auch ohne Login: die Stations-Detailseite
  // fängt den 401 selbst ab und zeigt den erklärenden Login-Hinweis (LoginNotice)
  // — damit sieht ein nicht eingeloggter Nutzer denselben Screen, egal ob er über
  // diese Liste oder per Deep-Link einsteigt (vorher: hier ein kommentarloser
  // Direktsprung ins Konto-Tab, per Deep-Link aber die Erklärung).
  const openStation = useCallback((mod) => {
    if (!mod.apiId) return
    openCourseStation(mod.apiId)
  }, [])

  // Ebene 2: Station-Detail, sobald ein Stations-Hash gesetzt ist.
  if (stationId) {
    // Folgestation im Lernpfad (für den Abschluss-Sprung jeder Station).
    const idx = KURS_MODULES.findIndex((m) => m.apiId === stationId)
    const next = idx >= 0 ? KURS_MODULES[idx + 1] : null
    return (
      <StationDetail
        stationId={stationId}
        gesamtausgabe={gesamtausgabe}
        onBack={closeCourseStation}
        onNavigateToKonto={onNavigateToKonto}
        onOpenNextStation={next ? () => openCourseStation(next.apiId) : null}
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
            <span
              className="test-raster-folio"
              aria-label={`Gewählte Niveaustufe: ${NIVEAU_LABELS[niveau] ?? niveau}`}
            >
              {NIVEAU_LABELS[niveau] ?? niveau}
            </span>
          </div>
        </nav>

        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Kurs-Module" ref={entriesRef} onKeyDown={handleSnapKeyDown}>

            {KURS_MODULES.map((mod, idx) => {
              const isFirst = idx === 0 // Schmuck-Initiale wie auf der Spielmodi-Startseite
              const prog = loggedIn ? progressFor(mod.apiId) : null
              const started = prog && prog.attempted > 0 && prog.total > 0
              return (
                <li key={mod.id} className={`test-entry${isFirst ? ' test-drop-cap' : ''}`}>
                  <div className="test-entry-number" aria-hidden="true">
                    <span className="test-entry-num-glyph">{mod.glyph}</span>
                    <span className="test-entry-marginalia">{mod.marginalia}</span>
                  </div>
                  <div className="test-entry-body">
                    <div className="test-entry-head">
                      {isFirst ? (
                        <>
                          <span className="test-dropcap-k" aria-hidden="true">{mod.title.charAt(0)}</span>
                          <h2 className="test-headword" aria-label={mod.title}>{mod.title.slice(1)}</h2>
                        </>
                      ) : (
                        <h2 className="test-headword">{mod.title}</h2>
                      )}
                      <span className="test-ipa" aria-label={`Aussprache: ${mod.ipa}`}>{mod.ipa}</span>
                    </div>
                    <div className="test-entry-grammar" aria-hidden="true">
                      <span className="test-pos">Station</span>
                      <span className="test-pos-rule" />
                      <span className="test-entry-category">{mod.category}</span>
                    </div>
                    <p className="test-definition">{mod.definition}</p>

                    <div className="test-entry-footer">
                      <span className="test-status">
                        {!loggedIn
                          ? 'Üben kostenlos mit Konto.'
                          : !summaryReady
                            ? 'Lädt …'
                            : started
                              ? `${prog.solved}/${prog.total} gelöst`
                              : 'Bereit.'}
                      </span>
                      <button
                        type="button"
                        className="test-cta"
                        onClick={() => openStation(mod)}
                      >
                        {!loggedIn ? 'Anmelden' : started ? 'Weiter' : 'Zur Aufgabe'}
                        <span className="test-cta-arrow" aria-hidden="true">›</span>
                      </button>
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

        {/* Desktop-Kolophon (Footer) — wie auf der Spielmodi-Startseite. */}
        <Colophon />
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
