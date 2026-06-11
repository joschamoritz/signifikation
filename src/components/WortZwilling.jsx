// Phase-5/T-5.6: Props `mode`, `onSubmit`, `disableProgress`, `hideHeader`
// werden akzeptiert (s. WortZwilling-Default-Export unten), aber der
// Singleplayer-Pfad bleibt unangetastet. Classroom rendert eigene Variante
// (classroom/student/games/ClassroomGameWortZwilling.jsx).
import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCenter,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { shuffle } from '../utils/gameLogic'
import { API } from '../config'
import { apiGet } from '../api/client'
import '../styles/wortzwilling.css'
import WzResultsView, { computeScore } from './WzResultsView'
import { logError } from '../utils/logError'

// ── Draggable Chip ────────────────────────────────────────────
function DraggableChip({ word, placed, selected, jokerCluster, onClick, onKeyDown, ariaLabel }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: word })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  // Echtes <button> statt div role=button: natives Keyboard-Verhalten
  // (Space ohne Scroll, Enter), Fokus-Semantik, AT-Robustheit (F-N8).
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={[
        'wz-chip',
        placed         ? 'wz-chip--placed'   : '',
        isDragging     ? 'wz-chip--dragging'  : '',
        selected       ? 'wz-chip--selected'  : '',
        jokerCluster   ? 'wz-chip--cluster'   : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
    >
      {word}
    </button>
  )
}

// ── Droppable Zone ────────────────────────────────────────────
function DroppableZone({ id, label, chips, jokerCluster, isShaking, isClickable, isFull, onZoneClick, onChipClick }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={isClickable ? 0 : -1}
      aria-label={`${label}${isFull ? ' – voll' : isClickable ? ' – hier einordnen' : ''}`}
      className={[
        'wz-zone',
        isOver      ? 'wz-zone--over'      : '',
        isClickable ? 'wz-zone--clickable'  : '',
        isFull      ? 'wz-zone--full'       : '',
        isShaking   ? 'wz-zone--shake'      : '',
      ].filter(Boolean).join(' ')}
      onClick={onZoneClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZoneClick() } }}
    >
      <div className="wz-zone-label">{label}</div>
      {isShaking && <p className="wz-zone-full-msg" aria-live="polite">Zone voll</p>}
      <div className="wz-zone-chips">
        {chips.map(w => (
          <DraggableChip
            key={w}
            word={w}
            placed
            jokerCluster={jokerCluster?.includes(w)}
            onClick={e => { e.stopPropagation(); onChipClick(w) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChipClick(w) } }}
            ariaLabel={`${w} – in Zone ${label}, zurück in Wortbank legen`}
          />
        ))}
        {Array.from({ length: 5 - chips.length }).map((_, i) => (
          <div key={i} className="wz-slot-empty" />
        ))}
      </div>
    </div>
  )
}

