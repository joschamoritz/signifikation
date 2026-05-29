// T-4.8 — Realtime-Hook fuer den Teacher-Tab.
//
// Verbindung zum Namespace /cr2 (siehe server/realtime/classroomSocketV2.js).
// Auth laeuft ueber den bestehenden Cookie/Dev-Header-Pfad, plus der
// Session-ID im handshake.auth. socket.io-client wird LAZY geladen, damit
// der Tab-Bundle-Footprint klein bleibt (~32 KB).
//
// Der Hook nimmt einen `handlers`-Map entgegen (Event-Name → Callback)
// und reattach't bei Reconnect. Wir geben den connect/disconnect-Status
// zurueck, damit die UI einen Indikator anzeigen kann.

import { useEffect, useRef, useState } from 'react'

const NAMESPACE = '/cr2'

export function useTeacherSocket({ sessionId, enabled = true, handlers = {} }) {
  const [connected, setConnected] = useState(false)
  const [error, setError]         = useState(null)
  const socketRef = useRef(null)
  // Handler-Map als Ref, damit ein einmal-aufgebauter Socket nicht bei jeder
  // Component-Re-Render neu verbindet, nur weil sich die Callback-Identitaet
  // geaendert hat.
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers }, [handlers])

  useEffect(() => {
    if (!enabled || !sessionId) return undefined
    let socket = null
    let cancelled = false

    ;(async () => {
      try {
        const mod = await import('socket.io-client')
        if (cancelled) return
        const io = mod.io
        socket = io(NAMESPACE, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          auth: { sessionId, role: 'teacher' },
          withCredentials: true,
        })
        socketRef.current = socket

        socket.on('connect', () => {
          setConnected(true)
          setError(null)
        })
        socket.on('disconnect', () => setConnected(false))
        socket.on('connect_error', (err) => {
          setError(err?.message || 'Socket-Fehler')
        })

        const TEACHER_EVENTS = [
          'student:joined',
          'student:left',
          'student:heartbeat',
          'submission:received',
          'participant:progress',
          'session:started',
          'session:finished',
          'session:aborted',
          'session:paused',
          'session:resumed',
        ]
        for (const ev of TEACHER_EVENTS) {
          socket.on(ev, (payload) => {
            const fn = handlersRef.current?.[ev]
            if (typeof fn === 'function') fn(payload)
          })
        }
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
  }, [sessionId, enabled])

  return { connected, error, socket: socketRef.current }
}
