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

import KioskGameHeader from '../components/KioskGameHeader'
import { useAnswerDraft } from '../hooks/useAnswerDraft'

function ChoiceRound({ round, submitting, onSubmit, draftKey }) {
  const [picked, setPicked] = useAnswerDraft(draftKey ? `${draftKey}:c` : null, null)
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
      <div className="options-grid-wrap">
        <div className="options-grid">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`option${picked === opt ? ' selected' : ''}`}
              onClick={() => setPicked(opt)}
              aria-pressed={picked === opt}
              data-testid={`cr2-kiosk-lf-choice-${opt}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <footer className="quiz-footer">
        <span className="select-count">{picked ? '1' : '0'} / 1 gewählt</span>
        <button
          type="button"
          className="btn-primary"
          onClick={handle}
          disabled={submitting || !picked}
          data-testid="cr2-kiosk-lf-submit"
        >
          {submitting ? 'Sende …' : 'Abgeben'}
        </button>
      </footer>
    </>
  )
}

function DoubleRound({ round, submitting, onSubmit, draftKey }) {
  const sentences = Array.isArray(round?.sentences) ? round.sentences : []
  const [answers, setAnswers] = useAnswerDraft(
    draftKey ? `${draftKey}:d` : null,
    () => new Array(sentences.length).fill(''),
  )

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
            className="cr2-kiosk__lf-input"
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
      <footer className="quiz-footer">
        <span className="select-count">{answers.filter((a) => a.trim()).length} / {sentences.length}</span>
        <button
          type="button"
          className="btn-primary"
          onClick={handle}
          disabled={submitting || answers.some((a) => !a.trim())}
          data-testid="cr2-kiosk-lf-submit"
        >
          {submitting ? 'Sende …' : 'Abgeben'}
        </button>
      </footer>
    </>
  )
}

function FreeRound({ round, submitting, onSubmit, draftKey }) {
  const [value, setValue] = useAnswerDraft(draftKey ? `${draftKey}:f` : null, '')
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
        className="cr2-kiosk__lf-input"
        value={value}
        onChange={(e) => setValue(String(e.target.value || '').slice(0, 60))}
        placeholder="Wort eintippen"
        disabled={submitting}
        data-testid="cr2-kiosk-lf-free-input"
      />
      <footer className="quiz-footer">
        <span className="select-count">{value.trim() ? 'bereit' : '—'}</span>
        <button
          type="button"
          className="btn-primary"
          onClick={handle}
          disabled={submitting || !value.trim()}
          data-testid="cr2-kiosk-lf-submit"
        >
          {submitting ? 'Sende …' : 'Abgeben'}
        </button>
      </footer>
    </>
  )
}

export default function ClassroomGameLueckenfueller({ lemma, prompt, onSubmit, submitting, draftKey = null }) {
  const round = prompt?.currentRound || null
  const roundIndex = prompt?.roundIndex ?? 0
  // Entwurfs-Key pro Runde, damit Reload die Eingabe der aktuellen Runde haelt.
  const roundDraftKey = draftKey ? `${draftKey}::${roundIndex}` : null

  function handleSubmit(rawAnswer) {
    onSubmit(rawAnswer, { roundIndex })
  }

  return (
    <div className="screen quiz-screen cr2-kiosk__game" data-testid="cr2-kiosk-game-lueckenfueller">
      <KioskGameHeader
        badge="Lückenfüller"
        lemma={lemma?.lemma}
        ipa={lemma?.ipa}
        instruction={`Welches Wort fehlt? · Runde ${roundIndex + 1}`}
      />

      {!round && <p className="cr2-kiosk__hint">Keine Runde verfügbar.</p>}
      {round?.type === 'choice'  && <ChoiceRound  round={round} submitting={submitting} onSubmit={handleSubmit} draftKey={roundDraftKey} />}
      {round?.type === 'double'  && <DoubleRound  round={round} submitting={submitting} onSubmit={handleSubmit} draftKey={roundDraftKey} />}
      {round?.type === 'free'    && <FreeRound    round={round} submitting={submitting} onSubmit={handleSubmit} draftKey={roundDraftKey} />}
    </div>
  )
}
