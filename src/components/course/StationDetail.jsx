// Ebene 2 des Kurs-Tabs: Station-Detail (Kurs-Tab-IA.md §„Ebene 2").
//
// Aufbau (mobile-first, Woerterbuch-Aesthetik, kein Quiz-App-Look):
//   - schmale Kopfzeile mit Zurueck-Affordanz
//   - Stations-Kopf: Titel · IPA · Kategorie · 1-Satz-Lernziel
//   - Niveau-Umschalter (DaZ/SekI/SekII/LK) — global gemerkt, steuert beide Bereiche
//   - zwei Bereiche als Tabs: „Üben" (Aufgaben der Stufe) / „Material" (PDF-Downloads)
//
// Daten kommen aus der Premium-Kurs-API (/api/v1/course/*). Der gesamte Tab ist
// Premium-gegated (requirePremium serverseitig); 403 wird hier abgefangen.

import { useEffect, useRef, useState } from 'react'
import { API, MOBILE_MEDIA_QUERY } from '../../config'
import { apiGet, ApiError } from '../../api/client'
import { apiFetch } from '../../utils/apiFetch'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useGlobalNiveau, NIVEAU_LEVELS, NIVEAU_LABELS } from './useGlobalNiveau'
import TaskPlayer from './games/TaskPlayer'
import CustomLemmaBar from './CustomLemmaBar'

const SECTIONS = [
  { id: 'ueben',    label: 'Üben' },
  { id: 'material', label: 'Material' },
]

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
  1: 'Typische Wortpartner einer Stufe erkennen, vergleichen und am Korpus belegen — statt zu raten.',
  2: 'Wortarten als Werkzeug nutzen: Bausteine und Baupläne typischer Wortverbindungen über ihre Funktion bestimmen.',
  3: 'Typische Wortverbindungen in der Satzstruktur verorten — Satzglieder, Slots und Abhängigkeiten erkennen.',
  4: 'Verstehen, wie ein Korpus misst, welche Wortverbindungen wirklich typisch sind — und wo die Grenzen der Methode liegen.',
  5: 'Eine eigene sprachliche Frage am Korpus prüfen: Hypothese aufstellen, Befund deuten, begründet Stellung nehmen.',
}

function sortMaterials(materials) {
  return [...materials].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  )
}

