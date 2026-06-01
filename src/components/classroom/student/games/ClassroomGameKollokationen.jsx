// Classroom-Variante des Kollokationen-Spiels.
//
// Optik 1:1 aus dem echten Spiel (Quiz.jsx / quiz.css): Badge → Headword →
// IPA → Aufgabentext → Optionsliste (.options-grid/.option) → Footer mit
// Auswahl-Zähler + Primär-Button. Bewusst NICHT Quiz.jsx selbst wiederverwendet
// (das haengt an Belege/Joker/3-Runden); hier nur die Schueler-Sicht: 10
// Optionen aus dem Server-Snapshot, max 3 Picks, rawAnswer { selected: [...] }.
//
// Reihenfolge: server hat schon gemischt — KEIN Re-Shuffle clientseitig.

import { useState } from 'react'

export default function ClassroomGameKollokationen({ lemma, prompt, onSubmit, submitting }) {
  const words = Array.isArray(prompt?.words) ? prompt.words : []
  const [picked, setPicked] = useState([])

  function toggle(w) {
    if (submitting) return
    setPicked((prev) => {
      if (prev.includes(w)) return prev.filter((x) => x !== w)
      if (prev.length >= 3) return prev
      return [...prev, w]
    })
  }

  function handleSubmit() {
    if (submitting || picked.length === 0) return
    onSubmit({ selected: picked })
  }

  return (
    <div className="screen quiz-screen" data-testid="cr2-kiosk-game-kollokationen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma?.lemma || ''}</h1>
        {lemma?.ipa ? <p className="quiz-instruction" style={{ fontStyle: 'italic' }}>[{lemma.ipa}]</p> : null}
        <p id="cr2-koll-instruction" className="quiz-instruction">
          Wähle die <strong>3 stärksten</strong> Kollokationen{lemma?.lemma ? <> von <strong>{lemma.lemma}</strong></> : ''}.
        </p>
      </header>

      <div className="options-grid-wrap">
        <div className="options-grid" aria-describedby="cr2-koll-instruction">
          {words.map((w, i) => {
            const isPicked = picked.includes(w)
            return (
              <button
                key={w}
                type="button"
                className={`option${isPicked ? ' selected' : ''}`}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => toggle(w)}
                aria-pressed={isPicked}
                data-testid={`cr2-kiosk-koll-choice-${w}`}
              >
                {w}
              </button>
            )
          })}
        </div>
      </div>

      <footer className="quiz-footer">
        <span className="select-count" aria-live="polite" aria-atomic="true">{picked.length} / 3 gewählt</span>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={submitting || picked.length === 0}
          data-testid="cr2-kiosk-koll-submit"
        >
          {submitting ? 'Sende …' : 'Abgeben'}
        </button>
      </footer>
    </div>
  )
}
