// T-5.5 — ClassroomGameWrapper.
//
// Renderlogik:
//   - state.currentLemma + state.assignment.mode → passende Mini-Spiel-
//     Komponente in classroom-v2/student/games/*
//   - onSubmit ruft kioskFetch.submitAnswer und dispatcht das Ergebnis
//     in den Kiosk-Context (state.submittedAnswer / submittedResult).
//
// Hardware-Back: wir registrieren beforeunload (in useKioskGuard, T-5.9).
// Die Confirmation für den Verlassen-Button sitzt in KioskShell.

import { useCallback, useState } from 'react'
import { useStudentKiosk } from '../StudentKioskContext'
import { submitAnswer as apiSubmit, KioskApiError } from '../kioskFetch'
import ClassroomGameKollokationen    from '../games/ClassroomGameKollokationen'
import ClassroomGameWortZwilling     from '../games/ClassroomGameWortZwilling'
import ClassroomGameZeitenwende      from '../games/ClassroomGameZeitenwende'
import ClassroomGameLueckenfueller   from '../games/ClassroomGameLueckenfueller'

function pickGameComponent(mode) {
  switch (mode) {
    case 'kollokationen':   return ClassroomGameKollokationen
    case 'wortzwilling':    return ClassroomGameWortZwilling
    case 'zeitenwende':     return ClassroomGameZeitenwende
    case 'lueckenfueller':  return ClassroomGameLueckenfueller
    default:                 return null
  }
}

/**
 * Optional: onSubmitOverride wird in Tests verwendet, um die HTTP-Schicht
 * komplett zu umgehen.
 */
export default function ClassroomGameWrapper({ onSubmitOverride = null, onToast = null }) {
  const { state, dispatch } = useStudentKiosk()
  const [submitting, setSubmitting] = useState(false)
  const mode    = state.assignment?.mode
  const lemma   = state.currentLemma
  const Game    = pickGameComponent(mode)

  const handleSubmit = useCallback(async (rawAnswer, options = {}) => {
    if (!state.token || !state.assignment?.id || !lemma?.id) return
    if (submitting) return
    setSubmitting(true)
    const submitFn = onSubmitOverride || apiSubmit
    try {
      const result = await submitFn(state.token, {
        assignmentId: state.assignment.id,
        lemmaId:      lemma.id,
        roundIndex:   options.roundIndex ?? 0,
        rawAnswer,
      })
      dispatch({ type: 'SUBMITTED', rawAnswer, result })
    } catch (err) {
      const msg = err instanceof KioskApiError
        ? err.message
        : 'Antwort nicht gesendet — erneut tippen.'
      if (typeof onToast === 'function') onToast(msg)
      else dispatch({ type: 'SET_ERROR', error: msg })
    } finally {
      setSubmitting(false)
    }
  }, [state.token, state.assignment?.id, lemma?.id, submitting, onSubmitOverride, onToast, dispatch])

  if (!Game) {
    return (
      <div className="cr2-kiosk__game">
        <p className="cr2-kiosk__hint cr2-kiosk__hint--error">
          Unbekannter Spielmodus „{mode || '—'}". Bitte Lehrkraft informieren.
        </p>
      </div>
    )
  }
  if (!lemma) {
    return (
      <div className="cr2-kiosk__game">
        <p className="cr2-kiosk__hint">Lade Aufgabe …</p>
      </div>
    )
  }

  return (
    <Game
      lemma={lemma}
      prompt={lemma.prompt || {}}
      onSubmit={handleSubmit}
      submitting={submitting}
    />
  )
}
