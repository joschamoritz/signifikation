// Classroom-Variante der Zeitenwende.
//
// Reihenweise „vor 2000 / nach 2000". Statt Swipe (wie Singleplayer)
// einfache Buttons — funktioniert auch auf Tablets ohne Gesten-Tuning.
//
// rawAnswer: { answers: ['pre' | 'post', ...] }

import { useState } from 'react'

export default function ClassroomGameZeitenwende({ lemma, prompt, onSubmit, submitting }) {
  const words = Array.isArray(prompt?.words) ? prompt.words : []
  const [answers, setAnswers] = useState(() => new Array(words.length).fill(null))
  const [idx, setIdx]         = useState(0)

  function pick(periode) {
    if (submitting) return
    setAnswers((prev) => {
      const next = [...prev]
      next[idx] = periode
      return next
    })
    if (idx < words.length - 1) {
      setIdx(idx + 1)
    }
  }

  function back() {
    if (idx > 0) setIdx(idx - 1)
  }

  const allAnswered = answers.every((a) => a === 'pre' || a === 'post')

  function handleSubmit() {
    if (submitting) return
    onSubmit({ answers })
  }

  const currentWord = words[idx] || ''
  const current = answers[idx]

  return (
    <div className="cr2-kiosk__game" data-testid="cr2-kiosk-game-zeitenwende">
      <p className="cr2-kiosk__lemma">{lemma?.lemma || ''}</p>
      {lemma?.ipa ? <p className="cr2-kiosk__ipa">[{lemma.ipa}]</p> : null}

      <p className="cr2-kiosk__zw-progress">
        {idx + 1} / {words.length}
      </p>

      <div className="cr2-kiosk__zw-card">
        <p className="cr2-kiosk__zw-word">{currentWord}</p>
      </div>

      <div className="cr2-kiosk__zw-actions">
        <button
          type="button"
          className={`cr2-kiosk__zw-action ${current === 'pre' ? 'cr2-kiosk__zw-action--active-pre' : ''}`}
          onClick={() => pick('pre')}
          disabled={submitting}
          data-testid="cr2-kiosk-zw-pre"
        >
          ← vor 2000
        </button>
        <button
          type="button"
          className={`cr2-kiosk__zw-action ${current === 'post' ? 'cr2-kiosk__zw-action--active-post' : ''}`}
          onClick={() => pick('post')}
          disabled={submitting}
          data-testid="cr2-kiosk-zw-post"
        >
          nach 2000 →
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="cr2-kiosk__btn"
          style={{ background: 'transparent', color: 'var(--k-muted)', border: '1px solid var(--k-rule)', marginTop: 0 }}
          onClick={back}
          disabled={idx === 0 || submitting}
        >
          Zurück
        </button>
        <button
          type="button"
          className="cr2-kiosk__btn cr2-kiosk__btn--primary"
          style={{ marginTop: 0 }}
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          data-testid="cr2-kiosk-zw-submit"
        >
          {submitting ? 'Sende …' : 'Abgeben'}
        </button>
      </div>
    </div>
  )
}
