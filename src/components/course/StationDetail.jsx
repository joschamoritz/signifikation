// Ebene 2 des Kurs-Tabs: Station-Detail (Kurs-Tab-IA.md §„Ebene 2“).
//
// Aufbau (mobile-first, Woerterbuch-Aesthetik, kein Quiz-App-Look):
//   - EINE kompakte, mobil sticky Kopfzeile: Zurueck · „① Titel“ · Material-Link
//   - Übungsaufgaben der gewaehlten Stufe (mobil als Ein-Aufgabe-Pager)
//   - „Material“ (PDF-Downloads, Lehrkraft/Premium) öffnet als Bottom-Sheet,
//     nicht mehr als gleichrangiger Tab — spart je Übungs-Screen die Tab-Leiste
//   - Niveau-Umschalter (DaZ/SekI/SekII/LK) liegt zentral im Kurs-Kopf/Profil
//
// Daten kommen aus der Premium-Kurs-API (/api/v1/course/*). Üben ist frei
// (requireAuthUser → 401 = Login-Hinweis), Material ist Premium (403).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { API, MOBILE_MEDIA_QUERY } from '../../config'
import { apiGet, ApiError } from '../../api/client'
import { apiFetch } from '../../utils/apiFetch'
import { downloadAuthenticatedPdf } from '../../utils/downloadPdf'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useGlobalNiveau, NIVEAU_LABELS } from './useGlobalNiveau'
import TaskGate from './games/TaskGate'
import Sheet from '../ui/Sheet'

// Material-Arten → Klartext + Reihenfolge der Download-Karten (IA-Reihenfolge:
// Arbeitsblatt · Lösung · Unterrichtsentwurf · Beamer).
const KIND_META = {
  arbeitsblatt:      { label: 'Arbeitsblatt',              hint: 'Aufgabenblatt der gewählten Stufe' },
  loesung:           { label: 'Lösung / Erwartungshorizont', hint: 'Musterlösung und Bewertungshinweise' },
  unterrichtsentwurf:{ label: 'Unterrichtsentwurf',         hint: 'Dreiklang und Stundenverlauf' },
  beamer:            { label: 'Beamer-Folien',              hint: 'Präsentationsfolien im Querformat' },
}
const KIND_ORDER = ['arbeitsblatt', 'loesung', 'unterrichtsentwurf', 'beamer']

// Stations-Glyph aus order_no (1–5). Detail-Kopf zeigt die richtige Station.
const STATION_GLYPHS = ['', '①', '②', '③', '④', '⑤']

// Ein-Satz-Lernziel je Station (niveau-übergreifend, daher OHNE logDice-Begriff —
// gilt auch in der DaZ/SekI-Schnupper-Ansicht von ④/⑤). Keyed auf order_no.
const STATION_GOALS = {
  1: 'Typische Wortpartner einer Stufe erkennen, vergleichen und am Korpus belegen – statt zu raten.',
  2: 'Wortarten als Werkzeug nutzen: Bausteine und Baupläne typischer Wortverbindungen über ihre Funktion bestimmen.',
  3: 'Typische Wortverbindungen in der Satzstruktur verorten – Satzglieder, Slots und Abhängigkeiten erkennen.',
  4: 'Verstehen, wie ein Korpus misst, welche Wortverbindungen wirklich typisch sind – und wo die Grenzen der Methode liegen.',
  5: 'Eine eigene sprachliche Frage am Korpus prüfen: Hypothese aufstellen, Befund deuten, begründet Stellung nehmen.',
}

// PDF/DOCX-Geschwister derselben Art+Stufe (gleicher `kind`+`level`, unterscheidet
// sich nur über die Dateiendung in fileRef) zu EINER Karte mit mehreren Download-
// Chips zusammenfassen, statt sie als zwei eigenständige Karten zu listen.
const FORMAT_ORDER = ['pdf', 'docx']
function formatOf(material) {
  return material.fileRef?.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'
}

