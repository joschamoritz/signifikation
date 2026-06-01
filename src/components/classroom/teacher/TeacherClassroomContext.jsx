// T-4.2 — Reducer-Context fuer den Teacher-Step-Flow.
//
// Bewusst KEIN URL-Param-Stepping (D12 §8): eine Teacher-Session ist ein
// zusammenhaengender Flow, kein Deeplink-Ziel. Der Step lebt nur im
// Component-State, der Tab-Wechsel reisst den Flow nicht ab — beim
// Re-Open landet die Lehrkraft sinnvoll bei list (siehe Reset-Action).

import { createContext, useContext, useMemo, useReducer } from 'react'

export const STEPS = Object.freeze({
  INDEX: 'index',   // Landing: Wörterbuch-Index des Klassenraum-Modus
  LIST:  'list',    // Session-Verwaltung (hinter ② „Sessions")
  SETUP: 'setup',
  LOBBY: 'lobby',
  LIVE:  'live',
  END:   'end',
})

const initialState = {
  currentStep:    STEPS.INDEX,
  activeSessionId: null,
  dashboardData:  null,
  // Setup-Buffer: lebt nur bis die Session angelegt + Assignment geschrieben ist.
  setupDraft:     null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'GO_TO_SETUP':
      return { ...state, currentStep: STEPS.SETUP, activeSessionId: null, setupDraft: action.draft || null }
    case 'SETUP_UPDATE_DRAFT':
      return { ...state, setupDraft: { ...(state.setupDraft || {}), ...(action.draft || {}) } }
    case 'GO_TO_LOBBY':
      return { ...state, currentStep: STEPS.LOBBY, activeSessionId: action.sessionId, setupDraft: null }
    case 'GO_TO_LIVE':
      return { ...state, currentStep: STEPS.LIVE, activeSessionId: action.sessionId || state.activeSessionId }
    case 'GO_TO_END':
      return { ...state, currentStep: STEPS.END, activeSessionId: action.sessionId || state.activeSessionId }
    case 'GO_TO_INDEX':
      // Zurück zur Landing-Ansicht (Klassenraum-Index), Flow komplett zurücksetzen.
      return { ...initialState }
    case 'GO_TO_LIST':
      // Session-Verwaltung öffnen (aus dem Index ② oder als „zurück" aus Lobby/Setup/Ende).
      return { ...initialState, currentStep: STEPS.LIST }
    case 'RESUME_SESSION':
      // Lehrer klickt auf eine bereits laufende Session in der Liste.
      // Wir landen je nach Status im richtigen Step.
      return {
        ...state,
        activeSessionId: action.sessionId,
        currentStep: action.step || STEPS.LOBBY,
        setupDraft: null,
      }
    case 'SET_DASHBOARD':
      return { ...state, dashboardData: action.data || null }
    default:
      return state
  }
}

const TeacherClassroomContextCtx = createContext(null)

export function TeacherClassroomProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return (
    <TeacherClassroomContextCtx.Provider value={value}>
      {children}
    </TeacherClassroomContextCtx.Provider>
  )
}

export function useTeacherClassroom() {
  const ctx = useContext(TeacherClassroomContextCtx)
  if (!ctx) throw new Error('useTeacherClassroom muss innerhalb von <TeacherClassroomProvider> aufgerufen werden')
  return ctx
}
