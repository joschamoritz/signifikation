// T-5.1 — StudentKioskRoute (/c/:code).
//
// Mountet StudentKioskProvider, KioskShell, State-Router und alle Hooks.
// Persistenz + Polling laeuft via useStudentSession (T-5.8), Realtime via
// useStudentSocket (T-5.9), Tab-/Reload-Schutz via useKioskGuard.
//
// Lifecycle-Übersicht:
//   - Mount mit code aus URL → Provider mit initialCode=code
//   - useStudentSession liest sessionStorage:
//       a) gleicher code + token → JOINED dispatchen → /me/view sync
//       b) kein Token / anderer Code → bleibt in 'name' (NameState)
//   - NameState ruft POST /join → JOINED dispatch → Persistenz schreibt
//   - Polling /me/view alle 10s, solange Socket nicht verbunden
//   - Socket-Events → SET_VIEW + STATE_TRANSITIONS

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  StudentKioskProvider,
  useStudentKiosk,
  KIOSK_STATES,
} from './StudentKioskContext'
import KioskShell from './KioskShell'
import NameState       from './states/NameState'
import WaitingState    from './states/WaitingState'
import PlayingState    from './states/PlayingState'
import SubmittedState  from './states/SubmittedState'
import PauseState      from './states/PauseState'
import { fetchReveal } from './kioskFetch'
import { useStudentSession, clearKioskSession } from './hooks/useStudentSession'
import { useStudentSocket } from './hooks/useStudentSocket'
import { useKioskGuard }    from './hooks/useKioskGuard'
import './KioskShell.css'

