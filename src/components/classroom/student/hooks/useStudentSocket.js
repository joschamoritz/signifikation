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
// Reconnect: socket.io-client reconnect-Logik schickt handshake.auth
// automatisch mit, kein extra student:hello noetig. Bei flakigem WLAN
// kommt unser Pending-Pfad (student-pending + student:hello) NICHT zum
// Einsatz, weil wir den Token von Anfang an im Handshake haben.

import { useEffect, useRef, useState } from 'react'

const NAMESPACE = '/cr2'

export function useStudentSocket({ token, enabled = true, onRefreshView, onSessionStarted, onSessionEnded }) {
  const [connected, setConnected] = useState(false)
  const [error, setError]         = useState(null)
  const socketRef = useRef(null)

  const handlersRef = useRef({ onRefreshView, onSessionStarted, onSessionEnded })
  useEffect(() => { handlersRef.current = { onRefreshView, onSessionStarted, onSessionEnded } },
    [onRefreshView, onSessionStarted, onSessionEnded])

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
        })
        socketRef.current = socket

        socket.on('connect', () => {
          setConnected(true)
          setError(null)
          // Nach jedem Reconnect frisches /me/view holen — Server-State
          // koennte sich in der Disconnect-Phase geaendert haben.
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        socket.on('disconnect', () => setConnected(false))
        socket.on('connect_error', (err) => {
          setError(err?.message || 'Socket-Fehler')
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
        socket.on('view:updated', () => {
          try { handlersRef.current?.onRefreshView?.() } catch {}
        })
        socket.on('kicked', (payload) => {
          try { handlersRef.current?.onSessionEnded?.({ ...payload, reason: 'kicked' }) } catch {}
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
      setConnected(false)
    }
  }, [token, enabled])

  return { connected, error }
}
