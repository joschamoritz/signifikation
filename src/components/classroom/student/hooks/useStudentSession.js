// T-5.8 — Schueler-Sitzungs-Hook.
//
// Aufgaben:
//   1. Rehydration aus sessionStorage (Key 'classroom-v2:student').
//   2. Server-Rehydrate via GET /me/view (Server ist source of truth).
//   3. Polling /me/view alle ~10 s, wenn Socket nicht verbunden ist.
//   4. Persistenz: sobald wir einen Token haben, schreiben wir ihn in
//      sessionStorage. Bei /me/view-401 (Token weg) löschen wir wieder.
//   5. Heartbeat alle ~8 s gegen den HTTP-Endpunkt — auch wenn der Socket
//      lebt (Idempotenz auf Server-Seite, identisch zum alten Pattern).
//   6. Cleanup beim Unmount + Auto-Leave-Effekt fuer „verlassen".
//
// Bewusst NICHT localStorage (D6) — Token soll mit Browser-Restart sterben.

import { useCallback, useEffect, useRef } from 'react'
import { useStudentKiosk } from '../StudentKioskContext'
import { fetchView, sendHeartbeat, leaveSession, KioskApiError } from '../kioskFetch'

const STORAGE_KEY = 'classroom-v2:student'
const POLL_INTERVAL_MS      = 10_000
const HEARTBEAT_INTERVAL_MS = 8_000

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeStorage(value) {
  try {
    if (!value) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {}
}

/** Public: Persistenz-Helfer. Wird im JoinEntry/State nach erfolgreichem /join genutzt. */
export function persistKioskSession({ code, sessionId, participantId, token, displayName }) {
  if (!token || !sessionId || !participantId) return
  writeStorage({ code, sessionId, participantId, token, displayName: displayName || '' })
}

export function clearKioskSession() {
  writeStorage(null)
}

/**
 * useStudentSession({ socketConnected }) — Hauptorchestrierung.
 *
 * Liest beim Mount aus sessionStorage + GET /me/view → SET_VIEW.
 * Persistiert nach jedem JOINED-Event (sieht state.token + state.code aendern).
 * Startet Polling, solange socketConnected = false.
 */
export function useStudentSession({ socketConnected = false } = {}) {
  const { state, dispatch } = useStudentKiosk()
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // 1. Mount: Rehydrate aus sessionStorage.
  const rehydratedRef = useRef(false)
  useEffect(() => {
    if (rehydratedRef.current) return
    rehydratedRef.current = true
    const stored = readStorage()
    if (!stored?.token) return
    // Code aus URL gewinnt — wenn stored.code != state.code, ignoriere stored.
    if (state.code && stored.code && stored.code !== state.code) {
      writeStorage(null)
      return
    }
    dispatch({
      type: 'JOINED',
      sessionId:     stored.sessionId,
      sessionStatus: null,        // wird gleich von /me/view ueberschrieben
      participantId: stored.participantId,
      token:         stored.token,
      displayName:   stored.displayName || '',
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Persistenz: wann immer wir einen Token haben, in sessionStorage halten.
  useEffect(() => {
    if (!state.token || !state.sessionId || !state.participantId) return
    persistKioskSession({
      code:          state.code,
      sessionId:     state.sessionId,
      participantId: state.participantId,
      token:         state.token,
      displayName:   state.displayName,
    })
  }, [state.token, state.sessionId, state.participantId, state.code, state.displayName])

  // 3. /me/view-Abruf — initial + Polling, wenn Socket aus.
  const refreshView = useCallback(async () => {
    const s = stateRef.current
    if (!s.token) return
    try {
      const view = await fetchView(s.token)
      dispatch({ type: 'SET_VIEW', view })
    } catch (err) {
      if (err instanceof KioskApiError && (err.status === 401 || err.status === 403)) {
        // Token ungueltig → State zuruecksetzen + Storage clearen.
        clearKioskSession()
        dispatch({ type: 'SET_ERROR', error: err.message })
        dispatch({ type: 'CLEAR' })
      }
    }
  }, [dispatch])

  // Initial-Load, sobald wir einen Token haben.
  useEffect(() => {
    if (!state.token) return
    refreshView()
  }, [state.token, refreshView])

  // Polling-Fallback (nur wenn Socket nicht verbunden).
  useEffect(() => {
    if (!state.token) return undefined
    if (socketConnected) return undefined
    const id = setInterval(refreshView, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state.token, socketConnected, refreshView])

  // 4. Heartbeat — schickt alle ~8s last_seen_at hoch.
  useEffect(() => {
    if (!state.token) return undefined
    let stopped = false
    async function beat() {
      if (stopped) return
      // stateRef statt state.token: vermeidet stale Closure, falls sich der
      // Token nach Effekt-Start noch ändert (Rehydrate-Race) — analog refreshView.
      const token = stateRef.current.token
      if (!token) return
      try { await sendHeartbeat(token) } catch (err) {
        if (err instanceof KioskApiError && (err.status === 401 || err.status === 403)) {
          clearKioskSession()
          dispatch({ type: 'CLEAR' })
        }
      }
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => { stopped = true; clearInterval(id) }
  }, [state.token, dispatch])

  // Public Trigger fuer Komponenten („gleich nach session:started bitte
  // /me/view neu holen").
  return { refreshView, leave: useCallback(async () => {
    const t = stateRef.current.token
    clearKioskSession()
    dispatch({ type: 'CLEAR' })
    if (t) {
      try { await leaveSession(t) } catch {}
    }
  }, [dispatch]) }
}

export const __STORAGE_KEY = STORAGE_KEY
