// Geteiltes Gerüst der interaktiven Aufgaben: Kopf (Prompt + Metasprache),
// Feedback-Block (datengestützt, niveauabhängig) und Beleg-Hinweis.
// Wörterbuch-Stil, kein Quiz-App-Lärm (Engine-Spec §8 „woerterbuch-nuechtern").

import { fillSelected } from './fmt'
import { NIVEAU_LABELS } from '../useGlobalNiveau'

/**
 * Aufgaben-Kopf: Format-Badge (als Überschrift), Prompt, Metasprache-Chips.
 * index === false → Badge unterdrücken (der mobile Pager liefert die
 * fokussierbare „Aufgabe X von N"-Überschrift selbst, sonst doppelt).
 *
 * Das Badge ist ein <h3>, damit Screenreader die Desktop-Aufgabenliste per
 * Überschrift navigieren können (Stationstitel = h2). Optik bleibt via
 * .course-task-format identisch.
 */
export function TaskHead({ task, index }) {
  const meta = task.metasprache ?? []
  const niveauLabel = task.level ? (NIVEAU_LABELS[task.level] ?? task.level) : null
  return (
    <div className="course-task-head-block">
      {index !== false && (
        <div className="course-task-head">
          <h3 className="course-task-format">{index != null ? `Aufgabe ${index}` : 'Aufgabe'}</h3>
          {niveauLabel && (
            <span className="course-task-niveau" title="Niveaustufe dieser Aufgabe">{niveauLabel}</span>
          )}
        </div>
      )}
      <p className="course-task-prompt">{task.prompt}</p>
      {meta.length > 0 && (
        <div className="course-task-tags-wrap">
          <span className="course-task-tags-label" aria-hidden="true">Fachbegriffe</span>
          <ul className="course-task-tags" aria-label="Fachbegriffe dieser Stufe">
            {meta.map((m) => <li key={m} className="course-task-tag">{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Dauerhaft gemountete Live-Region für das Aufgaben-Feedback. Sie liegt leer im
 * DOM und wird nach „Prüfen" befüllt — eine erst beim Prüfen gemountete
 * aria-live-Region wird von vielen Screenreadern verschluckt. Daher tragen die
 * Feedback-Blöcke darin selbst KEIN role/aria-live mehr.
 */
export function FeedbackRegion({ children }) {
  return (
    <div className="course-feedback-live" role="status" aria-live="polite">
      {children}
    </div>
  )
}

/**
 * „Prüfen" / „Nochmal"-Leiste.
 * @param {boolean} [props.canReset=true]  „Nochmal" anbieten? false → nach
 *   Abgabe gesperrt (kuratierte Aufgaben werden ans Konto gebunden und sind nur
 *   über den Reset im Profil neu spielbar). „Eigenes Lemma" bleibt frei (true).
 * @param {string} [props.lockedNote]  dezenter Hinweis statt „Nochmal".
 */
export function TaskActions({ checked, canCheck, onCheck, onReset, checkLabel = 'Prüfen', canReset = true, lockedNote = null }) {
  if (!checked) {
    return (
      <div className="course-task-actions">
        <button type="button" className="course-check-btn" disabled={!canCheck} onClick={onCheck}>
          {checkLabel}
        </button>
      </div>
    )
  }
  return (
    <div className="course-task-actions">
      {canReset ? (
        <button type="button" className="course-reset-btn" onClick={onReset}>
          Nochmal
        </button>
      ) : lockedNote ? (
        <p className="course-task-locked-note">{lockedNote}</p>
      ) : null}
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
    <div className={`course-feedback ${statusClass}`}>
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
