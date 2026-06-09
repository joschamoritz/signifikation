// T-5.9 — Schueler-Socket-Hook.
//
// Verbindung zum /cr2-Namespace mit Bearer-Token in handshake.auth.
// Hört die fuer Schueler relevanten Events (siehe Plan §6):
//   - session:started   → SET_SESSION_STATUS('running') + refreshView
//   - session:finished  → SESSION_ENDED
//   - session:aborted   → SESSION_ENDED
//   - view:updated      → refreshView (Server pusht das nach jedem Submit)
//   - kicked            → SESSION_ENDED('kicked')
//
// Wiederverbindungs-Strategie (W2-T5): wir verlassen uns BEWUSST auf die
// eingebaute exponentielle Backoff-Mechanik von socket.io-client — KEIN
// eigener setTimeout-Retry (das waere ein Timing-Bastel statt einer Loesung).
// Der Manager verdoppelt den Delay je Versuch (reconnectionDelay →
// reconnectionDelayMax) und streut ihn per randomizationFactor, sodass eine
// ganze Klasse nach einem WLAN-Drop nicht gleichzeitig gegen den Server
// haemmert (thundering herd). reconnectionAttempts ist unendlich, weil ein
// 30-s-Abbruch (D6: 5-Min-Fenster) muehelos ueberbrueckbar sein muss.
// Der Token steckt im handshake.auth und wird bei JEDEM Reconnect-Versuch
// automatisch erneut mitgeschickt → der Server bindet uns an denselben
// classroom_participant (kein neuer Teilnehmer, kein verlorener Platz).
//
// Nach jedem erfolgreichen (Re-)Connect holen wir den Wahrheitszustand per
// /me/view (server-autoritativ, D13) — der alte Client-State wird nicht blind
// weiterbenutzt. So landet der Schueler nach einem Moduswechsel waehrend des
// Abbruchs (assignment:changed, W2-T2) im korrekten aktiven Assignment.

import { useEffect, useRef, useState } from 'react'

const NAMESPACE = '/cr2'

export function useStudentSocket({ token, enabled = true, onRefreshView, onSessionStarted, onSessionEnded, onSessionPaused, onSessionResumed, onKicked }) {
  const [connected, setConnected]       = useState(false)
  // reconnecting = wir waren schon mal verbunden, sind es jetzt nicht und der
  // Manager versucht (per Backoff oben) gerade die Wiederverbindung. Steuert
  // den dezenten „Verbindung wird wiederhergestellt…"-Hinweis in der Shell.
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError]               = useState(null)
  const socketRef     = useRef(null)
  const everConnected = useRef(false)

  const handlersRef = useRef({ onRefreshView, onSessionStarted, onSessionEnded, onSessionPaused, onSessionResumed, onKicked })
  useEffect(() => { handlersRef.current = { onRefreshView, onSessionStarted, onSessionEnded, onSessionPaused, onSessionResumed, onKicked } },
    [onRefreshView, onSessionStarted, onSessionEnded, onSessionPaused, onSessionResumed, onKicked])

  useEffect(() => {
    if (!enabled || !token) return undefined
    let cancelled = false
    let socket = null

    ;(async () => {
      try {
        const mod = await import('socket.io-client')
        if (cancelled) return
        socket = mod.io(NAMESPACE, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          auth: { token },
          // KEIN withCredentials — Schueler hat keine Auth-Cookies.
          // Exponentielles Backoff (Begruendung im Datei-Header):
          reconnection:         true,
          reconnectionAttempts: Infinity,
          reconnectionDelay:    800,
          reconnectionDelayMax: 5000,
          randomizationFactor:  0.5,
        })
        socketRef.current = socket

        socket.on('connect', () => {
          everConnected.current = true
          setConnected(true)
          setReconnecting(false)
          setError(null)
          // Nach jedem Reconnect frisches /me/view holen — Server-State
          // koennte sich in der Disconnect-Phase geaendert haben.
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        socket.on('disconnect', (reason) => {
          setConnected(false)
          // 'io client disconnect' = wir haben selbst getrennt (Unmount/Leave)
          // → kein Reconnect-Hinweis. Alles andere (transport close, ping
          // timeout, transport error) ist ein echter Abbruch, bei dem der
          // Manager automatisch weiterversucht → Hinweis einblenden.
          if (everConnected.current && reason !== 'io client disconnect') {
            setReconnecting(true)
          }
        })
        socket.on('connect_error', (err) => {
          setError(err?.message || 'Socket-Fehler')
          // Erst-Connect fehlgeschlagen ist kein „reconnect"; nur wenn wir
          // schon einmal verbunden waren, ist das ein echter Wiederaufbau.
          if (everConnected.current) setReconnecting(true)
        })

        socket.on('session:started', (payload) => {
          try { handlersRef.current?.onSessionStarted?.(payload) } catch {}
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        socket.on('session:finished', (payload) => {
          try { handlersRef.current?.onSessionEnded?.({ ...payload, reason: 'finished' }) } catch {}
        })
        socket.on('session:aborted', (payload) => {
          try { handlersRef.current?.onSessionEnded?.({ ...payload, reason: 'aborted' }) } catch {}
        })
        socket.on('session:paused', (payload) => {
          try { handlersRef.current?.onSessionPaused?.(payload) } catch {}
        })
        socket.on('session:resumed', (payload) => {
          try { handlersRef.current?.onSessionResumed?.(payload) } catch {}
          // Server-State nach Resume frisch holen, damit currentLemma/progress stimmen.
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        socket.on('view:updated', () => {
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        // W2-T2: Modus-Wechsel. Payload traegt nur Metadaten (mode/index/total),
        // KEINEN content_snapshot (R1). Wir holen die neue, gewhitelistete
        // Aufgabe per /me/view nach — gleiches Muster wie view:updated. Der
        // Reducer (SET_VIEW) raeumt den alten Submitted-Zustand auf.
        socket.on('assignment:changed', () => {
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        socket.on('kicked', (payload) => {
          try { handlersRef.current?.onKicked?.(payload) } catch {}
        })
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Socket-Load fehlgeschlagen')
      }
    })()

    return () => {
      cancelled = true
      try { socket?.removeAllListeners() } catch {}
      try { socket?.disconnect() } catch {}
      socketRef.current = null
      everConnected.current = false
      setConnected(false)
      setReconnecting(false)
    }
  }, [token, enabled])

  return { connected, reconnecting, error }
}
