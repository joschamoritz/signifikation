// T-5.7 — S5 Abgegeben + (nach session:finished) Korrektur.
//
// Vor der Auflösung: nur das Wissen, dass die Antwort eingereicht ist
// + Anzeige der eigenen Antwort, read-only. Score zeigen wir absichtlich
// NICHT vor Auflösung — sonst wäre die Auflösungsfreigabe sinnlos.
//
// Nach session:finished (state.revealed = true): vollständige Korrektur.
// Lehrkraft hat die Auflösung explizit freigegeben. Für correct/wrong
// nutzen wir submittedResult vom Server (D13).

import { Fragment } from 'react'
import { useStudentKiosk, KIOSK_STATES } from '../StudentKioskContext'
import { navigate } from '../../routing'

function safeArr(v) { return Array.isArray(v) ? v : [] }

function CollocationsRecap({ rawAnswer, lemma }) {
  const picked = safeArr(rawAnswer?.selected)
  if (picked.length === 0) {
    return <p className="cr2-kiosk__recap-empty" data-testid="cr2-kiosk-recap-koll">Keine Auswahl gespeichert.</p>
  }
  return (
    <ul className="cr2-kiosk__recap" data-testid="cr2-kiosk-recap-koll">
      {picked.map((w, i) => (
        <li key={i} className="cr2-kiosk__recap-row">
          <span className="cr2-kiosk__recap-bullet" aria-hidden="true">·</span>
          <span>{w}</span>
        </li>
      ))}
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
  const picks = safeArr(rawAnswer?.answers)
  if (picks.length === 0) {
    return <p className="cr2-kiosk__recap-empty" data-testid="cr2-kiosk-recap-zw">Keine Auswahl gespeichert.</p>
  }
  return (
    <ul className="cr2-kiosk__recap" data-testid="cr2-kiosk-recap-zw">
      {picks.map((p, i) => (
        <li key={i} className="cr2-kiosk__recap-row">
          <span className="cr2-kiosk__recap-bullet" aria-hidden="true">·</span>
          <span>Wort {i + 1}</span>
          <span className="cr2-kiosk__recap-aside">
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

// Schritt 4 (C1): item-genaue Auflösung nach Freigabe. Jede eigene Antwort mit
// ✓ (korrekt) / · (gültig, nicht optimal — nur Kollokationen) / ✗ (falsch) und,
// wo vorhanden, der richtigen Lösung pro Item. Daten kommen R1-gegated vom Server.
function RevealItems({ entry }) {
  const items = Array.isArray(entry?.items) ? entry.items : []
  if (items.length === 0) return null
  return (
    <>
      <ul className="cr2-kiosk__reveal" data-testid="cr2-kiosk-reveal-items">
        {items.map((it, i) => {
          const cls = it.correct ? 'is-correct' : it.partial ? 'is-partial' : 'is-wrong'
          const mark = it.correct ? '✓' : it.partial ? '·' : '✗'
          return (
            <li key={i} className={`cr2-kiosk__reveal-row cr2-kiosk__reveal-row--${cls}`}>
              <span className="cr2-kiosk__reveal-mark" aria-hidden="true">{mark}</span>
              <span className="cr2-kiosk__reveal-word">
                {it.label}
                {it.you && it.you !== it.label && (
                  <span className="cr2-kiosk__reveal-you"> · du: {it.you}</span>
                )}
              </span>
              {!it.correct && it.solution && it.solution !== it.you && (
                <span className="cr2-kiosk__reveal-sol">richtig: {it.solution}</span>
              )}
            </li>
          )
        })}
      </ul>
      {entry.solution && (
        <p className="cr2-kiosk__reveal-note">
          Beste Antwort: <strong>{entry.solution}</strong>
        </p>
      )}
    </>
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

  // W4-S4: Bei Mehrrunden-Modi (z. B. 3 Lemmata Kollokationen) zeigen wir eine
  // Auswertung ALLER Runden statt nur der letzten Antwort. Scores erst nach
  // Auflösungsfreigabe — vorher nur „abgegeben".
  const rounds = Array.isArray(state.roundResults) ? state.roundResults : []
  const isMultiRound = rounds.length > 1
  const totalScore = rounds.reduce((s, r) => s + (Number(r.score) || 0), 0)
  const totalMax   = rounds.reduce((s, r) => s + (Number(r.maxScore) || 0), 0)

  // Schritt 4 (C1): item-genaue Auflösung, vom Server byKey „<lemmaId>:<round>".
  const revealByKey = state.revealData?.byKey || {}
  const singleKey   = `${state.currentLemma?.id ?? null}:0`
  const singleReveal = revealed ? (revealByKey[singleKey] || null) : null

  if (isEnded && !hadSubmission) {
    return (
      <>
        <p className="cr2-kiosk__overline">Abgeschlossen</p>
        <h1 className="cr2-kiosk__title">Session beendet.</h1>
        <p className="cr2-kiosk__lead">Danke fürs Mitspielen.</p>
        <button
          type="button"
          className="cr2-kiosk__textlink"
          onClick={() => navigate('/')}
          data-testid="cr2-kiosk-to-app"
        >
          Zur App<span className="test-cta-arrow" aria-hidden="true"> →</span>
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

      <p className="cr2-kiosk__overline">{isEnded ? 'Auflösung' : 'Abgegeben'}</p>
      <h1 className="cr2-kiosk__title" data-testid="cr2-kiosk-submitted-title">
        {isEnded ? 'Hier ist die Auflösung.' : 'Deine Antwort ist eingereicht.'}
      </h1>
      <p className="cr2-kiosk__lead">
        {isEnded
          ? 'Deine Antwort im Vergleich.'
          : 'Warte auf deine Lehrkraft.'}
      </p>

      {!isMultiRound && state.currentLemma?.lemma && (
        <p className="cr2-kiosk__hint">
          Lemma: <strong>{state.currentLemma.lemma}</strong>
        </p>
      )}

      {isMultiRound ? (
        <section className="cr2-kiosk__resultcard" aria-label="Deine Runden" data-testid="cr2-kiosk-rounds">
          <span className="cr2-kiosk__reslabel">Deine Runden</span>
          <ul className="cr2-kiosk__rounds">
            {rounds.map((r, i) => {
              const rev = revealed ? (revealByKey[r.key] || null) : null
              return (
                <Fragment key={r.key || i}>
                  <li className="cr2-kiosk__rounds__row">
                    <span className="cr2-kiosk__rounds__lemma">
                      <span className="cr2-kiosk__rounds__idx" aria-hidden="true">{i + 1}.</span>{' '}
                      {r.lemma || `Runde ${i + 1}`}
                    </span>
                    <span className="cr2-kiosk__rounds__score">
                      {revealed && r.maxScore != null
                        ? `${r.score} / ${r.maxScore}`
                        : '✓ abgegeben'}
                    </span>
                  </li>
                  {rev && (
                    <li className="cr2-kiosk__rounds__detail">
                      <RevealItems entry={rev} />
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
          {revealed && totalMax > 0 && (
            <div className="cr2-kiosk__resultcard__row cr2-kiosk__resultcard__row--correct cr2-kiosk__rounds__total">
              <span>Gesamt</span>
              <strong>{totalScore} / {totalMax} Punkte</strong>
            </div>
          )}
        </section>
      ) : (
        <>
          {(!revealed || !singleReveal) && (
            <section className="cr2-kiosk__resultcard" aria-label="Deine Antwort">
              <span className="cr2-kiosk__reslabel">Deine Antwort</span>
              <Recap mode={mode} rawAnswer={state.submittedAnswer} lemma={state.currentLemma} />
            </section>
          )}

          {revealed && (singleReveal || result) && (
            <section className="cr2-kiosk__resultcard" aria-label="Auflösung" data-testid="cr2-kiosk-reveal">
              <span className="cr2-kiosk__reslabel">Auflösung</span>
              {singleReveal && <RevealItems entry={singleReveal} />}
              <div className="cr2-kiosk__resultcard__row cr2-kiosk__resultcard__row--correct">
                <span>Ergebnis</span>
                <strong>
                  {(singleReveal?.score ?? result?.score)} / {(singleReveal?.maxScore ?? result?.maxScore)} Punkte
                </strong>
              </div>
            </section>
          )}
        </>
      )}

      {isEnded && (
        <button
          type="button"
          className="cr2-kiosk__textlink"
          onClick={() => navigate('/')}
          data-testid="cr2-kiosk-to-app"
        >
          Zur App<span className="test-cta-arrow" aria-hidden="true"> →</span>
        </button>
      )}
    </>
  )
}