// ── Droppable Bank ────────────────────────────────────────────
function DroppableBank({ children }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'bank' })
  return (
    <div ref={setNodeRef} className={`wz-bank${isOver ? ' wz-bank--over' : ''}`}>
      {children}
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────
export default function WortZwilling({
  data,
  onBack,
  onFinish,
  savedResult = null,
  mode = 'single',          // 'single' | 'classroom' (T-5.6)
  onSubmit,                 // Classroom: (rawAnswer) => void
  onProgress,               // Classroom: Entwurf spiegeln (Reload, 7.2)
  initialZones = null,      // Classroom: { zoneA, zoneB } aus dem Entwurf
  hideHeader = false,       // Classroom: KioskShell zeigt eigenen Header
}) {
  // Klassenraum nutzt dieselbe Drag-and-Drop-Engine, aber OHNE Joker und OHNE
  // lokales Scoring (beide brauchen die Lösung `zuordnung`, die der Server im
  // Klassenraum bewusst NICHT mitschickt). Abgabe geht per onSubmit an den
  // Server; die Auflösung gibt die Lehrkraft frei.
  const isClassroom = mode === 'classroom'
  const submittedRef = useRef(false)
  const words = data.kollokatoren.map(k => k.wort)

  const [order] = useState(() => shuffle([...words]))

  const [locations, setLocations] = useState(() => {
    const restore = isClassroom ? initialZones : savedResult
    if (restore) {
      const map = {}
      for (const w of words) map[w] = 'bank'
      for (const w of (restore.zoneA || [])) if (w in map || words.includes(w)) map[w] = 'A'
      for (const w of (restore.zoneB || [])) if (w in map || words.includes(w)) map[w] = 'B'
      return map
    }
    return Object.fromEntries(words.map(w => [w, 'bank']))
  })

  const [selected,  setSelected]  = useState(null)
  const [activeId,  setActiveId]  = useState(null)
  const [phase,     setPhase]     = useState(savedResult && !isClassroom ? 'results' : 'play')
  const [fullZone,  setFullZone]  = useState(null)

  // ── Joker ────────────────────────────────────────────────────
  const [jokerVisible,  setJokerVisible]  = useState(false)
  const [jokerUsed,     setJokerUsed]     = useState(false)
  const [jokerCluster,  setJokerCluster]  = useState(null)
  const [jokerMsg,      setJokerMsg]      = useState(null)
  const jokerTimer     = useRef(null)
  const jokerMsgTimer  = useRef(null)
  const fullZoneTimer  = useRef(null)

  useEffect(() => {
    if (phase !== 'play' || jokerUsed || isClassroom) return
    setJokerVisible(false)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 20000)
    return () => clearTimeout(jokerTimer.current)
  }, [phase, jokerUsed, isClassroom])

  useEffect(() => () => {
    clearTimeout(jokerMsgTimer.current)
    clearTimeout(fullZoneTimer.current)
  }, [])

  function resetJokerTimer() {
    if (jokerUsed || phase !== 'play') return
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 20000)
  }

  function activateJoker() {
    if (jokerUsed || phase !== 'play') return
    setJokerUsed(true)
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    const groupA   = data.kollokatoren.filter(k => k.zuordnung === 'A').map(k => k.wort)
    const groupB   = data.kollokatoren.filter(k => k.zuordnung === 'B').map(k => k.wort)
    const wrongA   = groupA.filter(w => locations[w] !== 'A')
    const wrongB   = groupB.filter(w => locations[w] !== 'B')
    const pool     = wrongA.length >= wrongB.length ? groupA : groupB
    const pair     = shuffle([...pool]).slice(0, 2)
    if (pair.length === 2) {
      setJokerCluster(pair)
      setJokerMsg(pair)
      clearTimeout(jokerMsgTimer.current)
      jokerMsgTimer.current = setTimeout(() => setJokerMsg(null), 4000)
    }
  }

  // ── IPA ──────────────────────────────────────────────────────
  const [ipaA, setIpaA] = useState(null)
  const [ipaB, setIpaB] = useState(null)
  useEffect(() => {
    if (isClassroom) return undefined // Kiosk: keine Extra-IPA-Fetches
    const controller = new AbortController()
    const { signal } = controller
    // cancelled-Flag zusaetzlich zum Abort: eine bereits aufgeloeste Response
    // kann im Microtask noch setter() feuern, nachdem die Cleanup lief.
    let cancelled = false
    const fetchIpa = (word, setter) =>
      apiGet(`${API}/ipa?q=${encodeURIComponent(word)}`, { signal })
        .then(d => { if (!cancelled && d[0]?.ipa) setter(d[0].ipa) })
        .catch(err => { if (err.name !== 'AbortError') logError('IPA fetch (WZ) fehlgeschlagen', err, { word }) })
    fetchIpa(data.wortA, setIpaA)
    fetchIpa(data.wortB, setIpaB)
    return () => { cancelled = true; controller.abort() }
  }, [data.wortA, data.wortB, isClassroom])

  const bank  = order.filter(w => locations[w] === 'bank')
  const zoneA = order.filter(w => locations[w] === 'A')
  const zoneB = order.filter(w => locations[w] === 'B')

  const canSubmit = zoneA.length === 5 && zoneB.length === 5

  // Klassenraum: Entwurf (Zonen) bei jeder Änderung spiegeln → Reload-sicher (7.2).
  useEffect(() => {
    if (!isClassroom || typeof onProgress !== 'function') return
    onProgress({ zoneA, zoneB })
    // zoneA/zoneB leiten sich aus locations ab; order ist stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClassroom, locations])

  // ── Hilfsfunktionen ──────────────────────────────────────────
  function moveTo(word, zone) {
    const target = zone === 'A' ? zoneA : zoneB
    if (locations[word] !== zone && target.length >= 5) {
      setFullZone(zone)
      clearTimeout(fullZoneTimer.current)
      fullZoneTimer.current = setTimeout(() => setFullZone(null), 1500)
      return
    }
    setLocations(prev => ({ ...prev, [word]: zone }))
    setSelected(null)
  }

  function moveToBank(word) {
    setLocations(prev => ({ ...prev, [word]: 'bank' }))
    setSelected(null)
  }

  // ── dnd-kit Sensors (Mouse + Touch + Keyboard) ────────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragStart(event) {
    setActiveId(event.active.id)
    setSelected(null)
    resetJokerTimer()
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const word = active.id
    if (over.id === 'bank') moveToBank(word)
    else if (over.id === 'A' || over.id === 'B') moveTo(word, over.id)
  }

  function handleDragCancel() {
    setActiveId(null)
  }

  // ── Click-Flow (Tap-Tap für Keyboard/schnelle Auswahl) ────────
  function onChipClick(word) {
    if (selected === word) { setSelected(null); return }
    if (locations[word] !== 'bank') { moveToBank(word); return }
    setSelected(word)
  }

  function onZoneClick(zone) {
    if (!selected) return
    moveTo(selected, zone)
  }

  // ── Auswerten ─────────────────────────────────────────────────
  function handleSubmit() {
    if (!canSubmit) return
    if (isClassroom) {
      // Server-autoritativ: keine lokale Bewertung, eine Abgabe.
      if (submittedRef.current) return
      submittedRef.current = true
      onSubmit?.({ zoneA, zoneB })
      return
    }
    const zuordnungMap = Object.fromEntries(data.kollokatoren.map(k => [k.wort, k.zuordnung]))
    const score = computeScore(zoneA, zoneB, zuordnungMap)
    setPhase('results')
    onFinish?.({ score, zoneA, zoneB })
  }

  // ── Ergebnisansicht ───────────────────────────────────────────
  if (phase === 'results') {
    return <WzResultsView data={data} zoneA={zoneA} zoneB={zoneB} onBack={onBack} ipaA={ipaA} ipaB={ipaB} />
  }

  const remaining = 10 - zoneA.length - zoneB.length

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="screen wz-screen" onClick={resetJokerTimer}>
        {!isClassroom && (
          <button className="back-btn" type="button" onClick={onBack} aria-label="Zurück zur Startseite">
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
              <path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        <header className="wz-header" hidden={hideHeader} style={hideHeader ? { display: 'none' } : undefined}>
          <span className="wz-badge">Wort-Zwilling</span>
          <div className="wz-dict-pair">
            <div className="dict-entry-header">
              <h1 className="wz-title">{data.wortA}</h1>
              <div className="dict-entry-meta">
                {ipaA && <span className="lautschrift">[{ipaA}]</span>}
                {data.pos && <span className="dict-entry-wortart">{data.pos}</span>}
              </div>
              {(ipaA || data.pos) && <hr className="dict-entry-rule" aria-hidden="true" />}
            </div>
            <span className="wz-dict-vs" aria-hidden="true">·</span>
            <div className="dict-entry-header">
              <h1 className="wz-title">{data.wortB}</h1>
              <div className="dict-entry-meta">
                {ipaB && <span className="lautschrift">[{ipaB}]</span>}
                {data.pos && <span className="dict-entry-wortart">{data.pos}</span>}
              </div>
              {(ipaB || data.pos) && <hr className="dict-entry-rule" aria-hidden="true" />}
            </div>
          </div>
        </header>

        <p className="wz-instruction">
          Ordne die Kollokationen dem richtigen Wort zu.
          {!jokerUsed && jokerVisible && (
            <button
              className="joker-btn"
              type="button"
              onClick={e => { e.stopPropagation(); activateJoker() }}
              aria-label="Hinweis aktivieren"
              title="Hinweis"
            ><em>i</em></button>
          )}
        </p>

        {/* Zugängliche Ankündigung für "Zone voll" */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {fullZone ? `Zone ${fullZone === 'A' ? data.wortA : data.wortB} ist voll` : ''}
        </p>

        {jokerMsg && (
          <p className="wz-joker-msg" aria-live="polite">
            <em><strong>{jokerMsg[0]}</strong> und <strong>{jokerMsg[1]}</strong> gehören demselben Wort zu.</em>
          </p>
        )}

        {/* Wortbank */}
        <DroppableBank>
          {bank.length > 0
            ? bank.map(w => (
                <DraggableChip
                  key={w}
                  word={w}
                  selected={selected === w}
                  jokerCluster={jokerCluster?.includes(w)}
                  onClick={() => onChipClick(w)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onChipClick(w)}
                  ariaLabel={w}
                />
              ))
            : <p className="wz-bank-done">Alle Wörter zugeordnet <span aria-hidden="true">✓</span></p>
          }
        </DroppableBank>

        {/* Drop-Zonen */}
        <div className="wz-zones">
          {[['A', data.wortA, zoneA], ['B', data.wortB, zoneB]].map(([z, label, zone]) => (
            <DroppableZone
              key={z}
              id={z}
              label={label}
              chips={zone}
              jokerCluster={jokerCluster}
              isShaking={fullZone === z}
              isFull={zone.length >= 5}
              isClickable={!!selected && zone.length < 5}
              onZoneClick={() => onZoneClick(z)}
              onChipClick={onChipClick}
            />
          ))}
        </div>

        <button
          className="btn-primary btn-full"
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {canSubmit
            ? (isClassroom ? 'Abgeben' : 'Auswerten')
            : `Noch ${remaining} Wort${remaining !== 1 ? 'e' : ''} zuordnen`}
        </button>
      </div>

      {/* Floating chip während des Drags */}
      <DragOverlay>
        {activeId ? (
          <div className="wz-chip wz-chip--overlay">{activeId}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