function groupMaterials(materials) {
  const groups = new Map()
  for (const material of materials) {
    const key = `${material.kind}__${material.level ?? ''}`
    if (!groups.has(key)) groups.set(key, { kind: material.kind, level: material.level, items: [] })
    groups.get(key).items.push(material)
  }
  return [...groups.values()]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) => FORMAT_ORDER.indexOf(formatOf(a)) - FORMAT_ORDER.indexOf(formatOf(b)),
      ),
    }))
}

export default function StationDetail({ stationId, gesamtausgabe = false, onBack, onNavigateToKonto, onOpenNextStation }) {
  const [niveau] = useGlobalNiveau()
  const [materialOpen, setMaterialOpen] = useState(false)

  const [station, setStation] = useState(null)
  const [stationState, setStationState] = useState('loading') // loading | ready | denied | error
  const [stationRetryToken, setStationRetryToken] = useState(0)
  // Solved-Zähler des Üben-Pagers, in die Kopfzeile gespiegelt (mobiler Chip).
  const [uebenProgress, setUebenProgress] = useState(null)
  const headingRef = useRef(null)

  // ── Station-Kopfdaten (einmalig je Station) ──────────────────────────
  useEffect(() => {
    if (!stationId) return undefined
    let cancelled = false
    const controller = new AbortController()
    setStationState('loading')
    setStation(null)
    setUebenProgress(null)
    ;(async () => {
      try {
        const json = await apiGet(`${API}/course/stations/${stationId}`, { signal: controller.signal })
        if (cancelled) return
        setStation(json.station)
        setStationState('ready')
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        // Üben ist frei, braucht aber Login: 401 → „denied“ = Anmelde-Hinweis.
        // Die Route ist requireAuthUser, kann also nur 401 liefern; Material/
        // Lemma-Premium (403) wird im jeweiligen Bereich abgefangen, nicht hier.
        const needsLogin = err instanceof ApiError && err.status === 401
        setStationState(needsLogin ? 'denied' : 'error')
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId, stationRetryToken])

  // SPA-A11y (F10): Fokus auf die Stations-Überschrift, sobald die Station
  // geladen ist. StationDetail wird nur gemountet, wenn eine Station geöffnet
  // wird — ohne Deep-Link erst nach einem Klick (echtes Navigationsereignis),
  // mit Deep-Link ist die Station das Ziel. In beiden Fällen soll ein
  // Screenreader ansagen, wo man gelandet ist; ein „generischer“ Erst-Load
  // ohne Station mountet diese Komponente gar nicht → kein Fokus-Diebstahl.
  useEffect(() => {
    if (stationState === 'ready') headingRef.current?.focus()
  }, [stationState])

  if (stationState === 'denied') {
    return (
      <DetailFrame onBack={onBack} station={null} loading={false}>
        <LoginNotice onNavigateToKonto={onNavigateToKonto} />
      </DetailFrame>
    )
  }

  return (
    <DetailFrame
      onBack={onBack}
      station={station}
      loading={stationState === 'loading'}
      headingRef={headingRef}
      progress={uebenProgress}
      onOpenMaterial={stationState === 'ready' ? () => setMaterialOpen(true) : null}
    >
      {stationState === 'error' && (
        <p className="course-detail-error" role="alert">
          Station konnte nicht geladen werden.
          <button
            type="button"
            className="course-detail-error-retry"
            onClick={() => setStationRetryToken((t) => t + 1)}
          >
            Erneut versuchen
          </button>
        </p>
      )}

      {stationState === 'ready' && (
        <UebenPanel
          stationId={stationId}
          niveau={niveau}
          orderNo={station?.orderNo}
          onOpenNextStation={onOpenNextStation}
          onBack={onBack}
          onProgressChange={setUebenProgress}
        />
      )}

      {/* Material (Lehrkraft-PDFs) ist kein gleichrangiger Tab mehr, sondern ein
          Bottom-Sheet über die „Material“-Affordanz im Kopf — so bleibt der
          Übungs-Flow frei von der 64px-Tab-Leiste (1-Screen-Ziel). */}
      <Sheet
        open={materialOpen}
        onClose={() => setMaterialOpen(false)}
        aria-label="Unterrichtsmaterial dieser Station"
      >
        <Sheet.Header />
        <Sheet.Body>
          <MaterialPanel
            stationId={stationId}
            niveau={niveau}
            goal={STATION_GOALS[station?.orderNo] ?? ''}
            gesamtausgabe={gesamtausgabe}
            onNavigateToKonto={onNavigateToKonto}
          />
        </Sheet.Body>
      </Sheet>
    </DetailFrame>
  )
}

// ── Rahmen (Scroll-Container + kompakter, sticky Kopf) ─────────────────
// Der frühere getrennte Aufbau (Zurück-Leiste + großer Stations-Kopf +
// Üben/Material-Tabs) kostete mobil ~226px, bevor eine Aufgabe sichtbar war.
// Jetzt: EINE kompakte, mobil sticky Kopfzeile (Zurück + „① Titel“ + Material-
// Link); Material öffnet als Bottom-Sheet. Orientierung + Zurück bleiben beim
// Scrollen der Aufgabe stehen.
function DetailFrame({ onBack, station, loading = false, headingRef, onOpenMaterial, progress = null, children }) {
  return (
    <div className="test-page course-page">
      <div className="test-wrapper">
        <div className="course-detail">
          <header className="course-topbar">
            <button type="button" className="back-btn" onClick={onBack} aria-label="Zurück zum Lernpfad">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {/* tabIndex=-1: programmatisch fokussierbar (SPA-A11y), nicht im Tab-Fluss. */}
            <h2 className="course-topbar-title" ref={headingRef} tabIndex={-1}>
              {station ? (
                <>
                  <span className="course-topbar-glyph" aria-hidden="true">{STATION_GLYPHS[station.orderNo] ?? ''}</span>
                  {station.title}
                </>
              ) : loading ? (
                <span className="course-topbar-loading">Lädt …</span>
              ) : null}
            </h2>
            {progress && progress.total > 0 && (
              <span
                className="course-topbar-progress"
                aria-label={`${progress.solved} von ${progress.total} Aufgaben gelöst`}
              >
                {progress.solved}/{progress.total}
              </span>
            )}
            {onOpenMaterial && (
              <button type="button" className="course-material-link" onClick={onOpenMaterial}>
                Material<span className="course-material-link-arrow" aria-hidden="true"> ↓</span>
              </button>
            )}
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}

// Aufgaben nach Typ (Format) gruppieren, damit Untervarianten direkt
// hintereinander stehen (1 a) vor 1 b)). Stabil → Reihenfolge innerhalb eines
// Typs und die Erst-Reihenfolge der Typen bleiben erhalten.
function groupTasksByFormat(tasks) {
  const order = []
  for (const t of tasks) if (!order.includes(t.format)) order.push(t.format)
  return [...tasks].sort((a, b) => order.indexOf(a.format) - order.indexOf(b.format))
}

// Aufgaben gleichen Typs als Untervarianten nummerieren: „1 a)“, „1 b)“, „2“,
// „3 a)“ … — gleicher Aufgabentyp = gleiche Nummer + Buchstabe, einzelne nur Nummer.
function buildTaskLabels(tasks) {
  const order = []
  const total = {}
  for (const t of tasks) {
    if (!order.includes(t.format)) order.push(t.format)
    total[t.format] = (total[t.format] ?? 0) + 1
  }
  const seen = {}
  return tasks.map((t) => {
    seen[t.format] = (seen[t.format] ?? 0) + 1
    const no = order.indexOf(t.format) + 1
    const letter = total[t.format] > 1 ? ` ${String.fromCharCode(96 + seen[t.format])})` : ''
    return `${no}${letter}`
  })
}

// ── Bereich „Üben“ — Aufgaben der gewaehlten Stufe ──────────────────────
function UebenPanel({ stationId, niveau, orderNo, onOpenNextStation, onBack, onProgressChange }) {
  const [tasks, setTasks] = useState([])
  const [state, setState] = useState('loading')
  const [retryToken, setRetryToken] = useState(0)
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const orderedTasks = groupTasksByFormat(tasks)
  const taskLabels = buildTaskLabels(orderedTasks)
  // Persistierte Aufgaben-Ergebnisse (taskId → {correct, attempts}) ans Konto
  // gebunden. resultsReady verhindert ein kurzes Aufblitzen spielbarer Widgets,
  // bevor die Sperre der schon abgegebenen Aufgaben geladen ist.
  const [results, setResults] = useState({})
  const [resultsReady, setResultsReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setState('loading')
    ;(async () => {
      try {
        const json = await apiGet(
          `${API}/course/stations/${stationId}/tasks?level=${niveau}&resolve=interactive`,
          { signal: controller.signal },
        )
        if (cancelled) return
        setTasks(json.tasks ?? [])
        setState('ready')
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        setState('error')
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId, niveau, retryToken])

  // Konto-Ergebnisse laden (Fortschritt + Sperre).
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setResultsReady(false)
    setResults({}) // alte Ergebnisse verwerfen, sonst rechnet solvedCount kurz
                   // die Results des alten Niveaus gegen die Tasks des neuen
    ;(async () => {
      try {
        const json = await apiGet(
          `${API}/course/stations/${stationId}/results?level=${niveau}`,
          { signal: controller.signal },
        )
        if (cancelled) return
        const map = {}
        for (const r of json.results ?? []) map[r.taskId] = r
        setResults(map)
      } catch { /* Fortschritt ist optional — Aufgaben bleiben spielbar */ }
      finally { if (!cancelled) setResultsReady(true) }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId, niveau])

  // Ergebnis einer Aufgabe nach „Prüfen“ ans Konto senden (best effort).
  const persistResult = useCallback(async (taskId, correct) => {
    try {
      const res = await apiFetch(
        `${API}/course/stations/${stationId}/tasks/${encodeURIComponent(taskId)}/result`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level: niveau, correct }),
        },
      )
      if (!res.ok) return
      const { result } = await res.json()
      if (result) setResults((prev) => ({ ...prev, [taskId]: result }))
    } catch { /* Persistenz best effort — die Aufgabe bleibt lokal bewertet */ }
  }, [stationId, niveau])

  // Stations-Fortschritt für die Kopfzeile (gelöste von geladenen Aufgaben).
  const solvedCount = orderedTasks.filter((t) => results[t.id]?.correct === true).length

  // Inhalt erst zeigen, wenn auch der Fortschritt geladen ist (sonst blitzen
  // schon abgegebene Aufgaben kurz spielbar auf). Pager nur, wenn es Aufgaben
  // gibt; sonst greift der Hinweis + die (kurze) Lemma-Sektion unten.
  const contentReady = state === 'ready' && resultsReady
  const pagerActive = isMobile && contentReady && tasks.length > 0

  // Solved-Zähler an den Kopf melden — aber nur im mobilen Pager, wo der Chip
  // den Fortschrittsblock über der Aufgabe ersetzt (Desktop-Liste behält ihn).
  useEffect(() => {
    onProgressChange?.(pagerActive ? { solved: solvedCount, total: orderedTasks.length } : null)
  }, [onProgressChange, pagerActive, solvedCount, orderedTasks.length])
  useEffect(() => () => onProgressChange?.(null), [onProgressChange])

  return (
    <section className="course-panel">
      {(state === 'loading' || (state === 'ready' && !resultsReady)) && (
        <p className="course-muted">Lädt …</p>
      )}
      {state === 'error' && (
        <p className="course-detail-error" role="alert">
          Aufgaben konnten nicht geladen werden.
          <button
            type="button"
            className="course-detail-error-retry"
            onClick={() => setRetryToken((t) => t + 1)}
          >
            Erneut versuchen
          </button>
        </p>
      )}
      {contentReady && tasks.length === 0 && (
        <>
          <p className="course-muted">
            Die Aufgaben für <strong>{NIVEAU_LABELS[niveau] ?? niveau}</strong> werden
            gerade vorbereitet.
          </p>
          {/* F10: sonst Sackgasse — ohne Aufgaben zeigen weder Pager noch
              Liste unten einen NextStationCta. */}
          <div className="course-next-station-row">
            <NextStationCta orderNo={orderNo} onOpenNextStation={onOpenNextStation} onBack={onBack} />
          </div>
        </>
      )}

      {/* Stations-Fortschritt: gelöste von geladenen Aufgaben. Im mobilen Pager
          trägt der Kopf-Chip diese Info → Block nur in der Desktop-Liste. */}
      {contentReady && tasks.length > 0 && !pagerActive && (
        <StationProgress solved={solvedCount} total={orderedTasks.length} />
      )}

      {pagerActive ? (
        <UebenPager
          tasks={orderedTasks}
          labels={taskLabels}
          niveau={niveau}
          orderNo={orderNo}
          onOpenNextStation={onOpenNextStation}
          onBack={onBack}
          results={results}
          onResult={persistResult}
        />
      ) : (
        <>
          {contentReady && tasks.length > 0 && (
            <ol className="course-task-list">
              {orderedTasks.map((task, i) => (
                <li key={task.id} className="course-task-item">
                  <TaskGate
                    task={task}
                    index={taskLabels[i]}
                    result={results[task.id] ?? null}
                    onResult={(correct) => persistResult(task.id, correct)}
                  />
                </li>
              ))}
            </ol>
          )}

          {/* Abschluss der Station: Sprung in die nächste (oder zur Übersicht). */}
          {contentReady && tasks.length > 0 && (
            <div className="course-next-station-row">
              <NextStationCta orderNo={orderNo} onOpenNextStation={onOpenNextStation} onBack={onBack} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ── Weiter-zur-nächsten-Station-Affordanz (gilt für ALLE Stationen) ─────
// onOpenNextStation ist gesetzt, solange es eine Folgestation gibt; sonst führt
// die Aktion zurück in die Kurs-Übersicht. So bekommt jeder Lernpfad seinen
// Abschluss-Sprung, nicht nur Station ①.
function NextStationCta({ orderNo, onOpenNextStation, onBack }) {
  if (onOpenNextStation) {
    return (
      <button type="button" className="course-next-station" onClick={onOpenNextStation}>
        Weiter zu Station {STATION_GLYPHS[orderNo + 1] ?? ''}
        <span className="test-cta-arrow" aria-hidden="true">›</span>
      </button>
    )
  }
  return (
    <button type="button" className="course-next-station course-next-station--overview" onClick={onBack}>
      Zurück zur Kurs-Übersicht
      <span className="test-cta-arrow" aria-hidden="true">›</span>
    </button>
  )
}

// ── Stations-Fortschritt (gelöste Aufgaben der Stufe) ───────────────────
// Kontobezogen, bleibt über Sitzungen erhalten (course_task_result). Im
// Konto unter „Kurs-Fortschritt zurücksetzen“ neu spielbar.
function StationProgress({ solved, total }) {
  if (!total) return null
  const pct = Math.round((solved / total) * 100)
  return (
    <p className="course-station-progress">
      <span className="course-station-progress-count">{solved}/{total}</span>
      {' '}gelöst
      <span className="course-station-progress-bar" aria-hidden="true">
        <span className="course-station-progress-fill" style={{ width: `${pct}%` }} />
      </span>
    </p>
  )
}

// ── Mobiler Aufgaben-Pager: eine Aufgabe pro Bildschirm ─────────────────
// Wischt das lange Scrollen weg (Kurs-AP11-QA §„Zur Mobilen Nutzung“). Letzter
// Schritt ist ein Abschluss-Screen (Fortschritt + Sprung zur nächsten Station).
//
// Wichtig: ALLE Aufgaben bleiben gemountet (inaktive nur via [hidden]), damit
// Antworten beim Zurückblättern nicht verloren gehen. Jede Aufgabe meldet ihr
// erstes „Prüfen“ via onChecked → „erledigt/offen“-Zählung.
//
// Barrierefrei: beim Blättern wandert der Fokus auf die Überschrift des sicht-
// baren Screens (<h3 tabindex=-1>), die per sr-only „Aufgabe X von N“ ansagt;
// die Fortschrittslinie ist daher rein dekorativ (aria-hidden).
export function UebenPager({
  tasks, labels, niveau,
  orderNo, onOpenNextStation, onBack, results = {}, onResult,
}) {
  const total = tasks.length
  const endIndex = total // Abschluss-Screen liegt hinter der letzten Aufgabe
  const [step, setStep] = useState(0)
  // Initialstand aus results ableiten (K5): der Pager wird erst gemountet,
  // wenn resultsReady ist (contentReady in UebenPanel), results ist zu diesem
  // Zeitpunkt also schon vollständig — bereits gesperrte Aufgaben müssen nicht
  // erst über den asynchronen TaskGate-onChecked-Callback als "erledigt"
  // nachgemeldet werden. Sonst zeigt der Abschluss-Screen kurz "X von N"
  // statt sofort "alle".
  const doneFromResults = (r) => new Set(Object.keys(r).filter((id) => r[id]?.attempts > 0))
  const [done, setDone] = useState(() => doneFromResults(results))
  const containerRef = useRef(null)
  const focusPendingRef = useRef(false)

  // Scroll-Hinweis: markiert den aktiven Screen als „--more“, solange unten noch
  // Inhalt liegt (contained scroll bei hohen Aufgaben) → CSS blendet einen Fade
  // ein und nimmt ihn am Ende weg, damit „Prüfen“ nie verschleiert wird.
  const updateMore = useCallback((el) => {
    if (!el) return
    el.classList.toggle(
      'course-pager-screen--more',
      el.scrollHeight - el.scrollTop - el.clientHeight > 4,
    )
  }, [])

  // Kontextwechsel (Niveau/Anzahl) → zurück auf Aufgabe 1, Fortschritt neu.
  useEffect(() => {
    setStep(0)
    setDone(doneFromResults(results))
    focusPendingRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveau, total])

  // Fokus nur nach echtem Blättern auf die Überschrift des sichtbaren Screens —
  // nicht beim ersten Render/Reload (kein Fokus-Diebstahl).
  useEffect(() => {
    if (focusPendingRef.current) {
      containerRef.current
        ?.querySelector('.course-pager-screen:not([hidden]) .course-pager-heading')
        ?.focus()
      focusPendingRef.current = false
    }
  }, [step])

  // Scroll-Hinweis am aktiven Screen aktuell halten: initial, beim Blättern und
  // wenn der Inhalt wächst (Feedback nach „Prüfen“) — via ResizeObserver.
  useEffect(() => {
    const active = containerRef.current?.querySelector('.course-pager-screen:not([hidden])')
    if (!active) return undefined
    updateMore(active)
    const ro = new ResizeObserver(() => updateMore(active))
    ro.observe(active)
    if (active.firstElementChild) ro.observe(active.firstElementChild)
    return () => ro.disconnect()
  }, [step, updateMore])

  const go = (next) => {
    if (next < 0 || next > endIndex) return
    focusPendingRef.current = true
    setStep(next)
  }
  const markDone = (id) => setDone((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  const onEnd = step >= total
  const pct = onEnd ? 100 : Math.round(((step + 1) / total) * 100)

  return (
    <div className="course-pager" ref={containerRef}>
      {tasks.map((task, i) => (
        <div
          className="course-pager-screen"
          key={task.id}
          hidden={i !== step}
          onScroll={(e) => updateMore(e.currentTarget)}
        >
          <h3 className="course-pager-heading" tabIndex={-1}>
            Aufgabe {labels[i]}
            <span className="course-task-niveau" title="Differenzierungsstufe dieser Aufgabe">
              {NIVEAU_LABELS[niveau] ?? niveau}
            </span>
            <span className="sr-only">
              {' '}· Aufgabe {i + 1} von {total}{done.has(task.id) ? ', erledigt' : ''}
            </span>
          </h3>
          {/* index=false: Badge entfällt, die Überschrift trägt die Nummer.
              Bleibt gemountet → Antworten überstehen das Blättern. */}
          <TaskGate
            task={task}
            index={false}
            result={results[task.id] ?? null}
            onResult={(correct) => onResult?.(task.id, correct)}
            onChecked={() => markDone(task.id)}
          />
          {/* Scroll-Hinweis (letztes Kind → sticky am Boden des Scrollbereichs). */}
          <span className="course-pager-fade" aria-hidden="true" />
        </div>
      ))}

      {/* Abschluss-Screen */}
      <div
        className="course-pager-screen course-pager-end"
        hidden={!onEnd}
        onScroll={(e) => updateMore(e.currentTarget)}
      >
        <h3 className="course-pager-heading" tabIndex={-1}>Station abgeschlossen</h3>
        <p className="course-pager-end-summary">
          {done.size >= total
            ? <>Alle <strong>{total}</strong> Aufgaben geprüft — stark.</>
            : <><strong>{done.size}</strong> von <strong>{total}</strong> Aufgaben geprüft. Du kannst jederzeit zurückblättern.</>}
        </p>
        <div className="course-pager-end-actions">
          <NextStationCta orderNo={orderNo} onOpenNextStation={onOpenNextStation} onBack={onBack} />
        </div>
        <span className="course-pager-fade" aria-hidden="true" />
      </div>

      <div className="course-pager-nav">
        <button
          type="button"
          className="course-pager-btn course-pager-btn--prev"
          onClick={() => go(step - 1)}
          disabled={step === 0}
        >
          <span className="course-pager-chevron" aria-hidden="true">‹</span>
          Zurück
        </button>
        <button
          type="button"
          className="course-pager-btn course-pager-btn--next"
          onClick={() => go(step + 1)}
          disabled={step >= endIndex}
        >
          {step === total - 1 ? 'Abschluss' : 'Weiter'}
          <span className="course-pager-chevron" aria-hidden="true">›</span>
        </button>
      </div>

      {/* Dezente Fortschrittslinie ganz unten unter der Tabbar; rein dekorativ. */}
      <div className="course-progress" aria-hidden="true">
        <span className="course-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Bereich „Material“ — PDF-Download-Karten (Premium) ──────────────────
// Das Material (Arbeitsblätter/Lösungen/Entwürfe/Beamer) ist der Premium-Teil
// des Kurses; Üben bleibt frei. Ohne Gesamtausgabe → Upsell statt Laden.
function MaterialPanel({ stationId, niveau, goal, gesamtausgabe = false, onNavigateToKonto }) {
  const [materials, setMaterials] = useState([])
  const [state, setState] = useState('loading')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!gesamtausgabe) return undefined // kein Premium → gar nicht erst laden
    let cancelled = false
    const controller = new AbortController()
    setState('loading')
    ;(async () => {
      try {
        const json = await apiGet(
          `${API}/course/stations/${stationId}/materials?level=${niveau}`,
          { signal: controller.signal },
        )
        if (cancelled) return
        setMaterials(json.materials ?? [])
        setState('ready')
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        setState('error')
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId, niveau, gesamtausgabe, retryToken])

  return (
    <section className="course-panel course-panel--material">
      {/* Lernziel der Station — bewusst nur hier im Lehrkraft-Bereich, nicht
          mehr über jeder Übungsseite (steht schon auf der Kurs-Startseite). */}
      {goal && <p className="course-panel-lead">{goal}</p>}

      {!gesamtausgabe && <MaterialPremiumNotice onNavigateToKonto={onNavigateToKonto} />}

      {gesamtausgabe && state === 'loading' && <p className="course-muted">Lädt …</p>}
      {state === 'error' && (
        <p className="course-detail-error" role="alert">
          Material konnte nicht geladen werden.
          <button
            type="button"
            className="course-detail-error-retry"
            onClick={() => setRetryToken((t) => t + 1)}
          >
            Erneut versuchen
          </button>
        </p>
      )}
      {state === 'ready' && materials.length === 0 && (
        <p className="course-muted">
          Die Materialien für <strong>{NIVEAU_LABELS[niveau]}</strong> werden
          gerade vorbereitet.
        </p>
      )}
      {state === 'ready' && materials.length > 0 && (
        <ul className="course-materials">
          {groupMaterials(materials).map((group) => (
            <MaterialCard
              key={`${group.kind}__${group.level ?? ''}`}
              stationId={stationId}
              group={group}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// Eine Karte pro Art+Stufe (Arbeitsblatt/Lösung/…), mit einem Download-Chip je
// verfügbarem Format (PDF, ggf. DOCX) nebeneinander — statt zwei eigenständigen
// Karten für dieselbe Aufgabe.
function MaterialCard({ stationId, group }) {
  const meta = KIND_META[group.kind] ?? { label: group.kind, hint: '' }
  return (
    <li className="course-material">
      <div className="course-material-card">
        <div className="course-material-text">
          <span className="course-material-kind">{meta.label}</span>
          {group.level && (
            <span className="course-material-level">{NIVEAU_LABELS[group.level] ?? group.level}</span>
          )}
          {meta.hint && <span className="course-material-hint">{meta.hint}</span>}
        </div>
        <div className="course-material-formats">
          {group.items.map((material) => (
            <MaterialFormatLink
              key={material.id}
              stationId={stationId}
              material={material}
              kindLabel={meta.label}
            />
          ))}
        </div>
      </div>
    </li>
  )
}

function MaterialFormatLink({ stationId, material, kindLabel }) {
  const href = `${API}/course/stations/${stationId}/materials/${encodeURIComponent(material.id)}/download`
  const format = formatOf(material)
  const filename = `${material.kind}${material.level ? `-${material.level}` : ''}.${format}`
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // In der nativen App trägt ein normaler <a href download> keinen Bearer-Header
  // (Cookies sind cross-origin) → 401. Dort den Klick abfangen und die Datei über
  // apiFetch (mit Bearer) holen + nativ teilen. Im Web bleibt der Anchor mit
  // Cookie-Auth unverändert.
  const onClick = async (e) => {
    if (!Capacitor.isNativePlatform()) return
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await downloadAuthenticatedPdf(href, filename)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <a
      className={`course-material-format-link${failed ? ' course-material-format-link--failed' : ''}`}
      href={href}
      download
      onClick={onClick}
      aria-busy={busy || undefined}
    >
      <span className="course-material-format">{format.toUpperCase()}</span>
      <span className="course-material-arrow" aria-hidden="true">{busy ? '…' : failed ? '!' : '↓'}</span>
      <span className="sr-only">
        {kindLabel} als {format.toUpperCase()}
        {failed ? ' – Download fehlgeschlagen, erneut versuchen' : ' herunterladen'}
      </span>
    </a>
  )
}

// ── Login-Hinweis (401, nur per Deep-Link erreichbar) ───────────────────
// Üben ist frei, braucht aber ein Konto (Fortschritt/Sperre kontobezogen).
function LoginNotice({ onNavigateToKonto }) {
  return (
    <div className="course-unlock">
      <p className="course-head-category">Kurs</p>
      <h2 className="course-head-title">Zum Üben anmelden</h2>
      <p className="course-head-goal">
        Die Übungen sind kostenlos — melde dich an, damit dein Fortschritt
        gespeichert wird.
      </p>
      {onNavigateToKonto && (
        <button type="button" className="test-cta" onClick={onNavigateToKonto}>
          Zum Konto <span className="test-cta-arrow" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}

// ── Premium-Upsell für den Material-Bereich (403) ───────────────────────
function MaterialPremiumNotice({ onNavigateToKonto }) {
  return (
    <div className="course-unlock">
      <p className="course-head-category">Gesamtausgabe</p>
      <h2 className="course-head-title">Unterrichtsmaterial ist Teil der Gesamtausgabe</h2>
      <p className="course-head-goal">
        Unterrichtsentwurf, Arbeitsblätter in vier Differenzierungsstufen,
        Erwartungshorizont und Beamer-Folien sind mit der Gesamtausgabe
        freigeschaltet. Das Üben bleibt für dich kostenlos.
      </p>
      {onNavigateToKonto && (
        <button type="button" className="test-cta" onClick={onNavigateToKonto}>
          Zur Gesamtausgabe <span className="test-cta-arrow" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}
