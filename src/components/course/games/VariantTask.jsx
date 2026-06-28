// F3 · Variantenvergleich. Eine von zwei/mehr Varianten wählen, dann begründen
// (Freitext → Selbstkontrolle gegen solution.rubric, Engine-Spec §7). Geschlossen
// bewertet wird die Variantenwahl (solution.preferred); das Feedback ist
// datengestützt (logDice/Frequenz bei SekII+).

import { useMemo, useState, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion, BelegContext } from './TaskShell'
import { metricLabel, seededShuffle } from './fmt'

export default function VariantTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const frame = task.payload?.frame ?? ''
  // Varianten deterministisch mischen, damit die typische nicht stets vorn steht
  // (Auswertung per Id → Position egal).
  const variants = useMemo(
    () => seededShuffle(task.payload?.variants ?? [], task.id),
    [task.id],
  )
  const requireJustification = task.payload?.requireJustification ?? false
  // Single-Choice-Begründung (Sek I): ankreuzbare Begründung statt Freitext.
  // Optionen ebenfalls mischen (sonst ist die richtige Begründung stets r1).
  const justifyChoice = useMemo(() => {
    const jc = task.payload?.justificationChoice ?? null
    if (!jc) return null
    return { ...jc, options: seededShuffle(jc.options ?? [], `${task.id}:reason`) }
  }, [task.id, task.payload?.justificationChoice])
  const preferred = task.solution?.preferred ?? []

  const [choice, setChoice] = useState(null)
  const [justification, setJustification] = useState('')
  const [reason, setReason] = useState(null)
  const [checked, setChecked] = useState(false)

  const canCheck = !!choice && (
    justifyChoice ? !!reason
      : (!requireJustification || justification.trim().length >= 3)
  )

  const result = useMemo(() => {
    if (!checked || !choice) return null
    const sel = variants.find((v) => v.id === choice) ?? null
    return { correct: preferred.includes(choice), selected: sel }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  // Geschlossene Bewertung ist die Variantenwahl (Begründung = Selbstkontrolle).
  useEffect(() => {
    if (checked && result) onChecked?.(result.correct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  const reasonResult = justifyChoice
    ? justifyChoice.options.find((o) => o.id === reason) ?? null
    : null

  function reset() {
    setChoice(null)
    setJustification('')
    setReason(null)
    setChecked(false)
  }

  const previewLabel = choice ? variants.find((v) => v.id === choice)?.label : null

  return (
    <div className="course-task course-task--variant">
      <TaskHead task={task} index={index} />

      {frame && (
        <p className="course-frame">
          {frame.includes('___')
            ? (() => {
                const [before, after] = frame.split('___')
                return (
                  <>
                    {before}
                    <span className={`course-gap${previewLabel ? ' course-gap--filled' : ''}`}>
                      {previewLabel ?? ' '}
                    </span>
                    {after}
                  </>
                )
              })()
            : frame}
        </p>
      )}

      <div className="course-variants" role="radiogroup" aria-label="Varianten">
        {variants.map((v) => {
          const m = metricLabel(task.display, v)
          return (
            <label
              key={v.id}
              className={`course-variant${choice === v.id ? ' course-variant--sel' : ''}`}
            >
              <input
                type="radio"
                className="course-radio-input"
                name={`variant-${task.id}`}
                value={v.id}
                checked={choice === v.id}
                onChange={() => setChoice(v.id)}
                disabled={checked}
              />
              <span className="course-variant-label">{v.label}</span>
              {m && <span className="course-variant-metric">{m}</span>}
            </label>
          )
        })}
      </div>

      {justifyChoice ? (
        <fieldset className="course-justify-choice" disabled={checked}>
          <legend className="course-justify-label">
            {justifyChoice.prompt ?? 'Warum passt das besser?'}
          </legend>
          <div className="course-variants" role="radiogroup" aria-label="Begründung wählen">
            {justifyChoice.options.map((o) => (
              <label
                key={o.id}
                className={`course-variant${reason === o.id ? ' course-variant--sel' : ''}`}
              >
                {/* disabled erbt das umschließende <fieldset disabled={checked}>. */}
                <input
                  type="radio"
                  className="course-radio-input"
                  name={`justify-${task.id}`}
                  value={o.id}
                  checked={reason === o.id}
                  onChange={() => setReason(o.id)}
                />
                <span className="course-variant-label">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : requireJustification ? (
        <label className="course-justify">
          <span className="course-justify-label">Begründung</span>
          <textarea
            className="course-justify-input"
            rows={2}
            placeholder="Begründe deine Wahl in ein, zwei Sätzen."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            disabled={checked}
          />
        </label>
      ) : null}

      <TaskActions checked={checked} canCheck={canCheck} onCheck={() => setChecked(true)} onReset={reset} canReset={canRetry} lockedNote={lockedNote} />

      <FeedbackRegion>
        {checked && result && (
          <FeedbackBlock
            task={task}
            correct={result.correct}
            selected={result.selected}
            choiceKey={choice}
            showRubric={requireJustification && !justifyChoice}
          />
        )}

        {checked && justifyChoice && reasonResult && (
          <div className={`course-feedback ${reasonResult.correct ? 'course-fb--correct' : 'course-fb--wrong'}`}>
            <p className="course-fb-status">{reasonResult.correct ? 'Begründung passt' : 'Begründung — noch nicht ganz'}</p>
            <p className="course-fb-text">
              {reasonResult.feedback
                ?? (reasonResult.correct
                  ? 'Genau diese Begründung trägt.'
                  : `Treffender wäre: „${justifyChoice.options.find((o) => o.correct)?.label}".`)}
            </p>
          </div>
        )}
      </FeedbackRegion>

      {checked && <BelegContext belege={task.belegContext} />}
    </div>
  )
}
