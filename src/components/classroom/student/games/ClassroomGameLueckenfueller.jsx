// Classroom-Variante des Lueckenfueller.
//
// Server liefert pro /me/view nur die AKTUELLE Sub-Runde
// (prompt.currentRound, prompt.roundIndex). Nach jeder Submission
// pusht der Server view:updated → /me/view → naechste Runde sichtbar.
//
// Drei Runden-Typen:
//   'choice'  – Multiple-Choice, eine Option waehlen
//   'double'  – zwei Saetze, je eine Eingabe
//   'free'    – freie Texteingabe
//
// rawAnswer:
//   choice → { selected: 'wort' }
//   double → { answers: ['w1', 'w2'] }
//   free   → { value:    'eingabe' }

import { useState } from 'react'

function ChoiceRound({ round, submitting, onSubmit }) {
  const [picked, setPicked] = useState(null)
  const options = Array.isArray(round?.options) ? round.options : []
  const sentence = round?.sentence || ''
  function handle() {
    if (submitting || !picked) return
    onSubmit({ selected: picked })
  }
  return (
    <>
      <p className="cr2-kiosk__lf-sentence">
        {sentence.includes('_____')
          ? sentence.split('_____').map((p, i, arr) => (
              <span key={i}>{p}{i < arr.length - 1 && <span className="cr2-kiosk__lf-blank">{picked || ' '}</span>}</span>
            ))
          : sentence}
      </p>
      <ul className="cr2-kiosk__choices">
        {options.map((opt) => (
          <li
            key={opt}
            className={`cr2-kiosk__choice ${picked === opt ? 'cr2-kiosk__choice--picked' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setPicked(opt)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(opt) } }}
            data-testid={`cr2-kiosk-lf-choice-${opt}`}
          >
            <span>{opt}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="cr2-kiosk__btn cr2-kiosk__btn--primary"
        onClick={handle}
        disabled={submitting || !picked}
        data-testid="cr2-kiosk-lf-submit"
      >
        {submitting ? 'Sende …' : 'Abgeben'}
      </button>
    </>
  )
}

function DoubleRound({ round, submitting, onSubmit }) {
  const sentences = Array.isArray(round?.sentences) ? round.sentences : []
  const [answers, setAnswers] = useState(() => new Array(sentences.length).fill(''))

  function handle() {
    if (submitting) return
    onSubmit({ answers })
  }

  return (
    <>
      {sentences.map((s, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <p className="cr2-kiosk__lf-sentence">{s.text || s.sentence || ''}</p>
          <input
            type="text"
            className="cr2-kiosk__input"
            style={{ fontSize: '1.05rem', textAlign: 'left' }}
            value={answers[i] || ''}
            onChange={(e) => setAnswers((prev) => {
              const next = [...prev]
              next[i] = String(e.target.value || '').slice(0, 60)
              return next
            })}
            placeholder="Wort eintippen"
            disabled={submitting}
            data-testid={`cr2-kiosk-lf-double-input-${i}`}
          />
        </div>
      ))}
      <button
        type="button"
        className="cr2-kiosk__btn cr2-kiosk__btn--primary"
        onClick={handle}
        disabled={submitting || answers.some((a) => !a.trim())}
        data-testid="cr2-kiosk-lf-submit"
      >
        {submitting ? 'Sende …' : 'Abgeben'}
      </button>
    </>
  )
}

function FreeRound({ round, submitting, onSubmit }) {
  const [value, setValue] = useState('')
  const sentence = round?.sentence || ''
  function handle() {
    if (submitting || !value.trim()) return
    onSubmit({ value: value.trim() })
  }
  return (
    <>
      <p className="cr2-kiosk__lf-sentence">{sentence}</p>
      <input
        type="text"
        className="cr2-kiosk__input"
        style={{ fontSize: '1.1rem', textAlign: 'left' }}
        value={value}
        onChange={(e) => setValue(String(e.target.value || '').slice(0, 60))}
        placeholder="Wort eintippen"
        disabled={submitting}
        data-testid="cr2-kiosk-lf-free-input"
      />
      <button
        type="button"
        className="cr2-kiosk__btn cr2-kiosk__btn--primary"
        onClick={handle}
        disabled={submitting || !value.trim()}
        data-testid="cr2-kiosk-lf-submit"
      >
        {submitting ? 'Sende …' : 'Abgeben'}
      </button>
    </>
  )
}

export default function ClassroomGameLueckenfueller({ lemma, prompt, onSubmit, submitting }) {
  const round = prompt?.currentRound || null
  const roundIndex = prompt?.roundIndex ?? 0

  function handleSubmit(rawAnswer) {
    onSubmit(rawAnswer, { roundIndex })
  }

  return (
    <div className="cr2-kiosk__game" data-testid="cr2-kiosk-game-lueckenfueller">
      <p className="cr2-kiosk__lemma">{lemma?.lemma || ''}</p>
      {lemma?.ipa ? <p className="cr2-kiosk__ipa">[{lemma.ipa}]</p> : null}
      <p className="cr2-kiosk__hint">Runde {roundIndex + 1}</p>

      {!round && <p className="cr2-kiosk__hint">Keine Runde verfügbar.</p>}
      {round?.type === 'choice'  && <ChoiceRound  round={round} submitting={submitting} onSubmit={handleSubmit} />}
      {round?.type === 'double'  && <DoubleRound  round={round} submitting={submitting} onSubmit={handleSubmit} />}
      {round?.type === 'free'    && <FreeRound    round={round} submitting={submitting} onSubmit={handleSubmit} />}
    </div>
  )
}
