// F5 · Konkordanz-/Datenblick. Korpusdaten-Tabelle (Frequenz + logDice) lesen
// und deuten. pick-row-Fragen werden geschlossen bewertet (gegen
// solution.answers), explain/compare-Fragen sind Selbstkontrolle (Rubrik nach
// Abgabe). Kern der Häufig-≠-typisch-Einsicht (Station ④, Brücke aus ①).

import { useMemo, useState } from 'react'
import { TaskHead, TaskActions, FeedbackBlock } from './TaskShell'
import { fmtLogDice, fmtFrequency } from './fmt'

const COL_LABEL = { verbindung: 'Verbindung', frequency: 'Frequenz', logDice: 'logDice' }

function norm(s) {
  return String(s ?? '').toLowerCase().trim()
}
function rowMatchesAnswer(verbindung, answer) {
  const v = norm(verbindung); const a = norm(answer)
  if (!v || !a) return false
  return a === v || a.includes(v) || v.includes(a)
}

export default function DataTask({ task, index, onChecked }) {
  const table = task.payload?.table ?? []
  const columns = task.payload?.columns ?? ['verbindung', 'frequency', 'logDice']
  const questions = task.payload?.questions ?? []
  const answers = task.solution?.answers ?? {}

  // qid → ausgewählte Zeile (pick-row) bzw. Freitext (explain/compare)
  const [picks, setPicks] = useState({})
  const [texts, setTexts] = useState({})
  const [checked, setChecked] = useState(false)

  const pickRowQs = questions.filter((q) => q.kind === 'pick-row')
  const textQs = questions.filter((q) => q.kind !== 'pick-row')

  const canCheck =
    pickRowQs.every((q) => picks[q.id] != null) &&
    textQs.every((q) => (texts[q.id] ?? '').trim().length >= 3)

  const perQuestion = useMemo(() => {
    if (!checked) return {}
    const out = {}
    for (const q of pickRowQs) {
      const rowIdx = picks[q.id]
      const verbindung = table[rowIdx]?.verbindung
      out[q.id] = rowMatchesAnswer(verbindung, answers[q.id])
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  const allPicksCorrect = pickRowQs.length > 0 && pickRowQs.every((q) => perQuestion[q.id])

  function reset() {
    setPicks({})
    setTexts({})
    setChecked(false)
  }

  return (
    <div className="course-task course-task--data">
      <TaskHead task={task} index={index} />

      <div className="course-data-table-wrap">
        <table className="course-data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className={c === 'verbindung' ? '' : 'course-data-th-num'}>
                  {COL_LABEL[c] ?? c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className={c === 'verbindung' ? 'course-data-verb' : 'course-data-num'}>
                    {c === 'logDice' ? fmtLogDice(row.logDice)
                      : c === 'frequency' ? fmtFrequency(row.frequency)
                        : row.verbindung}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="course-questions">
        {questions.map((q) => (
          <li key={q.id} className="course-question">
            <p className="course-question-text">{q.text}</p>

            {q.kind === 'pick-row' ? (
              <div className="course-pickrow" role="radiogroup" aria-label={q.text}>
                {table.map((row, i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={picks[q.id] === i}
                    className={`course-pickrow-opt${picks[q.id] === i ? ' course-pickrow-opt--sel' : ''}`}
                    onClick={() => !checked && setPicks((p) => ({ ...p, [q.id]: i }))}
                    disabled={checked}
                  >
                    {row.verbindung}
                  </button>
                ))}
                {checked && (
                  <span className={`course-pickrow-mark ${perQuestion[q.id] ? 'course-fb--correct' : 'course-fb--wrong'}`}>
                    {perQuestion[q.id] ? 'richtig' : `erwartet: ${answers[q.id]}`}
                  </span>
                )}
              </div>
            ) : (
              <>
                <textarea
                  className="course-justify-input"
                  rows={3}
                  placeholder="Deine Deutung in 2–3 Sätzen …"
                  value={texts[q.id] ?? ''}
                  onChange={(e) => setTexts((t) => ({ ...t, [q.id]: e.target.value }))}
                  disabled={checked}
                />
                {checked && answers[q.id]?.rubric?.criteria?.length > 0 && (
                  <div className="course-fb-rubric">
                    <p className="course-fb-rubric-head">Erwartungshorizont — prüfe deine Deutung:</p>
                    <ul className="course-fb-criteria">
                      {answers[q.id].rubric.criteria.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ol>

      <TaskActions checked={checked} canCheck={canCheck} onCheck={() => { setChecked(true); onChecked?.() }} onReset={reset} />

      {checked && (
        <FeedbackBlock task={task} correct={pickRowQs.length > 0 ? allPicksCorrect : null} />
      )}
    </div>
  )
}
