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

import { useEffect, useState } from 'react'
import { API } from '../../config'
import { apiGet, ApiError } from '../../api/client'
import { useGlobalNiveau, NIVEAU_LEVELS, NIVEAU_LABELS } from './useGlobalNiveau'

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
          <div className="course-detail-bar">
            <button type="button" className="back-btn" onClick={onBack}>
              <span aria-hidden="true">‹</span> Kurs
            </button>
            <span className="course-detail-overline" aria-hidden="true">Didaktischer Lernpfad</span>
          </div>
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
        <span className="course-head-glyph" aria-hidden="true">①</span>
        <h2 className="course-head-title">{station.title}</h2>
        {station.ipa && (
          <span className="course-head-ipa" aria-label={`Aussprache: ${station.ipa}`}>
            [{station.ipa}]
          </span>
        )}
      </div>
      {station.category && (
        <p className="course-head-category">{station.category}</p>
      )}
      <p className="course-head-goal">
        Typische Wortpartner einer Stufe erkennen, vergleichen und am Korpus
        belegen — statt zu raten.
      </p>
    </header>
  )
}

// ── Niveau-Umschalter ───────────────────────────────────────────────────
function NiveauSwitcher({ niveau, onChange }) {
  return (
    <div className="course-niveau">
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
  )
}

// ── Bereich „Üben" — Aufgaben der gewaehlten Stufe ──────────────────────
function UebenPanel({ stationId, niveau }) {
  const [tasks, setTasks] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setState('loading')
    ;(async () => {
      try {
        const json = await apiGet(
          `${API}/course/stations/${stationId}/tasks?level=${niveau}`,
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
  }, [stationId, niveau])

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
        <>
          <p className="course-panel-lead">
            Aufgaben für <strong>{NIVEAU_LABELS[niveau]}</strong>. Das interaktive
            Lösen folgt — hier siehst du die Items dieser Stufe.
          </p>
          <ol className="course-tasks">
            {tasks.map((task, i) => (
              <li key={task.id} className="course-task">
                <div className="course-task-head">
                  <span className="course-task-no" aria-hidden="true">{i + 1}</span>
                  <span className="course-task-format">Aufgabe · {task.format}</span>
                  {task.kern && <span className="course-task-kern">{task.kern}</span>}
                </div>
                <p className="course-task-prompt">{taskPrompt(task)}</p>
                {Array.isArray(metasprache(task)) && metasprache(task).length > 0 && (
                  <ul className="course-task-tags" aria-label="Metasprache">
                    {metasprache(task).map((m) => (
                      <li key={m} className="course-task-tag">{m}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

// content (static) bzw. template (corpus-template) tragen prompt/metasprache.
function taskPrompt(task) {
  return task.content?.prompt ?? task.template?.prompt ?? '—'
}
function metasprache(task) {
  return task.content?.metasprache ?? task.template?.metasprache ?? []
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
