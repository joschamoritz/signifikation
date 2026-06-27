// F4 · Lücke + begründete Auswahl. Beste Option für die Lücke im (echten) Satz
// wählen und begründen. Geschlossene Bewertung über solution.correctOptionId,
// optionsspezifisches Feedback über feedback.onChoice; Begründung = Selbst-
// kontrolle gegen solution.rubric.

import { useMemo, useState, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion } from './TaskShell'
import { metricLabel, seededShuffle } from './fmt'

export default function GapTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const sentence = task.payload?.sentence ?? ''
  // Optionen deterministisch mischen (Auswertung per Id → Position egal).
  const options = useMemo(
    () => seededShuffle(task.payload?.options ?? [], task.id),
    [task.id],
  )
  const requireJustification = task.payload?.requireJustification ?? false
  const correctId = task.solution?.correctOptionId ?? null
  // Begründungs-Frage aus den Aufgabendaten; neutraler Default statt der früher
  // hartkodierten „… am typischsten?"-Frage (passte nicht zu Grammatik-Aufgaben).
  const justifyPrompt = task.payload?.justifyPrompt ?? 'Begründe deine Wahl in ein, zwei Sätzen.'

  const [choice, setChoice] = useState(null)
  const [justification, setJustification] = useState('')
  const [checked, setChecked] = useState(false)

  const canCheck = !!choice && (!requireJustification || justification.trim().length >= 3)
  const chosenLabel = choice ? options.find((o) => o.id === choice)?.label : null

  const result = useMemo(() => {
    if (!checked || !choice) return null
    const sel = options.find((o) => o.id === choice) ?? null
    return { correct: choice === correctId, selected: sel }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  // Geschlossene Bewertung ist die Optionswahl (Begründung = Selbstkontrolle).
  useEffect(() => {
    if (checked && result) onChecked?.(result.correct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setChoice(null)
    setJustification('')
    setChecked(false)
  }

  // Satz mit gefüllter Lücke (oder leerem Feld) rendern.
  const [gapBefore, gapAfter] = sentence.includes('___')
    ? sentence.split('___')
    : [sentence, '']

  return (
    <div className="course-task course-task--gap">
      <TaskHead task={task} index={index} />

      <p className="course-frame">
        {gapBefore}
        {sentence.includes('___') && (
          <span className={`course-gap${chosenLabel ? ' course-gap--filled' : ''}`}>
            {chosenLabel ?? ' '}
          </span>
        )}
        {gapAfter}
      </p>

      <div className="course-variants" role="radiogroup" aria-label="Optionen">
        {options.map((o) => {
          const m = metricLabel(task.display, o)
          return (
            <label
              key={o.id}
              className={`course-variant${choice === o.id ? ' course-variant--sel' : ''}`}
            >
              <input
                type="radio"
                className="course-radio-input"
                name={`gap-${task.id}`}
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                disabled={checked}
              />
              <span className="course-variant-label">{o.label}</span>
              {m && <span className="course-variant-metric">{m}</span>}
            </label>
          )
        })}
      </div>

      {requireJustification && (
        <label className="course-justify">
          <span className="course-justify-label">Begründung</span>
          <textarea
            className="course-justify-input"
            rows={2}
            placeholder={justifyPrompt}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            disabled={checked}
          />
        </label>
      )}

      <TaskActions checked={checked} canCheck={canCheck} onCheck={() => setChecked(true)} onReset={reset} canReset={canRetry} lockedNote={lockedNote} />

      <FeedbackRegion>
        {checked && result && (
          <FeedbackBlock
            task={task}
            correct={result.correct}
            selected={result.selected}
            choiceKey={choice}
            showRubric={requireJustification}
          />
        )}
      </FeedbackRegion>
    </div>
  )
}
