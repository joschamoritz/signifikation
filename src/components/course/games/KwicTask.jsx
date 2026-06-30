// Konkordanz lesen (Station ④/⑤). Mehrere echte Belegzeilen aus dem Korpus
// (KWIC – keyword in context) bilden den Aufgabenkörper: Das Suchwort (node)
// ist in jeder Zeile hervorgehoben; die/der Lernende liest die Belege und wählt
// das Wort, das in (fast) allen Zeilen mit dem Suchwort zusammen vorkommt.
// Auswertung geschlossen gegen solution.correctOptionId. Kein Maß nötig (DaZ/
// SekI) – die Beobachtung am echten Text trägt die Einsicht (data-driven).

import { useMemo, useState, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion } from './TaskShell'
import { metricLabel } from './fmt'

function tokenize(sentence) {
  return (sentence ?? '').split(/\s+/).filter(Boolean)
}
function normalize(token) {
  return token.toLowerCase().replace(/[.,;:!?»«"„“”'’()]/g, '')
}
function matchesWord(token, word) {
  const t = normalize(token)
  const g = String(word ?? '').toLowerCase()
  if (!t || !g) return false
  const n = Math.min(4, t.length, g.length)
  return t.slice(0, n) === g.slice(0, n)
}

export default function KwicTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const lines = task.payload?.lines ?? []
  const node = task.payload?.node ?? ''
  const options = task.payload?.options ?? []
  const correctId = task.solution?.correctOptionId ?? null
  // Wort, das nach dem Prüfen in den Belegen hervorgehoben wird (Auflösung).
  const revealWord = useMemo(
    () => options.find((o) => o.id === correctId)?.label ?? null,
    [options, correctId],
  )

  const [pick, setPick] = useState(null)
  const [checked, setChecked] = useState(false)

  const result = useMemo(() => {
    if (!checked) return null
    if (correctId == null) return { correct: null }
    return { correct: pick === correctId }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  useEffect(() => {
    if (checked && result) onChecked?.(result.correct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setPick(null)
    setChecked(false)
  }

  const selectedOption = options.find((o) => o.id === pick) ?? null

  return (
    <div className="course-task course-task--kwic">
      <TaskHead task={task} index={index} />

      <ul className="course-kwic-lines" aria-label="Belegzeilen aus dem Korpus">
        {lines.map((line, i) => (
          <li key={i} className="course-kwic-line">
            <span className="course-kwic-satz">
              {tokenize(line.satz).map((tok, j) => {
                const isNode = matchesWord(tok, node)
                const isReveal = checked && revealWord && matchesWord(tok, revealWord)
                const cls = isNode
                  ? 'course-kwic-node'
                  : isReveal
                    ? 'course-kwic-reveal'
                    : ''
                return (
                  <span key={j}>
                    {cls ? <mark className={cls}>{tok}</mark> : tok}{' '}
                  </span>
                )
              })}
            </span>
            {line.quelle && <span className="course-kwic-quelle">{line.quelle}</span>}
          </li>
        ))}
      </ul>

      {lines.length === 0 && (
        <p className="course-muted">Keine Belegzeilen verfügbar.</p>
      )}

      <div className="course-kwic-options" role="radiogroup" aria-label="Welches Wort steht fast immer dabei?">
        {options.map((o) => {
          const m = metricLabel(task.display, o)
          const verdict = checked
            ? o.id === correctId
              ? ' course-kwic-opt--ok'
              : pick === o.id
                ? ' course-kwic-opt--bad'
                : ''
            : ''
          return (
            <label key={o.id} className={`course-kwic-opt${pick === o.id ? ' course-kwic-opt--sel' : ''}${verdict}`}>
              <input
                type="radio"
                className="course-radio-input"
                name={`kwic-${task.id}`}
                checked={pick === o.id}
                onChange={() => setPick(o.id)}
                disabled={checked}
              />
              {o.label}
              {m && <span className="course-kwic-opt-metric">{m}</span>}
            </label>
          )
        })}
      </div>

      <TaskActions
        checked={checked}
        canCheck={pick != null}
        onCheck={() => setChecked(true)}
        onReset={reset}
        canReset={canRetry}
        lockedNote={lockedNote}
      />

      <FeedbackRegion>
        {checked && result && (
          <FeedbackBlock
            task={task}
            correct={result.correct}
            selected={selectedOption}
            choiceKey={pick}
          />
        )}
      </FeedbackRegion>
    </div>
  )
}
