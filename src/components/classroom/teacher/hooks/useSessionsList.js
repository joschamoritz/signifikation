// T-4.8 — kleiner Wrapper um GET /sessions mit Lade-/Fehler-State.
// Pagination ist im Endpoint vorhanden (limit), aber wir starten in
// Welle 1 ohne Infinite-Scroll: 50 Sessions ist die UI-Schwelle, danach
// kommt eine Hinweiszeile. Falls Lehrkraefte mehr brauchen, kommt das
// in Welle 2.

import { useCallback, useEffect, useState } from 'react'
import { listSessions } from './useTeacherSession'

const ACTIVE_STATUS = new Set(['lobby', 'running', 'paused'])

export function useSessionsList({ limit = 50, pollMs = 0 } = {}) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  // silent: für Hintergrund-Polling — kein Lade-/Fehler-Flackern.
  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const data = await listSessions({ limit })
      setSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    } catch (err) {
      if (!silent) setError(err?.message || 'Sitzungen konnten nicht geladen werden.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [limit])

  useEffect(() => { refresh() }, [refresh])

  // Auto-Refresh, solange mind. eine Sitzung aktiv ist (lobby/running/paused),
  // damit der Status nicht veraltet, wenn die Lehrkraft auf der Liste verweilt.
  useEffect(() => {
    if (!pollMs) return undefined
    if (!sessions.some((s) => ACTIVE_STATUS.has(s.status))) return undefined
    const id = setInterval(() => refresh({ silent: true }), pollMs)
    return () => clearInterval(id)
  }, [pollMs, sessions, refresh])

  return { sessions, loading, error, refresh }
}
