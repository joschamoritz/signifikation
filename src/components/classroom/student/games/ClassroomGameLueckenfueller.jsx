// Classroom-Lückenfüller — echte Optik des Hauptspiels, server-autoritativer Fluss.
//
// WICHTIG: Die literale Lueckenfueller.jsx lässt sich NICHT wiederverwenden —
// sie punktet lokal mit `round.kollokator` (= der Lösung) und zeigt sie im
// Feedback. Im Klassenraum darf die Lösung NIE an den Schüler (R1, server-
// autoritativ; Auflösung erst durch die Lehrkraft). Deshalb übernehmen wir die
// EXAKTE Optik (lf-*-Markup + lueckenfueller.css), aber ohne lokales Scoring/
// Feedback: Server liefert pro /me/view die aktuelle Runde, wir geben sie ab.
//
// Drei Runden-Typen wie im Hauptspiel: choice / double / free.
// rawAnswer: choice → { selected }, double → { answers:[w1,w2] }, free → { value }.

import KioskGameHeader from '../components/KioskGameHeader'
import { useAnswerDraft } from '../hooks/useAnswerDraft'
import '../../../../styles/lueckenfueller.css'

// Satz mit Lücke — die aktuelle Eingabe füllt die Lücke live (wie im Hauptspiel).
function SatzMitLuecke({ satzMitLuecke, value }) {
  const parts = String(satzMitLuecke || '').split('_____')
  if (parts.length < 2) return <span>{satzMitLuecke || ''}</span>
  return (
    <>
      {parts[0]}
      <span className={`lf-blank${value ? ' lf-blank--filled' : ''}`}>{value || ''}</span>
      {parts[1]}
    </>
  )
}

function ChoiceRound({ round, submitting, onSubmit, draftKey }) {
  const [picked, setPicked] = useAnswerDraft(draftKey ? `${draftKey}:c` : null, null)
  const options = Array.isArray(round?.options) ? round.options : []
  return (
    <>
      <div className="lf-satz-card">
        <p className="lf-satz-text">
          <SatzMitLuecke satzMitLuecke={round?.sentence} value={picked} />
        </p>
      </div>
      <div className="lf-options-grid">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`lf-option-btn${picked === opt ? ' selected' : ''}`}
            onClick={() => { if (!submitting) setPicked(opt) }}
            aria-pressed={picked === opt}
            disabled={submitting}
            data-testid={`classroom-kiosk-lf-choice-${opt}`}
          >
            {opt}
          </button>
        ))}
      </div>
      <footer className="quiz-footer">
        <button
          type="button"
          className="quiz-cta"
          onClick={() => { if (picked) onSubmit({ selected: picked }) }}
          disabled={submitting || !picked}
          data-testid="classroom-kiosk-lf-submit"
        >
          {submitting ? 'Sende …' : (<>Abgeben<span className="quiz-cta-arrow" aria-hidden="true"> →</span></>)}
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
  return (
    <>
      {sentences.map((s, i) => (
        <div key={i} className="lf-satz-card" style={{ marginBottom: 10 }}>
          <p className="lf-satz-text">
            <SatzMitLuecke satzMitLuecke={s.text} value={(answers[i] || '').trim()} />
          </p>
          <div className="lf-free-wrap">
            <input
              className="lf-free-input"
              type="text"
              value={answers[i] || ''}
              onChange={(e) => setAnswers((prev) => {
                const next = [...prev]
                next[i] = String(e.target.value || '').slice(0, 60)
                return next
              })}
              placeholder="Wort eingeben …"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={submitting}
              data-testid={`classroom-kiosk-lf-double-input-${i}`}
            />
          </div>
        </div>
      ))}
      <footer className="quiz-footer">
        <button
          type="button"
          className="quiz-cta"
          onClick={() => onSubmit({ answers })}
          disabled={submitting || answers.some((a) => !String(a).trim())}
          data-testid="classroom-kiosk-lf-submit"
        >
          {submitting ? 'Sende …' : (<>Abgeben<span className="quiz-cta-arrow" aria-hidden="true"> →</span></>)}
        </button>
      </footer>
    </>
  )
}

function FreeRound({ round, submitting, onSubmit, draftKey }) {
  const [value, setValue] = useAnswerDraft(draftKey ? `${draftKey}:f` : null, '')
  return (
    <>
      <div className="lf-satz-card">
        <p className="lf-satz-text">
          <SatzMitLuecke satzMitLuecke={round?.sentence} value={value.trim()} />
        </p>
      </div>
      <div className="lf-free-wrap">
        <label htmlFor="classroom-lf-free" className="sr-only">Fehlende Kollokation eingeben</label>
        <input
          id="classroom-lf-free"
          className="lf-free-input"
          type="text"
          value={value}
          onChange={(e) => setValue(String(e.target.value || '').slice(0, 60))}
          placeholder="Wort eingeben …"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={submitting}
          data-testid="classroom-kiosk-lf-free-input"
        />
      </div>
      <footer className="quiz-footer">
        <button
          type="button"
          className="quiz-cta"
          onClick={() => { if (value.trim()) onSubmit({ value: value.trim() }) }}
          disabled={submitting || !value.trim()}
          data-testid="classroom-kiosk-lf-submit"
        >
          {submitting ? 'Sende …' : (<>Abgeben<span className="quiz-cta-arrow" aria-hidden="true"> →</span></>)}
        </button>
      </footer>
    </>
  )
}

export default function ClassroomGameLueckenfueller({ lemma, prompt, onSubmit, submitting, draftKey = null }) {
  const round = prompt?.currentRound || null
  const roundIndex = prompt?.roundIndex ?? 0
  const roundDraftKey = draftKey ? `${draftKey}::${roundIndex}` : null

  function handleSubmit(rawAnswer) {
    onSubmit(rawAnswer, { roundIndex })
  }

  return (
    <div className="screen quiz-screen classroom-kiosk__game lf-screen" data-testid="classroom-kiosk-game-lueckenfueller">
      <KioskGameHeader
        badge="Lückenfüller"
        lemma={lemma?.lemma}
        ipa={lemma?.ipa}
        instruction={`Welches Wort fehlt? · Runde ${roundIndex + 1}`}
      />

      {!round && <p className="classroom-kiosk__hint">Keine Runde verfügbar.</p>}
      {round?.type === 'choice'  && <ChoiceRound  round={round} submitting={submitting} onSubmit={handleSubmit} draftKey={roundDraftKey} />}
      {round?.type === 'double'  && <DoubleRound  round={round} submitting={submitting} onSubmit={handleSubmit} draftKey={roundDraftKey} />}
      {round?.type === 'free'    && <FreeRound    round={round} submitting={submitting} onSubmit={handleSubmit} draftKey={roundDraftKey} />}
    </div>
  )
}
