// F1 · Zuordnen (Matching). Drag&Drop über Pointer-Events — funktioniert auf
// Touch UND Maus ohne Fremd-Lib. Ziehe eine Pool-Karte auf einen Anker. Als
// Barrierefrei-/Tastatur-Fallback bleibt Tap-to-assign: Karte antippen, dann
// Anker antippen; eine zugeordnete Karte antippen löst sie wieder.

import { useState, useMemo, useRef, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion, BelegContext } from './TaskShell'
import { metricLabel, seededShuffle } from './fmt'

const DRAG_THRESHOLD = 6 // px, bevor aus einem Tap ein Zug wird

export default function MatchingTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const anchors = task.payload?.anchors ?? []
  // Pool deterministisch mischen, damit die Karten nicht in Anker-/Alphabet-
  // Reihenfolge stehen (Lösung wird per Id geprüft → Position egal).
  const candidates = useMemo(
    () => seededShuffle(task.payload?.candidates ?? [], task.id),
    [task.id],
  )
  const map = task.solution?.map ?? {}
  const multiplePerAnchor = task.payload?.multiplePerAnchor ?? false

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
    // Falsch platziert = im falschen Anker (nicht in dessen Lösungsmenge).
    let wrong = null
    for (const [candId, anchorId] of Object.entries(assignment)) {
      if (!anchorId) continue
      if (!(map[anchorId] ?? []).includes(candId) && !wrong) {
        wrong = candidates.find((c) => c.id === candId) ?? null
      }
    }
    // Fehlend = erwarteter Partner, der (noch) nicht im richtigen Anker liegt.
    let missingCount = 0
    for (const a of anchors) {
      const placed = new Set(candsFor(a.id).map((c) => c.id))
      for (const id of (map[a.id] ?? [])) if (!placed.has(id)) missingCount++
    }
    return { allCorrect: !wrong && missingCount === 0, wrong, missingCount }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  // Ergebnis (richtig/falsch) nach „Prüfen" melden — Persistenz + Pager-Zählung.
  useEffect(() => {
    if (checked && result) onChecked?.(result.allCorrect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  // Liegt eine platzierte Karte im richtigen Anker? (für Einfärbung nach Prüfen)
  const isChipCorrect = (anchorId, candId) => (map[anchorId] ?? []).includes(candId)

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
          Ziehe jeden Partner auf das passende Feld{multiplePerAnchor ? ' — es können mehrere sein' : ''}. (Oder tippe Karte und Feld nacheinander an.)
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
                  candsFor(a.id).map((c) => {
                    const verdict = checked ? (isChipCorrect(a.id, c.id) ? ' course-match-chip--ok' : ' course-match-chip--bad') : ''
                    return (
                      <span
                        key={c.id}
                        className={`course-match-chip course-match-chip--placed${verdict}`}
                        role="button"
                        tabIndex={checked ? -1 : 0}
                        aria-label={`${c.label} – Zuordnung lösen`}
                        onClick={(e) => { e.stopPropagation(); unassign(c.id) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); unassign(c.id) } }}
                      >
                        {c.label}
                        {checked && <span className="course-match-verdict" aria-hidden="true">{isChipCorrect(a.id, c.id) ? '✓' : '✗'}</span>}
                      </span>
                    )
                  })
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
              aria-pressed={picked === c.id}
              aria-label={`${c.label}${picked === c.id ? ' – ausgewählt, Feld zum Ablegen antippen' : ' – zum Zuordnen auswählen'}`}
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
        canReset={canRetry}
        lockedNote={lockedNote}
      />

      <FeedbackRegion>
        {checked && result && (
          result.allCorrect ? (
            <FeedbackBlock task={task} correct={true} />
          ) : result.wrong ? (
            <FeedbackBlock task={task} correct={false} selected={result.wrong} />
          ) : (
            <div className="course-feedback course-fb--wrong">
              <p className="course-fb-status">Fast</p>
              <p className="course-fb-text">
                Was du zugeordnet hast, stimmt — aber es {result.missingCount === 1
                  ? 'fehlt noch ein typischer Partner'
                  : `fehlen noch ${result.missingCount} typische Partner`}. Zieh ihn dazu.
              </p>
            </div>
          )
        )}
      </FeedbackRegion>

      {checked && <BelegContext belege={task.belegContext} />}
    </div>
  )
}
