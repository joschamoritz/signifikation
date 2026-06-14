// T-5.5 — ClassroomGameWrapper.
//
// Renderlogik:
//   - state.currentLemma + state.assignment.mode → passende Mini-Spiel-
//     Komponente in classroom/student/games/*
//   - onSubmit ruft kioskFetch.submitAnswer und dispatcht das Ergebnis
//     in den Kiosk-Context (state.submittedAnswer / submittedResult).
//
// Hardware-Back: wir registrieren beforeunload (in useKioskGuard, T-5.9).
// Die Confirmation für den Verlassen-Button sitzt in KioskShell.

import { useCallback, useRef, useState } from 'react'
import { useStudentKiosk } from '../StudentKioskContext'
import { submitAnswer as apiSubmit, KioskApiError } from '../kioskFetch'
import { clearDraftPrefix } from '../hooks/useAnswerDraft'
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
  // Synchroner Guard gegen Doppel-Submit (schnelles Doppeltippen mobil):
  // setSubmitting ist asynchron, der State-Guard allein lässt ein zweites
  // handleSubmit im selben Tick durch (Code-Review React H2).
  const submittingRef = useRef(false)
  const mode    = state.assignment?.mode
  const lemma   = state.currentLemma
  const Game    = pickGameComponent(mode)

  // Stabiler Entwurfs-Schluessel der aktuellen Runde — gespiegelt in
  // sessionStorage, damit ein Reload die Auswahl nicht verliert (7.2).
  const draftKey = (state.sessionId && state.assignment?.id && lemma?.id)
    ? `${state.sessionId}:${state.assignment.id}:${lemma.id}`
    : null

  const handleSubmit = useCallback(async (rawAnswer, options = {}) => {
    if (!state.token || !state.assignment?.id || !lemma?.id) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const submitFn = onSubmitOverride || apiSubmit
    try {
      const roundIndex = options.roundIndex ?? 0
      const result = await submitFn(state.token, {
        assignmentId: state.assignment.id,
        lemmaId:      lemma.id,
        roundIndex,
        rawAnswer,
      })
      // Entwurf dieser Runde ist abgegeben → alle Draft-Keys des Lemmas weg.
      if (draftKey) clearDraftPrefix(draftKey)
      dispatch({ type: 'SUBMITTED', rawAnswer, result, roundIndex })
    } catch (err) {
      const code = err instanceof KioskApiError ? err.code : null
      // Modus-Wechsel/Pause ist kein Fehler des Schülers — ruhig formulieren.
      // Der Server-Push (assignment:changed / session:paused) holt die neue
      // Ansicht ohnehin gleich nach.
      const msg =
        code === 'ASSIGNMENT_NOT_ACTIVE' ? 'Der Modus wurde gerade gewechselt — gleich geht es weiter.'
        : code === 'SESSION_PAUSED'       ? 'Pausiert — warte, bis deine Lehrkraft fortsetzt.'
        : err instanceof KioskApiError    ? err.message
        : 'Antwort nicht gesendet — erneut tippen.'
      if (typeof onToast === 'function') onToast(msg)
      else dispatch({ type: 'SET_ERROR', error: msg })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [state.token, state.assignment?.id, lemma?.id, draftKey, onSubmitOverride, onToast, dispatch])

  if (!Game) {
    return (
      <div className="classroom-kiosk__game">
        <p className="classroom-kiosk__hint classroom-kiosk__hint--error">
          Unbekannter Spielmodus „{mode || '—'}". Bitte Lehrkraft informieren.
        </p>
      </div>
    )
  }
  if (!lemma) {
    return (
      <div className="classroom-kiosk__game">
        <p className="classroom-kiosk__hint">Lade Aufgabe …</p>
      </div>
    )
  }

  return (
    <Game
      key={lemma.id}
      lemma={lemma}
      prompt={lemma.prompt || {}}
      onSubmit={handleSubmit}
      submitting={submitting}
      draftKey={draftKey}
    />
  )
}
