// Verschiebeprobe am topologischen Feld (Feldermodell, Gallmann 2015). Die/der
// Lernende zieht (oder tippt) Satzglieder zwischen Mittelfeld und Vorfeld. Kern-
// einsicht: Im Aussagesatz (V2) steht GENAU EIN Satzglied im Vorfeld, das finite
// Verb bleibt fest an Position 2 (linke Satzklammer). So wird „Satzglied" über
// Verschiebbarkeit erfahrbar — statt die Probe zum Selbstzweck zu üben.
//
// Bedienung: Chunk antippen wählt ihn aus, dann Zielfeld antippen; oder Chunk
// per Pointer ins Vorfeld/Mittelfeld ziehen (Touch + Maus, ohne Fremd-Lib).
// Auswertung über solution.validVorfeld (Chunk-Ids, die je ALLEIN ein gültiges
// Vorfeld bilden) + die Ein-Satzglied-Regel.

import { useState, useMemo, useRef, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion } from './TaskShell'

const DRAG_THRESHOLD = 6

export default function VerschiebeTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const chunks = task.payload?.chunks ?? []
  const verb = task.payload?.verb ?? null
  const validVorfeld = useMemo(() => new Set(task.solution?.validVorfeld ?? []), [task])

  // chunkId → 'vorfeld' | 'mittelfeld' (Start: alles im Mittelfeld, Vorfeld leer)
  const [field, setField] = useState(() => Object.fromEntries(chunks.map((c) => [c.id, 'mittelfeld'])))
  const [picked, setPicked] = useState(null)
  const [checked, setChecked] = useState(false)
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)

  const inField = (z) => chunks.filter((c) => field[c.id] === z)
  const vorfeld = inField('vorfeld')
  const mittelfeld = inField('mittelfeld')

  function moveTo(chunkId, zone) {
    if (checked) return
    setField((prev) => ({ ...prev, [chunkId]: zone }))
    setPicked(null)
  }
  function placeInto(zone) {
    if (checked || !picked) return
    moveTo(picked, zone)
  }

  function zoneAtPoint(x, y) {
    const el = document.elementFromPoint(x, y)
    return el?.closest('[data-zone]')?.getAttribute('data-zone') ?? null
  }
  function onPointerDown(e, c) {
    if (checked) return
    dragRef.current = { id: c.id, text: c.text, startX: e.clientX, startY: e.clientY, active: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* egal */ }
  }
  function onPointerMove(e) {
    const d = dragRef.current
    if (!d) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return
      d.active = true
      setPicked(null)
    }
    setDrag({ id: d.id, text: d.text, x: e.clientX, y: e.clientY, hover: zoneAtPoint(e.clientX, e.clientY) })
  }
  function onPointerUp(e, c) {
    const d = dragRef.current
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* egal */ }
    if (d?.active) {
      const zone = zoneAtPoint(e.clientX, e.clientY)
      if (zone) moveTo(d.id, zone)
    } else {
      setPicked((p) => (p === c.id ? null : c.id))
    }
    setDrag(null)
  }
  function onPointerCancel() { dragRef.current = null; setDrag(null) }

  const result = useMemo(() => {
    if (!checked) return null
    if (vorfeld.length === 0) return { correct: false, reason: 'leer' }
    if (vorfeld.length > 1) return { correct: false, reason: 'mehrere' }
    const only = vorfeld[0]
    return { correct: validVorfeld.has(only.id), reason: validVorfeld.has(only.id) ? 'ok' : 'kein-satzglied', chunk: only }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  useEffect(() => {
    if (checked && result) onChecked?.(result.correct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setField(Object.fromEntries(chunks.map((c) => [c.id, 'mittelfeld'])))
    setPicked(null)
    setChecked(false)
    setDrag(null)
  }

  const dragging = !!drag
  const reasonText = {
    leer: 'Im Vorfeld steht noch nichts. Zieh ein Satzglied vor das Verb.',
    mehrere: 'Es steht mehr als ein Satzglied im Vorfeld. Im Aussagesatz passt dort genau eines.',
    'kein-satzglied': 'Das ist kein verschiebbares Satzglied — es lässt sich nicht als geschlossene Einheit ins Vorfeld stellen.',
  }

  return (
    <div className="course-task course-task--verschiebe">
      <TaskHead task={task} index={index} />

      {!checked && (
        <p className="course-hint">
          Ziehe genau ein Satzglied ins Vorfeld (vor das Verb). Das finite Verb bleibt an Position 2. (Oder tippe Karte und Feld nacheinander an.)
        </p>
      )}

      {/* Topologisches Feld: Vorfeld | linke Klammer (Verb) | Mittelfeld */}
      <div className="course-felder">
        <div
          className={`course-feld course-feld--vorfeld${picked || (dragging && drag.hover === 'vorfeld') ? ' course-feld--armed' : ''}`}
          data-zone="vorfeld"
          onClick={() => placeInto('vorfeld')}
        >
          <span className="course-feld-label">Vorfeld</span>
          <div className="course-feld-slot">
            {vorfeld.length === 0
              ? <span className="course-feld-empty">{picked || (dragging && drag.hover === 'vorfeld') ? 'hier ablegen' : '…'}</span>
              : vorfeld.map((c) => <Chunk key={c.id} c={c} picked={picked} checked={checked} onDown={onPointerDown} onMove={onPointerMove} onUp={onPointerUp} onCancel={onPointerCancel} setPicked={setPicked} />)}
          </div>
        </div>

        <div className="course-feld course-feld--klammer">
          <span className="course-feld-label">linke Klammer</span>
          <div className="course-feld-slot">
            <span className="course-chunk course-chunk--verb" aria-label={`finites Verb ${verb?.text}`}>{verb?.text}</span>
          </div>
        </div>

        <div
          className={`course-feld course-feld--mittelfeld${picked || (dragging && drag.hover === 'mittelfeld') ? ' course-feld--armed' : ''}`}
          data-zone="mittelfeld"
          onClick={() => placeInto('mittelfeld')}
        >
          <span className="course-feld-label">Mittelfeld</span>
          <div className="course-feld-slot">
            {mittelfeld.length === 0
              ? <span className="course-feld-empty">…</span>
              : mittelfeld.map((c) => <Chunk key={c.id} c={c} picked={picked} checked={checked} onDown={onPointerDown} onMove={onPointerMove} onUp={onPointerUp} onCancel={onPointerCancel} setPicked={setPicked} />)}
          </div>
        </div>
      </div>

      {dragging && (
        <span className="course-match-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.text}</span>
      )}

      <TaskActions
        checked={checked}
        canCheck={vorfeld.length > 0}
        onCheck={() => setChecked(true)}
        onReset={reset}
        canReset={canRetry}
        lockedNote={lockedNote}
      />

      <FeedbackRegion>
        {checked && result && (
          result.correct
            ? <FeedbackBlock task={task} correct={true} />
            : (
              <div className="course-feedback course-fb--wrong">
                <p className="course-fb-status">Noch nicht ganz</p>
                <p className="course-fb-text">{reasonText[result.reason] ?? 'Versuch es noch einmal.'}</p>
              </div>
            )
        )}
      </FeedbackRegion>
    </div>
  )
}

function Chunk({ c, picked, checked, onDown, onMove, onUp, onCancel, setPicked }) {
  return (
    <button
      type="button"
      aria-pressed={picked === c.id}
      className={`course-chunk${picked === c.id ? ' course-chunk--picked' : ''}`}
      onPointerDown={(e) => onDown(e, c)}
      onPointerMove={onMove}
      onPointerUp={(e) => onUp(e, c)}
      onPointerCancel={onCancel}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked((p) => (p === c.id ? null : c.id)) } }}
      disabled={checked}
    >
      {c.text}
    </button>
  )
}
