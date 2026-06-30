// Automatische Annotation (Station ④). Die „Maschine" (spaCy/DWDSmor) hat einen
// Satz ausgezeichnet – jedes Wort trägt das maschinelle Etikett (Grundform/
// Wortart/Abhängigkeit). Genau eine Auszeichnung ist falsch; die/der Lernende
// tippt das Wort mit dem Maschinenfehler an. Macht die Grenze der automatischen
// Annotation erfahrbar („die Maschine rät – und irrt"). Auswertung geschlossen
// über das wrong-Flag in payload.annotations.

import { useMemo, useState, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion } from './TaskShell'

export default function AnnotateTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const annotations = task.payload?.annotations ?? []
  const wrongIndex = useMemo(() => annotations.findIndex((a) => a.wrong), [annotations])

  const [pick, setPick] = useState(null)
  const [checked, setChecked] = useState(false)

  const result = useMemo(() => {
    if (!checked) return null
    if (wrongIndex < 0) return { correct: null }
    return { correct: pick === wrongIndex }
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

  return (
    <div className="course-task course-task--annotate">
      <TaskHead task={task} index={index} />

      <p className="course-annotate-sentence" aria-label="Vom Computer ausgezeichneter Satz">
        {annotations.map((a, i) => {
          const isPicked = pick === i
          const reveal = checked && i === wrongIndex
          const verdict = checked
            ? i === wrongIndex
              ? ' course-annotate-tok--wrong'
              : isPicked
                ? ' course-annotate-tok--miss'
                : ''
            : ''
          return (
            <button
              key={i}
              type="button"
              className={`course-annotate-tok${isPicked ? ' course-annotate-tok--sel' : ''}${verdict}`}
              onClick={() => { if (!checked) setPick(i) }}
              disabled={checked}
              aria-pressed={isPicked}
              aria-label={`${a.text} – Maschinen-Etikett ${a.tag}`}
            >
              <span className="course-annotate-word">{a.text}</span>
              <span className="course-annotate-tag">{a.tag}</span>
              {reveal && a.correctTag && (
                <span className="course-annotate-tag course-annotate-tag--fix">{a.correctTag}</span>
              )}
            </button>
          )
        })}
      </p>

      {!checked && (
        <p className="course-hint">Tippe das Wort an, dessen Etikett die Maschine falsch gesetzt hat.</p>
      )}

      <TaskActions
        checked={checked}
        canCheck={pick != null}
        onCheck={() => setChecked(true)}
        onReset={reset}
        canReset={canRetry}
        lockedNote={lockedNote}
      />

      <FeedbackRegion>
        {checked && result && <FeedbackBlock task={task} correct={result.correct} />}
      </FeedbackRegion>
    </div>
  )
}
