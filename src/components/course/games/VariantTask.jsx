// F3 · Variantenvergleich. Eine von zwei/mehr Varianten wählen, dann begründen
// (Freitext → Selbstkontrolle gegen solution.rubric, Engine-Spec §7). Geschlossen
// bewertet wird die Variantenwahl (solution.preferred); das Feedback ist
// datengestützt (logDice/Frequenz bei SekII+).

import { useMemo, useState } from 'react'
import { TaskHead, TaskActions, FeedbackBlock } from './TaskShell'
import { metricLabel } from './fmt'

export default function VariantTask({ task, index }) {
  const frame = task.payload?.frame ?? ''
  const variants = task.payload?.variants ?? []
  const requireJustification = task.payload?.requireJustification ?? false
  const preferred = task.solution?.preferred ?? []

  const [choice, setChoice] = useState(null)
  const [justification, setJustification] = useState('')
  const [checked, setChecked] = useState(false)

  const canCheck = !!choice && (!requireJustification || justification.trim().length >= 3)

  const result = useMemo(() => {
    if (!checked || !choice) return null
    const sel = variants.find((v) => v.id === choice) ?? null
    return { correct: preferred.includes(choice), selected: sel }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setChoice(null)
    setJustification('')
    setChecked(false)
  }

  const previewLabel = choice ? variants.find((v) => v.id === choice)?.label : null

  return (
    <div className="course-task course-task--variant">
      <TaskHead task={task} index={index} />

      {frame && (
        <p className="course-frame">
          {previewLabel ? frame.replace('___', `『${previewLabel}』`) : frame}
        </p>
      )}

      <div className="course-variants" role="radiogroup" aria-label="Varianten">
        {variants.map((v) => {
          const m = metricLabel(task.display, v)
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={choice === v.id}
              className={`course-variant${choice === v.id ? ' course-variant--sel' : ''}`}
              onClick={() => !checked && setChoice(v.id)}
              disabled={checked}
            >
              <span className="course-variant-label">{v.label}</span>
              {m && <span className="course-variant-metric">{m}</span>}
            </button>
          )
        })}
      </div>

      {requireJustification && (
        <label className="course-justify">
          <span className="course-justify-label">Begründung</span>
          <textarea
            className="course-justify-input"
            rows={2}
            placeholder="Warum klingt diese Variante natürlicher?"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            disabled={checked}
          />
        </label>
      )}

      <TaskActions checked={checked} canCheck={canCheck} onCheck={() => setChecked(true)} onReset={reset} />

      {checked && result && (
        <FeedbackBlock
          task={task}
          correct={result.correct}
          selected={result.selected}
          choiceKey={choice}
          showRubric={requireJustification}
        />
      )}
    </div>
  )
}
