// Geteiltes Gerüst der interaktiven Aufgaben: Kopf (Prompt + Metasprache),
// Feedback-Block (datengestützt, niveauabhängig) und Beleg-Hinweis.
// Wörterbuch-Stil, kein Quiz-App-Lärm (Engine-Spec §8 „woerterbuch-nuechtern").

import { fillSelected } from './fmt'

/**
 * Aufgaben-Kopf: Format-Badge, Prompt, Metasprache-Chips.
 * index === false → Badge unterdrücken (der mobile Pager liefert die
 * fokussierbare „Aufgabe X von N"-Überschrift selbst, sonst doppelt).
 */
export function TaskHead({ task, index }) {
  const meta = task.metasprache ?? []
  return (
    <div className="course-task-head-block">
      {index !== false && (
        <div className="course-task-head">
          <span className="course-task-format">{index != null ? `Aufgabe ${index}` : 'Aufgabe'}</span>
        </div>
      )}
      <p className="course-task-prompt">{task.prompt}</p>
      {meta.length > 0 && (
        <ul className="course-task-tags" aria-label="Metasprache">
          {meta.map((m) => <li key={m} className="course-task-tag">{m}</li>)}
        </ul>
      )}
    </div>
  )
}

/** „Prüfen" / „Nochmal"-Leiste. */
export function TaskActions({ checked, canCheck, onCheck, onReset, checkLabel = 'Prüfen' }) {
  return (
    <div className="course-task-actions">
      {!checked ? (
        <button type="button" className="course-check-btn" disabled={!canCheck} onClick={onCheck}>
          {checkLabel}
        </button>
      ) : (
        <button type="button" className="course-reset-btn" onClick={onReset}>
          Nochmal
        </button>
      )}
    </div>
  )
}

/**
 * Datengestütztes Feedback nach der Abgabe.
 * @param {object} props
 * @param {object} props.task        aufgelöstes Item
 * @param {boolean|null} props.correct  true|false geschlossen bewertet; null = reine Selbstkontrolle
 * @param {object|null} props.selected  gewählte Option (füllt {{selected.*}})
 * @param {string} [props.choiceKey]    Options-Id für onChoice-Lookup
 * @param {boolean} [props.showRubric]  solution.rubric.criteria als Selbstkontrolle zeigen
 */
export function FeedbackBlock({ task, correct, selected = null, choiceKey, showRubric }) {
  const fb = task.feedback ?? {}
  const text = pickFeedback(fb, correct, selected, choiceKey)
  const rubric = task.solution?.rubric
  const beleg = task.beleghinweis

  const statusLabel = correct === true ? 'Richtig'
    : correct === false ? 'Noch nicht ganz'
    : 'Zur Selbstkontrolle'
  const statusClass = correct === true ? 'course-fb--correct'
    : correct === false ? 'course-fb--wrong'
    : 'course-fb--neutral'

  return (
    <div className={`course-feedback ${statusClass}`} role="status" aria-live="polite">
      <p className="course-fb-status">{statusLabel}</p>
      {text && <p className="course-fb-text">{text}</p>}

      {showRubric && rubric?.criteria?.length > 0 && (
        <div className="course-fb-rubric">
          <p className="course-fb-rubric-head">Erwartungshorizont — prüfe deine Begründung:</p>
          <ul className="course-fb-criteria">
            {rubric.criteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
          {rubric.accepts?.length > 0 && (
            <p className="course-fb-accepts">Auch ok: {rubric.accepts.join('; ')}.</p>
          )}
        </div>
      )}

      {fb.merksatz && <p className="course-fb-merksatz">„{fb.merksatz}"</p>}
      {beleg && <p className="course-fb-beleg">Beleg: {beleg}</p>}
    </div>
  )
}

/** Wählt onCorrect / onChoice / onWrong und füllt {{selected.*}}. */
function pickFeedback(fb, correct, selected, choiceKey) {
  if (correct === true) return fb.onCorrect ? fillSelected(fb.onCorrect, selected) : null
  if (correct === false) {
    const onChoice = fb.onChoice ?? {}
    const text = (choiceKey && onChoice[choiceKey]) || onChoice['@selected'] || fb.onWrong || null
    return text ? fillSelected(text, selected) : null
  }
  return null
}
