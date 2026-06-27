// Funktion zuweisen (Tippen → Label). Statt nur zu markieren weist die/der
// Lernende einzelnen Wörtern eine Funktion zu: S/P/O (Satzglieder) bzw.
// Kopf/Dependent (Dependenz). Bedienung: ein Label aus der Palette wählen, dann
// die zugehörigen Wörter antippen (erneut antippen entfernt das Label).
//
// Auswertung (Engine-Spec §11): exakt über solution.spans[].tokenRange+label,
// wenn Token-Indizes vorliegen (kuratierte Sätze). Liegt nur ein Wort→Label-
// Mapping vor (payload.labelWords, z. B. aus einem Korpus-Belegsatz ohne
// Token-Indizes), wird tolerant über Wortanfänge geprüft. Fehlt beides, bleibt
// es Selbstkontrolle mit aufgedecktem Erwartungsbild.

import { useMemo, useState, useEffect } from 'react'
import { TaskHead, TaskActions, FeedbackBlock, FeedbackRegion, BelegContext } from './TaskShell'

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

export default function LabelTask({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const sentence = task.payload?.sentence ?? ''
  const tokens = useMemo(() => tokenize(sentence), [sentence])
  const labels = task.payload?.labels ?? []
  const labelWords = task.payload?.labelWords ?? null

  // Erwartetes Token→Label-Bild aus den Lösungs-Spans (mit Token-Indizes).
  const expected = useMemo(() => {
    const byToken = new Map()
    const spans = task.solution?.spans ?? []
    let hasRange = false
    for (const s of spans) {
      if (Array.isArray(s.tokenRange) && s.tokenRange.length === 2 && s.label) {
        hasRange = true
        for (let i = s.tokenRange[0]; i < s.tokenRange[1]; i++) byToken.set(i, s.label)
      }
    }
    if (hasRange) return { byToken, mode: 'strict' }
    if (labelWords && Object.keys(labelWords).length > 0) return { byToken, mode: 'words' }
    return { byToken, mode: 'self' }
  }, [task, labelWords])

  const [activeLabel, setActiveLabel] = useState(labels[0] ?? null)
  const [assign, setAssign] = useState(() => ({})) // tokenIndex → label
  const [checked, setChecked] = useState(false)

  function tapToken(i) {
    if (checked || !activeLabel) return
    setAssign((prev) => {
      const next = { ...prev }
      if (next[i] === activeLabel) delete next[i]
      else next[i] = activeLabel
      return next
    })
  }

  const assignedCount = Object.keys(assign).length

  const result = useMemo(() => {
    if (!checked) return null
    if (expected.mode === 'strict') {
      // Jedes Token muss exakt sein erwartetes Label tragen (unbelegte: keins).
      for (let i = 0; i < tokens.length; i++) {
        const want = expected.byToken.get(i) ?? null
        const got = assign[i] ?? null
        if (want !== got) return { correct: false }
      }
      return { correct: true }
    }
    if (expected.mode === 'words') {
      // Jeder Eintrag labelWords[L]=Wort muss an einem passenden Token mit L
      // liegen; kein Token darf ein Label tragen, das nicht zu seinem Wort passt.
      for (const [label, word] of Object.entries(labelWords)) {
        const ok = tokens.some((tok, i) => assign[i] === label && matchesWord(tok, word))
        if (!ok) return { correct: false }
      }
      for (const [i, label] of Object.entries(assign)) {
        const word = labelWords[label]
        if (!word || !matchesWord(tokens[Number(i)], word)) return { correct: false }
      }
      return { correct: true }
    }
    return { correct: null } // Selbstkontrolle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  useEffect(() => {
    if (checked && result) onChecked?.(result.correct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])

  function reset() {
    setAssign({})
    setChecked(false)
    setActiveLabel(labels[0] ?? null)
  }

  // Nach dem Prüfen: erwartetes Label je Token (für Aufdeckung/Selbstkontrolle).
  const revealFor = (i) => {
    if (!checked) return null
    if (expected.mode === 'strict') return expected.byToken.get(i) ?? null
    if (expected.mode === 'words') {
      for (const [label, word] of Object.entries(labelWords)) {
        if (matchesWord(tokens[i], word)) return label
      }
    }
    return null
  }

  return (
    <div className="course-task course-task--label">
      <TaskHead task={task} index={index} />

      {labels.length > 0 && (
        <div className="course-label-palette" role="group" aria-label="Funktion wählen">
          {labels.map((l) => (
            <button
              key={l}
              type="button"
              className={`course-label-chip${activeLabel === l ? ' course-label-chip--active' : ''}`}
              aria-pressed={activeLabel === l}
              onClick={() => setActiveLabel(l)}
              disabled={checked}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {!checked && (
        <p className="course-hint">
          Wähle eine Funktion und tippe die zugehörigen Wörter an (erneut antippen entfernt sie).
        </p>
      )}

      <p className="course-label-sentence" aria-label="Satz">
        {tokens.map((tok, i) => {
          const mine = assign[i] ?? null
          const want = revealFor(i)
          const verdict = checked ? (mine === want ? ' course-label-token--ok' : ' course-label-token--bad') : ''
          return (
            <span key={i} className="course-label-token-wrap">
              <button
                type="button"
                className={`course-label-token${mine ? ' course-label-token--set' : ''}${verdict}`}
                onClick={() => tapToken(i)}
                disabled={checked}
                aria-label={`${tok}${mine ? ` – Funktion ${mine}` : ''}`}
              >
                {tok}
                {mine && <span className="course-label-badge" aria-hidden="true">{mine}</span>}
                {checked && want && want !== mine && (
                  <span className="course-label-badge course-label-badge--expected" aria-hidden="true">{want}</span>
                )}
              </button>
              {' '}
            </span>
          )
        })}
      </p>

      <TaskActions
        checked={checked}
        canCheck={assignedCount > 0}
        onCheck={() => setChecked(true)}
        onReset={reset}
        canReset={canRetry}
        lockedNote={lockedNote}
      />

      <FeedbackRegion>
        {checked && result && (
          <>
            {result.correct === null && (
              <p className="course-hint">Vergleiche deine Zuordnung mit den hervorgehobenen Wörtern.</p>
            )}
            <FeedbackBlock task={task} correct={result.correct} />
          </>
        )}
      </FeedbackRegion>

      {checked && <BelegContext belege={task.belegContext} />}
    </div>
  )
}
