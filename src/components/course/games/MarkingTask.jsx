// F2 · Markieren. Klick auf Tokens des (echten) Satzes markiert die
// Wortverbindung. Auswertung: exakt über solution.spans[].tokenRange (statisch)
// oder tolerant über payload.targetWords (Korpus-Belegsatz ohne Token-Indizes,
// Engine-Spec §11.2). Reicht der Korpussatz nicht für eine exakte Prüfung,
// wird es zur Selbstkontrolle mit aufgedeckten Zielwörtern.

import { useMemo, useState } from 'react'
import { TaskHead, TaskActions, FeedbackBlock } from './TaskShell'

function tokenize(sentence) {
  return (sentence ?? '').split(/\s+/).filter(Boolean)
}
function normalize(token) {
  return token.toLowerCase().replace(/[.,;:!?»«"„""'’()«»]/g, '')
}
function matchesTarget(token, target) {
  const t = normalize(token)
  const g = String(target ?? '').toLowerCase()
  if (!t || !g) return false
  const n = Math.min(4, t.length, g.length)
  return t.slice(0, n) === g.slice(0, n)
}

export default function MarkingTask({ task, index }) {
  const sentence = task.payload?.sentence ?? ''
  const tokens = useMemo(() => tokenize(sentence), [sentence])
  const targetWords = task.payload?.targetWords ?? []

  // Erwartete Token-Indizes ermitteln.
  const expected = useMemo(() => {
    const set = new Set()
    const spans = task.solution?.spans ?? []
    let hasRange = false
    for (const s of spans) {
      if (Array.isArray(s.tokenRange) && s.tokenRange.length === 2) {
        hasRange = true
        for (let i = s.tokenRange[0]; i < s.tokenRange[1]; i++) set.add(i)
      }
    }
    if (hasRange) return { set, strict: true }
    // Tolerant: Zielwörter im Satz suchen.
    tokens.forEach((tok, i) => {
      if (targetWords.some((g) => matchesTarget(tok, g))) set.add(i)
    })
    return { set, strict: false }
  }, [task, tokens, targetWords])

  const [selected, setSelected] = useState(() => new Set())
  const [checked, setChecked] = useState(false)

  function toggle(i) {
    if (checked) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  const result = useMemo(() => {
    if (!checked) return null
    // Keine Erwartung ermittelbar → reine Selbstkontrolle.
    if (expected.set.size === 0) return { correct: null }
    if (selected.size !== expected.set.size) return { correct: false }
    for (const i of selected) if (!expected.set.has(i)) return { correct: false }
    return { correct: true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setSelected(new Set())
    setChecked(false)
  }

  return (
    <div className="course-task course-task--marking">
      <TaskHead task={task} index={index} />

      <p className="course-mark-sentence" aria-label="Satz zum Markieren">
        {tokens.map((tok, i) => {
          const isSel = selected.has(i)
          const reveal = checked && expected.set.has(i)
          return (
            <span key={i}>
              <button
                type="button"
                className={`course-mark-token${isSel ? ' course-mark-token--sel' : ''}${reveal ? ' course-mark-token--target' : ''}`}
                onClick={() => toggle(i)}
                disabled={checked}
                aria-pressed={isSel}
              >
                {tok}
              </button>
              {' '}
            </span>
          )
        })}
      </p>

      {!checked && targetWords.length === 0 && (
        <p className="course-hint">Tippe die Wörter an, die zusammengehören.</p>
      )}

      <TaskActions
        checked={checked}
        canCheck={selected.size > 0}
        onCheck={() => setChecked(true)}
        onReset={reset}
      />

      {checked && result && (
        <>
          {result.correct === null && targetWords.length > 0 && (
            <p className="course-hint">
              Erwartet: <strong>{targetWords.join(' … ')}</strong>
            </p>
          )}
          <FeedbackBlock task={task} correct={result.correct} />
        </>
      )}
    </div>
  )
}
