// F1 · Zuordnen (Matching). Tap-to-assign statt Drag&Drop — robuster auf
// Mobil und ohne Fremd-Lib. Tippe eine Karte, dann einen Anker; eine
// zugeordnete Karte tippen löst sie wieder.

import { useState, useMemo } from 'react'
import { TaskHead, TaskActions, FeedbackBlock } from './TaskShell'
import { metricLabel } from './fmt'

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
  const [picked, setPicked] = useState(null) // aktuell gewählte Pool-Karte
  const [checked, setChecked] = useState(false)

  const pool = candidates.filter((c) => !assignment[c.id])
  const assignedCount = Object.values(assignment).filter(Boolean).length

  const candsFor = (anchorId) => candidates.filter((c) => assignment[c.id] === anchorId)

  function placeInto(anchorId) {
    if (checked || !picked) return
    setAssignment((prev) => ({ ...prev, [picked]: anchorId }))
    setPicked(null)
  }
  function unassign(candId) {
    if (checked) return
    setAssignment((prev) => ({ ...prev, [candId]: null }))
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
    // fehlplatzierte Karte für {{selected.lemma}} (erste, die nirgends hingehört)
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
  }

  return (
    <div className="course-task course-task--matching">
      <TaskHead task={task} index={index} />

      <div className="course-match-anchors">
        {anchors.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`course-match-anchor${picked ? ' course-match-anchor--armed' : ''}`}
            onClick={() => placeInto(a.id)}
            disabled={checked || !picked}
          >
            <span className="course-match-anchor-label">{a.label}</span>
            <span className="course-match-anchor-slot">
              {candsFor(a.id).length === 0 ? (
                <span className="course-match-placeholder">{picked ? 'hier ablegen' : '…'}</span>
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
        ))}
      </div>

      <div className="course-match-pool" aria-label="Wählbare Partner">
        {pool.length === 0 && <span className="course-muted">Alle Karten zugeordnet.</span>}
        {pool.map((c) => {
          const m = metricLabel(task.display, c)
          return (
            <button
              key={c.id}
              type="button"
              className={`course-match-chip${picked === c.id ? ' course-match-chip--picked' : ''}`}
              onClick={() => setPicked(picked === c.id ? null : c.id)}
              disabled={checked}
            >
              {c.label}
              {m && <span className="course-match-metric">{m}</span>}
            </button>
          )
        })}
      </div>

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