// ── Mini-Hook: holt einmalig /account/me, fuer den Auth-Banner. ──────
function useOptionalUserLabel() {
  const [label, setLabel] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    ;(async () => {
      try {
        const { API } = await import('../../../config')
        // apiGet statt fetch: liefert in der nativen App den Bearer-Token mit
        // (Cookies sind in der WKWebView cross-origin) + AbortController-Abbruch.
        const { apiGet } = await import('../../../api/client')
        const json = await apiGet(`${API}/account/me`, { signal: controller.signal })
        if (cancelled) return
        // Wir zeigen nur Namen/Email-Stub — keine Rolle, kein Plan-Status.
        const name = json?.user?.name || json?.user?.email || json?.email || null
        if (name) setLabel(String(name))
      } catch {
        // Banner ist optional — anonym (401)/Abbruch/Netzfehler still ignorieren.
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [])
  return label
}

// ── State-Router ──────────────────────────────────────────────────────
function StateRouter({ onToast }) {
  const { state } = useStudentKiosk()
  // Pause-Overlay hat Vorrang vor dem Spielscreen — aber nicht ueber dem
  // Namens-/End-Screen (dort ist Pause bedeutungslos). currentState bleibt
  // im Reducer erhalten, sodass Resume exakt dorthin zurueckkehrt.
  if (state.paused
      && state.currentState !== KIOSK_STATES.NAME
      && state.currentState !== KIOSK_STATES.ENDED) {
    return <PauseState />
  }
  switch (state.currentState) {
    case KIOSK_STATES.NAME:       return <NameState />
    case KIOSK_STATES.WAITING:    return <WaitingState />
    case KIOSK_STATES.PLAYING:    return <PlayingState onToast={onToast} />
    case KIOSK_STATES.SUBMITTED:  return <SubmittedState />
    case KIOSK_STATES.ENDED:      return <SubmittedState />
    default:                      return <WaitingState />
  }
}

// ── Inner: braucht den Provider als Vorfahre ─────────────────────────
function KioskRouteInner({ code, userLabel }) {
  const { state, dispatch } = useStudentKiosk()
  const [toast, setToast] = useState(null)

  // Toast nach 3 s automatisch ausblenden.
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  // useStudentSocket emittiert onRefreshView nach jedem Reconnect/view:updated.
  // Lazy-Bridge: Socket muss refreshView() rufen koennen, bevor useStudentSession
  // (unten) es liefert — der Ref wird in einem Effekt verdrahtet.
  const refreshRef = useRef({ fn: () => {} })

  // Socket: nur wenn Token vorhanden.
  const onSessionStarted = useCallback(() => {
    dispatch({ type: 'SET_SESSION_STATUS', status: 'running' })
  }, [dispatch])
  // P4: Session-Ende setzt revealed NICHT mehr direkt. Wir holen den
  // server-autoritativen Status per /me/view nach (refreshView) — SET_VIEW
  // leitet revealed + Endzustand daraus ab. Gleiches Muster wie session:started
  // / view:updated / assignment:changed.
  const onSessionEnded   = useCallback(() => {
    refreshRef.current.fn()
  }, [])
  const onSessionPaused  = useCallback(() => {
    dispatch({ type: 'SESSION_PAUSED' })
  }, [dispatch])
  const onSessionResumed = useCallback(() => {
    dispatch({ type: 'SESSION_RESUMED' })
  }, [dispatch])
  // Kick: zurück zum Beitritt (NICHT in die Auflösung). Der reguläre Pfad läuft
  // ohnehin über /me/view-403; dieser Handler ist die korrekte Socket-Variante.
  const onKicked = useCallback(() => {
    clearKioskSession()
    dispatch({ type: 'CLEAR' })
    setToast('Du wurdest aus dem Klassenraum entfernt.')
  }, [dispatch])

  const { connected: socketConnected, reconnecting } = useStudentSocket({
    token: state.token,
    enabled: !!state.token,
    onRefreshView: () => { refreshRef.current.fn() },
    onSessionStarted,
    onSessionEnded,
    onSessionPaused,
    onSessionResumed,
    onKicked,
  })

  const { refreshView, leave } = useStudentSession({ socketConnected })
  // Lazy-Bridge: Socket muss refreshView() rufen koennen, ohne dass die
  // Hook-Reihenfolge tanzt.
  useEffect(() => { refreshRef.current.fn = refreshView }, [refreshView])

  // Schritt 4 (C1): Sobald die Lehrkraft freigibt (revealed=true) UND eine
  // eigene Abgabe existiert, die item-genaue Aufloesung EINMALIG laden.
  // Der Server gated die Loesung serverseitig (R1) — vor der Freigabe kaeme
  // ohnehin nur { revealed:false } zurueck.
  // socketConnected in den Deps: schlaegt der erste Fetch fehl (z. B. Netz weg
  // genau im Freigabemoment), wird beim Reconnect erneut versucht, solange
  // revealData noch null ist (Code-Review M3).
  useEffect(() => {
    if (!state.revealed || !state.token || state.revealData || !state.submittedResult) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchReveal(state.token)
        if (!cancelled && data?.revealed) dispatch({ type: 'SET_REVEAL', data })
      } catch {
        // Aufloesung ist eine Ergaenzung — bei Fehler bleibt der Score-Recap.
      }
    })()
    return () => { cancelled = true }
  }, [state.revealed, state.token, state.revealData, state.submittedResult, socketConnected, dispatch])

  const { locked } = useKioskGuard({ code, currentState: state.currentState })

  if (locked) {
    return (
      <KioskShell code={code} confirmExit={false} onLeave={() => { clearKioskSession() }}>
        <div className="classroom-kiosk__lock">
          <p className="classroom-kiosk__dropcap">!</p>
          <h2>Bereits in einem anderen Tab geöffnet</h2>
          <p className="classroom-kiosk__lead">
            Dieser Klassenraum läuft schon in einem anderen Tab. Bitte dort weiterspielen.
          </p>
        </div>
      </KioskShell>
    )
  }

  // Bestaetigungs-Modal beim Verlassen NUR in playing/submitted.
  const confirmExit = state.currentState === KIOSK_STATES.PLAYING || state.currentState === KIOSK_STATES.SUBMITTED

  // Reconnect-Hinweis nur waehrend einer aktiven Teilnahme — im Namens-/
  // End-Screen ist er bedeutungslos. Eingaben in PlayingState bleiben dabei
  // erhalten (der Screen wird NICHT ausgetauscht, nur ein Banner ueberlagert).
  const showReconnecting = reconnecting && (
    state.currentState === KIOSK_STATES.WAITING ||
    state.currentState === KIOSK_STATES.PLAYING ||
    state.currentState === KIOSK_STATES.SUBMITTED
  )

  return (
    <KioskShell
      code={code}
      onLeave={() => { leave() }}
      loggedInUserLabel={userLabel}
      confirmExit={confirmExit}
      reconnecting={showReconnecting}
      toast={toast}
    >
      <StateRouter onToast={setToast} />
    </KioskShell>
  )
}

// ── Public ────────────────────────────────────────────────────────────
export default function StudentKioskRoute({ code }) {
  const userLabel = useOptionalUserLabel()
  return (
    <StudentKioskProvider initialCode={code || ''}>
      <KioskRouteInner code={code || ''} userLabel={userLabel} />
    </StudentKioskProvider>
  )
}
