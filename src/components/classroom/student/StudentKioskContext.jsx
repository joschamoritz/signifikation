// T-5.1 — Reducer-Context fuer den Schueler-Kiosk-Flow.
//
// Eine Quelle der Wahrheit fuer den Schueler-State innerhalb /c/:code.
// Bewusst NICHT in localStorage — D6: Token lebt nur in sessionStorage,
// geht beim Tab-Close verloren. Persistenz uebernimmt useStudentSession (T-5.8),
// dieser Context ist „purely in-memory + reducer".
//
// State-Maschine:
//   'name'      – S2: Spitzname-Eingabe (Default beim Mount mit Code in URL)
//   'waiting'   – S3: Lobby, warte auf session:started
//   'playing'   – S4: aktuelles Lemma spielen
//   'submitted' – S5: Antwort eingereicht, warte auf Auflösung
//   'ended'     – Session beendet, „Danke fürs Mitspielen"
//
// 'join' (S1) lebt in StudentJoinEntry, nicht hier — es laeuft eine Ebene
// hoeher, weil ohne Code keine Kiosk-Route existiert.

import { createContext, useContext, useMemo, useReducer } from 'react'

export const KIOSK_STATES = Object.freeze({
  NAME:      'name',
  WAITING:   'waiting',
  PLAYING:   'playing',
  SUBMITTED: 'submitted',
  ENDED:     'ended',
})

export function initialState(code) {
  return {
    currentState:    KIOSK_STATES.NAME,
    code:            code || '',
    sessionId:       null,
    sessionStatus:   null,        // 'lobby' | 'running' | 'paused' | 'finished' | 'aborted'
    paused:          false,       // W2-T3: Pause-Overlay aktiv, currentState bleibt erhalten
    participantId:   null,
    token:           null,
    displayName:     '',
    assignment:      null,        // { id, mode, lemmaCount }
    currentLemma:    null,        // { id, lemma, ipa, prompt, definition }
    progress:        { submittedCount: 0, totalLemmata: 0, done: false },
    submittedAnswer: null,        // letzte eingereichte rawAnswer (lokal fuer S5)
    submittedResult: null,        // { score, maxScore, correct } vom Server
    revealed:        false,       // hat Lehrer „Auflösung freigeben" gedrueckt? (session:finished)
    notice:          null,        // info-Hinweise an die UI
    error:           null,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CODE':
      return { ...state, code: action.code || '' }

    case 'JOINED': {
      // /join war erfolgreich. Wir landen je nach Server-Status in waiting
      // oder, falls die Session schon läuft, direkt in playing — letzteres
      // klappt erst, wenn die naechste /me/view-Antwort ein currentLemma hat.
      return {
        ...state,
        sessionId:     action.sessionId,
        sessionStatus: action.sessionStatus || 'lobby',
        participantId: action.participantId,
        token:         action.token,
        displayName:   action.displayName || state.displayName,
        currentState:  KIOSK_STATES.WAITING,
        notice:        null,
        error:         null,
      }
    }

    case 'SET_VIEW': {
      // /me/view-Ergebnis verarbeitet. Hier wird die State-Maschine
      // gegen den Server abgeglichen — Server ist source of truth.
      const view = action.view || {}
      const status = view.sessionStatus || state.sessionStatus
      const assignment = view.assignment || null
      const currentLemma = view.currentLemma || null
      const progress = view.progress || state.progress
      // Pause ist ein abgeleiteter Status; die Session laeuft serverseitig
      // weiter ('running'). Fuer die State-Maschine zaehlt sie wie 'running',
      // damit currentState (playing/submitted) nicht verloren geht — das
      // Pause-Overlay wird ueber das paused-Flag gerendert.
      const paused = status === 'paused'
      const effectiveRunning = status === 'running' || paused

      let next = state.currentState
      if (status === 'aborted')        next = KIOSK_STATES.ENDED
      else if (status === 'finished')  next = KIOSK_STATES.ENDED
      else if (!assignment)            next = KIOSK_STATES.WAITING
      else if (progress?.done)         next = KIOSK_STATES.SUBMITTED
      else if (currentLemma && effectiveRunning) next = KIOSK_STATES.PLAYING
      else                              next = KIOSK_STATES.WAITING

      return {
        ...state,
        sessionStatus: status,
        paused,
        assignment,
        currentLemma,
        progress,
        currentState: next,
      }
    }

    case 'SESSION_PAUSED':
      // Socket-Push: Pause-Overlay einblenden, currentState unberuehrt lassen.
      return { ...state, paused: true, sessionStatus: 'paused' }

    case 'SESSION_RESUMED':
      // Socket-Push: zurueck in den vorherigen currentState (nicht verloren).
      return { ...state, paused: false, sessionStatus: 'running' }

    case 'SET_SESSION_STATUS':
      // Wird von Socket-Events (session:started/finished/aborted) gepusht.
      // Wir gehen mehrheitlich auf /me/view, das hier ist nur Vorab-Signal.
      return { ...state, sessionStatus: action.status || state.sessionStatus }

    case 'SUBMITTED': {
      return {
        ...state,
        submittedAnswer: action.rawAnswer || null,
        submittedResult: action.result || null,
        currentState:    KIOSK_STATES.SUBMITTED,
        error:           null,
      }
    }

    case 'REVEAL':
      // session:finished kam → Lehrer hat Auflösung freigegeben (D5).
      return { ...state, revealed: true, currentState: state.submittedResult
        ? KIOSK_STATES.SUBMITTED
        : KIOSK_STATES.ENDED }

    case 'SESSION_ENDED':
      // session:finished oder :aborted ohne eigene Submission.
      return { ...state, sessionStatus: action.reason === 'aborted' ? 'aborted' : 'finished', revealed: true, currentState: state.submittedResult ? KIOSK_STATES.SUBMITTED : KIOSK_STATES.ENDED }

    case 'GOTO':
      return { ...state, currentState: action.state }

    case 'SET_NOTICE':
      return { ...state, notice: action.notice || null }

    case 'SET_ERROR':
      return { ...state, error: action.error || null }

    case 'CLEAR':
      return initialState(state.code)

    default:
      return state
  }
}

const KioskContextCtx = createContext(null)

export function StudentKioskProvider({ children, initialCode = '', initialOverride = null }) {
  const [state, dispatch] = useReducer(
    reducer,
    initialOverride ?? initialState(initialCode),
  )
  const value = useMemo(() => ({ state, dispatch }), [state])
  return (
    <KioskContextCtx.Provider value={value}>
      {children}
    </KioskContextCtx.Provider>
  )
}

export function useStudentKiosk() {
  const ctx = useContext(KioskContextCtx)
  if (!ctx) throw new Error('useStudentKiosk muss innerhalb von <StudentKioskProvider> aufgerufen werden')
  return ctx
}