export default function StationDetail({ stationId, onBack, onNavigateToKonto }) {
  const [niveau, setNiveau] = useGlobalNiveau()
  const [section, setSection] = useState('ueben')

  const [station, setStation] = useState(null)
  const [stationState, setStationState] = useState('loading') // loading | ready | denied | error

  // ── Station-Kopfdaten (einmalig je Station) ──────────────────────────
  useEffect(() => {
    if (!stationId) return undefined
    let cancelled = false
    const controller = new AbortController()
    setStationState('loading')
    setStation(null)
    ;(async () => {
      try {
        const json = await apiGet(`${API}/course/stations/${stationId}`, { signal: controller.signal })
        if (cancelled) return
        setStation(json.station)
        setStationState('ready')
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        // 401 (nicht eingeloggt) und 403 (eingeloggt, aber kein Premium)
        // führen beide auf den Gesamtausgabe-Hinweis (Login + Upgrade im Konto).
        const gated = err instanceof ApiError && (err.status === 401 || err.status === 403)
        setStationState(gated ? 'denied' : 'error')
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId])

  if (stationState === 'denied') {
    return (
      <DetailFrame onBack={onBack}>
        <UnlockNotice onNavigateToKonto={onNavigateToKonto} />
      </DetailFrame>
    )
  }

  return (
    <DetailFrame onBack={onBack}>
      <StationHead station={station} state={stationState} />

      {stationState === 'error' && (
        <p className="course-detail-error" role="alert">
          Station konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {stationState === 'ready' && (
        <>
          <NiveauSwitcher niveau={niveau} onChange={setNiveau} />

          <div className="course-sections" role="tablist" aria-label="Bereich">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                role="tab"
                id={`course-tab-${s.id}`}
                aria-selected={section === s.id}
                aria-controls={`course-panel-${s.id}`}
                className={`course-section-tab${section === s.id ? ' course-section-tab--active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {section === 'ueben' ? (
            <UebenPanel stationId={stationId} niveau={niveau} />
          ) : (
            <MaterialPanel stationId={stationId} niveau={niveau} />
          )}
        </>
      )}
    </DetailFrame>
  )
}

// ── Rahmen (Scroll-Container, Zurueck-Leiste) ──────────────────────────
function DetailFrame({ onBack, children }) {
  return (
    <div className="test-page course-page">
      <div className="test-wrapper">
        <div className="course-detail">
          <header className="course-detail-bar">
            <button type="button" className="back-btn" onClick={onBack} aria-label="Zurück zum Lernpfad">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <span className="course-detail-badge">Didaktischer Lernpfad</span>
          </header>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Stations-Kopf ───────────────────────────────────────────────────────
function StationHead({ station, state }) {
  if (state === 'loading' || !station) {
    return (
      <header className="course-head">
        <p className="course-head-skeleton" aria-hidden="true">Lädt …</p>
      </header>
    )
  }
  return (
    <header className="course-head">
      <div className="course-head-top">
        <span className="course-head-glyph" aria-hidden="true">{STATION_GLYPHS[station.orderNo] ?? ''}</span>
        <h2 className="course-head-title">{station.title}</h2>
      </div>
      {station.category && (
        <p className="course-head-category">{station.category}</p>
      )}
      <p className="course-head-goal">
        {STATION_GOALS[station.orderNo] ?? ''}
      </p>
    </header>
  )
}

// ── Niveau-Umschalter ───────────────────────────────────────────────────
function NiveauSwitcher({ niveau, onChange }) {
  return (
    <div className="course-niveau">
      <div className="course-niveau-row">
        <span className="course-niveau-label">Niveau</span>
        <div className="course-niveau-segment" role="group" aria-label="Niveaustufe wählen">
          {NIVEAU_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`course-niveau-btn${niveau === level ? ' course-niveau-btn--active' : ''}`}
              aria-pressed={niveau === level}
              onClick={() => onChange(level)}
            >
              {NIVEAU_LABELS[level]}
            </button>
          ))}
        </div>
      </div>
      <p className="course-niveau-hint">
        DaZ · Deutsch als Zweitsprache — Sek I/II · Sekundarstufe — LK · Leistungskurs.
        Aufgaben und Material passen sich der Stufe an.
      </p>
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

// Aufgaben gleichen Typs als Untervarianten nummerieren: „1 a)", „1 b)", „2",
// „3 a)" … — gleicher Aufgabentyp = gleiche Nummer + Buchstabe, einzelne nur Nummer.
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

// ── Bereich „Üben" — Aufgaben der gewaehlten Stufe ──────────────────────
function UebenPanel({ stationId, niveau }) {
  const [tasks, setTasks] = useState([])
  const [state, setState] = useState('loading')
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
  const orderedTasks = groupTasksByFormat(tasks)
  const taskLabels = buildTaskLabels(orderedTasks)
  // „Eigenes Lemma" (AP9): gewähltes Wort + Infos, global über Niveaus hinweg.
  const [lemma, setLemma] = useState(null)
  const [lemmaInfo, setLemmaInfo] = useState(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setState('loading')
    ;(async () => {
      try {
        const params = new URLSearchParams({ level: niveau, resolve: 'interactive' })
        if (lemma) params.set('lemma', lemma)
        const json = await apiGet(
          `${API}/course/stations/${stationId}/tasks?${params.toString()}`,
          { signal: controller.signal },
        )
        if (cancelled) return
        setTasks(json.tasks ?? [])
        setState('ready')
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        // 422 = Lemma nicht geeignet (sollte durch Validierung vorab selten sein).
        if (err instanceof ApiError && err.status === 422) { setLemma(null); setLemmaInfo(null) }
        setState('error')
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId, niveau, lemma])

  async function openWorksheet() {
    if (!lemma) return
    try {
      const params = new URLSearchParams({ lemma, level: niveau, kind: 'arbeitsblatt' })
      const res = await apiFetch(
        `${API}/course/stations/${stationId}/worksheet?${params.toString()}`,
        { credentials: 'include' },
      )
      if (!res.ok) return
      const html = await res.text()
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch { /* Öffnen fehlgeschlagen — Lehrkraft kann erneut versuchen */ }
  }

  // „Eigenes Lemma" als wiederverwendbarer Block — auf Desktop am Ende der
  // Liste, auf Mobil als letzter Deck-Screen des Pagers.
  const lemmaLead = (
    <p className="course-lemma-section-lead">
      Lieber an einem eigenen Wort üben? Die Aufgaben füllen sich dann mit echten
      Korpusbelegen deiner Wahl.
    </p>
  )
  const lemmaBar = (
    <CustomLemmaBar
      applied={lemma}
      appliedInfo={lemmaInfo}
      onApply={(w, info) => { setLemma(w); setLemmaInfo(info) }}
      onClear={() => { setLemma(null); setLemmaInfo(null) }}
      onOpenWorksheet={openWorksheet}
    />
  )

  // Pager nur, wenn es auch Aufgaben gibt; sonst greift der Hinweis + die
  // (kurze) Lemma-Sektion unten.
  const pagerActive = isMobile && state === 'ready' && tasks.length > 0

  return (
    <section
      className="course-panel"
      role="tabpanel"
      id="course-panel-ueben"
      aria-labelledby="course-tab-ueben"
    >
      {state === 'loading' && <p className="course-muted">Lädt …</p>}
      {state === 'error' && (
        <p className="course-detail-error" role="alert">Aufgaben konnten nicht geladen werden.</p>
      )}
      {state === 'ready' && tasks.length === 0 && (
        <p className="course-muted">Für diese Stufe sind noch keine Aufgaben hinterlegt.</p>
      )}

      {state === 'ready' && tasks.length > 0 && (
        <p className="course-panel-lead">
          Aufgaben für <strong>{NIVEAU_LABELS[niveau]}</strong>
          {lemma ? <> · Wort: <strong>{lemma}</strong></> : null}. Prüfe deine
          Lösung — das Feedback nutzt echte Korpusdaten.
        </p>
      )}

      {pagerActive ? (
        <UebenPager
          tasks={orderedTasks}
          labels={taskLabels}
          niveau={niveau}
          lemma={lemma}
          lemmaLead={lemmaLead}
          lemmaBar={lemmaBar}
        />
      ) : (
        <>
          {state === 'ready' && tasks.length > 0 && (
            <ol className="course-task-list">
              {orderedTasks.map((task, i) => (
                <li key={task.id} className="course-task-item">
                  <TaskPlayer task={task} index={taskLabels[i]} />
                </li>
              ))}
            </ol>
          )}

          {/* „Eigenes Lemma" bewusst ans Ende: die kuratierten Beispiele haben
              Vorrang, das eigene Wort ist die nachgelagerte Option. */}
          <div className="course-lemma-section">
            {lemmaLead}
            {lemmaBar}
          </div>
        </>
      )}
    </section>
  )
}

// ── Mobiler Aufgaben-Pager: eine Aufgabe pro Bildschirm ─────────────────
// Wischt das lange Scrollen weg (Kurs-AP11-QA §„Zur Mobilen Nutzung"). Letzter
// Schritt ist die „Eigenes Lemma"-Sektion. Barrierefrei: beim Blättern wandert
// der Fokus auf die Aufgaben-Überschrift (<h3 tabindex=-1>), die per sr-only
// „Aufgabe X von N" ansagt; die Fortschrittsleiste ist daher rein dekorativ
// (aria-hidden), um doppelte Ansagen zu vermeiden.
export function UebenPager({ tasks, labels, niveau, lemma, lemmaLead, lemmaBar }) {
  const total = tasks.length
  const lastIndex = total // Lemma-Schritt liegt hinter der letzten Aufgabe
  const [step, setStep] = useState(0)
  const headingRef = useRef(null)
  const focusPendingRef = useRef(false)

  // Kontextwechsel (Niveau/Lemma/Anzahl) → zurück auf die erste Aufgabe, ohne
  // dabei den Fokus zu stehlen.
  useEffect(() => {
    setStep(0)
    focusPendingRef.current = false
  }, [niveau, lemma, total])

  // Fokus nur nach echtem Blättern setzen, nicht beim ersten Render/Reload.
  useEffect(() => {
    if (focusPendingRef.current) {
      headingRef.current?.focus()
      focusPendingRef.current = false
    }
  }, [step])

  const go = (next) => {
    if (next < 0 || next > lastIndex) return
    focusPendingRef.current = true
    setStep(next)
  }

  const onLemma = step >= total
  const pct = onLemma ? 100 : Math.round(((step + 1) / total) * 100)

  return (
    <div className="course-pager">
      {onLemma ? (
        <div className="course-pager-screen">
          <h3 className="course-pager-heading" tabIndex={-1} ref={headingRef}>
            Eigenes Wort einsetzen
          </h3>
          {lemmaLead}
          {lemmaBar}
        </div>
      ) : (
        <div className="course-pager-screen">
          <h3 className="course-pager-heading" tabIndex={-1} ref={headingRef}>
            Aufgabe {labels[step]}
            <span className="sr-only"> · Aufgabe {step + 1} von {total}</span>
          </h3>
          {/* key erzwingt frischen State pro Aufgabe; index=false unterdrückt
              das Badge, weil die Überschrift oben die Nummer trägt. */}
          <TaskPlayer key={tasks[step].id} task={tasks[step]} index={false} />
        </div>
      )}

      <div className="course-pager-nav">
        <button
          type="button"
          className="course-pager-btn course-pager-btn--prev"
          onClick={() => go(step - 1)}
          disabled={step === 0}
        >
          Zurück
        </button>
        <button
          type="button"
          className="course-pager-btn course-pager-btn--next"
          onClick={() => go(step + 1)}
          disabled={step >= lastIndex}
        >
          {step === total - 1 ? 'Eigenes Wort' : 'Weiter'}
        </button>
      </div>

      <div className="course-progress" aria-hidden="true">
        <span className="course-progress-label">
          {onLemma ? 'Eigenes Wort' : `Aufgabe ${step + 1} von ${total}`}
        </span>
        <span className="course-progress-track">
          <span className="course-progress-fill" style={{ width: `${pct}%` }} />
        </span>
      </div>
    </div>
  )
}

// ── Bereich „Material" — PDF-Download-Karten ────────────────────────────
function MaterialPanel({ stationId, niveau }) {
  const [materials, setMaterials] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
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
        setMaterials(sortMaterials(json.materials ?? []))
        setState('ready')
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return
        setState('error')
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [stationId, niveau])

  return (
    <section
      className="course-panel"
      role="tabpanel"
      id="course-panel-material"
      aria-labelledby="course-tab-material"
    >
      {state === 'loading' && <p className="course-muted">Lädt …</p>}
      {state === 'error' && (
        <p className="course-detail-error" role="alert">Material konnte nicht geladen werden.</p>
      )}
      {state === 'ready' && materials.length === 0 && (
        <p className="course-muted">
          Die Materialien für <strong>{NIVEAU_LABELS[niveau]}</strong> werden
          gerade vorbereitet.
        </p>
      )}
      {state === 'ready' && materials.length > 0 && (
        <ul className="course-materials">
          {materials.map((material) => (
            <MaterialCard key={material.id} stationId={stationId} material={material} />
          ))}
        </ul>
      )}
    </section>
  )
}

function MaterialCard({ stationId, material }) {
  const meta = KIND_META[material.kind] ?? { label: material.kind, hint: '' }
  const href = `${API}/course/stations/${stationId}/materials/${encodeURIComponent(material.id)}/download`
  return (
    <li className="course-material">
      <a className="course-material-card" href={href} download>
        <div className="course-material-text">
          <span className="course-material-kind">{meta.label}</span>
          {material.level && (
            <span className="course-material-level">{NIVEAU_LABELS[material.level] ?? material.level}</span>
          )}
          {meta.hint && <span className="course-material-hint">{meta.hint}</span>}
        </div>
        <span className="course-material-action" aria-hidden="true">
          <span className="course-material-format">PDF</span>
          <span className="course-material-arrow">↓</span>
        </span>
        <span className="sr-only">{meta.label} als PDF herunterladen</span>
      </a>
    </li>
  )
}

// ── Premium-Gate (403) ──────────────────────────────────────────────────
function UnlockNotice({ onNavigateToKonto }) {
  return (
    <div className="course-unlock">
      <p className="course-head-category">Gesamtausgabe</p>
      <h2 className="course-head-title">Kurs ist Teil der Gesamtausgabe</h2>
      <p className="course-head-goal">
        Stationen, Aufgaben und Unterrichtsmaterial sind mit der Gesamtausgabe
        freigeschaltet.
      </p>
      {onNavigateToKonto && (
        <button type="button" className="test-cta" onClick={onNavigateToKonto}>
          Zur Gesamtausgabe <span className="test-cta-arrow" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}
