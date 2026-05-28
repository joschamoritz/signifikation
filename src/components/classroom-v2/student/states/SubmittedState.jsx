// T-5.7 — S5 Abgegeben + (nach session:finished) Korrektur.
//
// Vor der Auflösung: nur das Wissen, dass die Antwort eingereicht ist
// + Anzeige der eigenen Antwort, read-only. Score zeigen wir absichtlich
// NICHT vor Auflösung — sonst wäre die Auflösungsfreigabe sinnlos.
//
// Nach session:finished (state.revealed = true): vollständige Korrektur.
// Lehrkraft hat die Auflösung explizit freigegeben. Für correct/wrong
// nutzen wir submittedResult vom Server (D13).

import { useStudentKiosk, KIOSK_STATES } from '../StudentKioskContext'
import { navigate } from '../../routing'

function safeArr(v) { return Array.isArray(v) ? v : [] }

function CollocationsRecap({ rawAnswer, lemma }) {
  const picked = safeArr(rawAnswer?.selected)
  return (
    <ul className="cr2-kiosk__choices" data-testid="cr2-kiosk-recap-koll">
      {picked.map((w, i) => (
        <li key={i} className="cr2-kiosk__choice cr2-kiosk__choice--disabled">
          <span>{w}</span>
          <span className="cr2-kiosk__choice-rank">{i + 1}. Pick</span>
        </li>
      ))}
      {picked.length === 0 && (
        <li className="cr2-kiosk__hint">Keine Auswahl gespeichert.</li>
      )}
    </ul>
  )
}

function WortzwillingRecap({ rawAnswer }) {
  return (
    <div className="cr2-kiosk__zones" data-testid="cr2-kiosk-recap-wz">
      <div className="cr2-kiosk__zone">
        <p className="cr2-kiosk__zone__label">Zone A</p>
        {safeArr(rawAnswer?.zoneA).map((w) => (
          <span key={w} className="cr2-kiosk__pill cr2-kiosk__pill--in-zone-a">{w}</span>
        ))}
      </div>
      <div className="cr2-kiosk__zone">
        <p className="cr2-kiosk__zone__label">Zone B</p>
        {safeArr(rawAnswer?.zoneB).map((w) => (
          <span key={w} className="cr2-kiosk__pill cr2-kiosk__pill--in-zone-b">{w}</span>
        ))}
      </div>
    </div>
  )
}

function ZeitenwendeRecap({ rawAnswer }) {
  return (
    <ul className="cr2-kiosk__choices" data-testid="cr2-kiosk-recap-zw">
      {safeArr(rawAnswer?.answers).map((p, i) => (
        <li key={i} className="cr2-kiosk__choice cr2-kiosk__choice--disabled">
          <span>Wort {i + 1}</span>
          <span className="cr2-kiosk__choice-rank">
            {p === 'pre' ? 'vor 2000' : p === 'post' ? 'nach 2000' : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function LueckenfuellerRecap({ rawAnswer }) {
  return (
    <p className="cr2-kiosk__hint" data-testid="cr2-kiosk-recap-lf">
      {rawAnswer?.value ? `Eingabe: „${rawAnswer.value}"` :
       rawAnswer?.selected ? `Auswahl: „${rawAnswer.selected}"` :
       Array.isArray(rawAnswer?.answers) ? `Eingaben: ${rawAnswer.answers.join(', ')}` :
       'Antwort abgegeben.'}
    </p>
  )
}

function Recap({ mode, rawAnswer, lemma }) {
  switch (mode) {
    case 'kollokationen':  return <CollocationsRecap rawAnswer={rawAnswer} lemma={lemma} />
    case 'wortzwilling':   return <WortzwillingRecap rawAnswer={rawAnswer} />
    case 'zeitenwende':    return <ZeitenwendeRecap rawAnswer={rawAnswer} />
    case 'lueckenfueller': return <LueckenfuellerRecap rawAnswer={rawAnswer} />
    default:                return null
  }
}

export default function SubmittedState() {
  const { state } = useStudentKiosk()

  const isEnded = state.currentState === KIOSK_STATES.ENDED || state.sessionStatus === 'finished' || state.sessionStatus === 'aborted'
  const revealed = state.revealed || isEnded
  const mode = state.assignment?.mode || null
  const result = state.submittedResult
  const hadSubmission = !!state.submittedAnswer

  if (isEnded && !hadSubmission) {
    return (
      <>
        <p className="cr2-kiosk__dropcap cr2-kiosk__dropcap--gold">·</p>
        <h1 className="cr2-kiosk__title">Session beendet.</h1>
        <p className="cr2-kiosk__lead">Danke fürs Mitspielen.</p>
        <button
          type="button"
          className="cr2-kiosk__btn cr2-kiosk__btn--primary"
          onClick={() => navigate('/')}
          data-testid="cr2-kiosk-to-app"
        >
          Zur App
        </button>
      </>
    )
  }

  return (
    <>
      {state.displayName && (
        <div style={{ textAlign: 'right', marginBottom: 12 }}>
          <span className="cr2-kiosk__name-chip">
            <strong>{state.displayName}</strong>
          </span>
        </div>
      )}

      {/* ✓ wird mit CSS-Color in Gold gerendert (kein Emoji-Glyph) */}
      <p className="cr2-kiosk__dropcap cr2-kiosk__dropcap--gold" aria-hidden="true">✓</p>
      <h1 className="cr2-kiosk__title" data-testid="cr2-kiosk-submitted-title">
        {isEnded ? 'Auflösung' : 'Abgegeben.'}
      </h1>
      <p className="cr2-kiosk__lead">
        {isEnded
          ? 'Hier siehst du deine Antwort und die Auflösung.'
          : 'Warte auf deinen Lehrer.'}
      </p>

      {state.currentLemma?.lemma && (
        <p className="cr2-kiosk__hint">
          Lemma: <strong>{state.currentLemma.lemma}</strong>
        </p>
      )}

      <section className="cr2-kiosk__resultcard" aria-label="Deine Antwort">
        <Recap mode={mode} rawAnswer={state.submittedAnswer} lemma={state.currentLemma} />
      </section>

      {revealed && result && (
        <section className="cr2-kiosk__resultcard" aria-label="Auflösung" data-testid="cr2-kiosk-reveal">
          <div className="cr2-kiosk__resultcard__row cr2-kiosk__resultcard__row--correct">
            <span>Ergebnis</span>
            <strong>{result.score} / {result.maxScore} Punkte</strong>
          </div>
          {typeof result.correct === 'number' && (
            <div className="cr2-kiosk__resultcard__row">
              <span>Korrekte Auswahl</span>
              <strong>{result.correct}</strong>
            </div>
          )}
        </section>
      )}

      {isEnded && (
        <button
          type="button"
          className="cr2-kiosk__btn cr2-kiosk__btn--primary"
          onClick={() => navigate('/')}
          data-testid="cr2-kiosk-to-app"
        >
          Zur App
        </button>
      )}
    </>
  )
}
