// Classroom-Variante des Kollokationen-Spiels.
//
// Bewusst NICHT die alte Quiz.jsx wiederverwendet — die hängt an
// Belege/Joker/Storage und am 3-Runden-Multi-Lemma-Konstrukt der App.
// Hier nur, was die Schueler-Sicht braucht: 10 Optionen aus dem Server-
// Snapshot, max 3 Picks, rawAnswer { selected: [...] }.
//
// Reihenfolge: server hat schon gemischt — KEIN Re-Shuffle clientseitig,
// sonst widerspricht das dem snapshot-basierten Scoring.

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

  function rankOf(w) {
    const i = picked.indexOf(w)
    return i >= 0 ? i + 1 : null
  }

  function handleSubmit() {
    if (submitting || picked.length === 0) return
    onSubmit({ selected: picked })
  }

  return (
    <div className="cr2-kiosk__game" data-testid="cr2-kiosk-game-kollokationen">
      <p className="cr2-kiosk__lemma">{lemma?.lemma || ''}</p>
      {lemma?.ipa ? <p className="cr2-kiosk__ipa">[{lemma.ipa}]</p> : null}
      {prompt?.definition ? <p className="cr2-kiosk__definition">{prompt.definition}</p> : null}

      <p className="cr2-kiosk__hint">
        Wähle die drei besten Kollokationen (Reihenfolge zählt).
      </p>

      <ul className="cr2-kiosk__choices">
        {words.map((w) => {
          const r = rankOf(w)
          const picked_ = r != null
          return (
            <li
              key={w}
              className={`cr2-kiosk__choice ${picked_ ? 'cr2-kiosk__choice--picked' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => toggle(w)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(w) } }}
              data-testid={`cr2-kiosk-koll-choice-${w}`}
            >
              <span>{w}</span>
              {picked_ && <span className="cr2-kiosk__choice-rank">{r}.</span>}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        className="cr2-kiosk__btn cr2-kiosk__btn--primary"
        onClick={handleSubmit}
        disabled={submitting || picked.length === 0}
        data-testid="cr2-kiosk-koll-submit"
      >
        {submitting ? 'Sende …' : `Abgeben (${picked.length}/3)`}
      </button>
    </div>
  )
}
