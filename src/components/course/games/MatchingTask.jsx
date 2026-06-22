// F1 · Zuordnen (Matching). Drag&Drop über Pointer-Events — funktioniert auf
// Touch UND Maus ohne Fremd-Lib. Ziehe eine Pool-Karte auf einen Anker. Als
// Barrierefrei-/Tastatur-Fallback bleibt Tap-to-assign: Karte antippen, dann
// Anker antippen; eine zugeordnete Karte antippen löst sie wieder.

import { useState, useMemo, useRef } from 'react'
import { TaskHead, TaskActions, FeedbackBlock } from './TaskShell'
import { metricLabel } from './fmt'

const DRAG_THRESHOLD = 6 // px, bevor aus einem Tap ein Zug wird

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

export default function MatchingTask({ task, index }) {
  const anchors = task.payload?.anchors ?? []
  const candidates = task.payload?.candidates ?? []
  const map = task.solution?.map ?? {}

  // candidateId → anchorId | null
  const [assignment, setAssignment] = useState({})
  const [picked, setPicked] = useState(null) // Tap-Fallback: gewählte Pool-Karte
  const [checked, setChecked] = useState(false)
  const [drag, setDrag] = useState(null) // aktiver Zug: { label, x, y, hover }

  const dragRef = useRef(null) // { candId, label, startX, startY, active }

  const pool = candidates.filter((c) => !assignment[c.id])
  const assignedCount = Object.values(assignment).filter(Boolean).length
  const candsFor = (anchorId) => candidates.filter((c) => assignment[c.id] === anchorId)

  function assign(candId, anchorId) {
    setAssignment((prev) => ({ ...prev, [candId]: anchorId }))
    setPicked(null)
  }
  function placeInto(anchorId) {
    if (checked || !picked) return
    assign(picked, anchorId)
  }
  function unassign(candId) {
    if (checked) return
    setAssignment((prev) => ({ ...prev, [candId]: null }))
  }

  function anchorIdAtPoint(x, y) {
    const el = document.elementFromPoint(x, y)
    return el?.closest('[data-anchor-id]')?.getAttribute('data-anchor-id') ?? null
  }

  // ── Pointer-Drag von Pool-Karten ──────────────────────────────────────
  function onPointerDown(e, cand) {
    if (checked) return
    dragRef.current = { candId: cand.id, label: cand.label, startX: e.clientX, startY: e.clientY, active: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* nicht kritisch */ }
  }
  function onPointerMove(e) {
    const d = dragRef.current
    if (!d) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return
      d.active = true
      setPicked(null)
    }
    setDrag({ candId: d.candId, label: d.label, x: e.clientX, y: e.clientY, hover: anchorIdAtPoint(e.clientX, e.clientY) })
  }
  function onPointerUp(e, cand) {
    const d = dragRef.current
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* nicht kritisch */ }
    if (d?.active) {
      const anchorId = anchorIdAtPoint(e.clientX, e.clientY)
      if (anchorId) assign(d.candId, anchorId)
    } else {
      // Kein Zug → Tap-Fallback: Karte (ab)wählen.
      setPicked((p) => (p === cand.id ? null : cand.id))
    }
    setDrag(null)
  }
  function onPointerCancel() {
    dragRef.current = null
    setDrag(null)
  }

  const result = useMemo(() => {
    if (!checked) return null
    let correct = true
    const expectedAll = new Set()
    for (const a of anchors) {
      const exp = new Set(map[a.id] ?? [])
      exp.forEach((id) => expectedAll.add(id))
      const act = new Set(candsFor(a.id).map((c) => c.id))
      if (!setsEqual(exp, act)) correct = false
    }
    let misplaced = null
    for (const [candId, anchorId] of Object.entries(assignment)) {
      if (anchorId && !expectedAll.has(candId)) {
        correct = false
        if (!misplaced) misplaced = candidates.find((c) => c.id === candId) ?? null
      }
    }
    return { correct, selected: misplaced }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setAssignment({})
    setPicked(null)
    setChecked(false)
    setDrag(null)
  }

  const dragging = !!drag

  return (
    <div className="course-task course-task--matching">
      <TaskHead task={task} index={index} />

      {!checked && (
        <p className="course-hint">
          Ziehe eine Karte auf das Feld, in das sie gehört — oder tippe Karte und Feld nacheinander an.
        </p>
      )}

      <div className="course-match-anchors">
        {anchors.map((a) => {
          const armed = picked || (dragging && drag.hover === a.id)
          return (
            <button
              key={a.id}
              type="button"
              data-anchor-id={a.id}
              className={`course-match-anchor${armed ? ' course-match-anchor--armed' : ''}${dragging && drag.hover === a.id ? ' course-match-anchor--over' : ''}`}
              onClick={() => placeInto(a.id)}
              disabled={checked}
            >
              <span className="course-match-anchor-label">{a.label}</span>
              <span className="course-match-anchor-slot">
                {candsFor(a.id).length === 0 ? (
                  <span className="course-match-placeholder">{armed ? 'hier ablegen' : '…'}</span>
                ) : (
                  candsFor(a.id).map((c) => (
                    <span
                      key={c.id}
                      className="course-match-chip course-match-chip--placed"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); unassign(c.id) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); unassign(c.id) } }}
                    >
                      {c.label}
                    </span>
                  ))
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="course-match-pool" aria-label="Wählbare Partner">
        {pool.length === 0 && <span className="course-muted">Alle Karten zugeordnet.</span>}
        {pool.map((c) => {
          const m = metricLabel(task.display, c)
          const isDragged = dragging && drag.candId === c.id
          return (
            <button
              key={c.id}
              type="button"
              className={`course-match-chip course-match-chip--pool${picked === c.id ? ' course-match-chip--picked' : ''}${isDragged ? ' course-match-chip--dragging' : ''}`}
              onPointerDown={(e) => onPointerDown(e, c)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, c)}
              onPointerCancel={onPointerCancel}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked((p) => (p === c.id ? null : c.id)) } }}
              disabled={checked}
            >
              {c.label}
              {m && <span className="course-match-metric">{m}</span>}
            </button>
          )
        })}
      </div>

      {dragging && (
        <span className="course-match-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {drag.label}
        </span>
      )}

      <TaskActions
        checked={checked}
        canCheck={assignedCount > 0}
        onCheck={() => setChecked(true)}
        onReset={reset}
      />

      {checked && result && (
        <FeedbackBlock task={task} correct={result.correct} selected={result.selected} />
      )}
    </div>
  )
}
