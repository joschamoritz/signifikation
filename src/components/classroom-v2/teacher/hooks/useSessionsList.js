// T-4.8 — kleiner Wrapper um GET /sessions mit Lade-/Fehler-State.
// Pagination ist im Endpoint vorhanden (limit), aber wir starten in
// Welle 1 ohne Infinite-Scroll: 50 Sessions ist die UI-Schwelle, danach
// kommt eine Hinweiszeile. Falls Lehrkraefte mehr brauchen, kommt das
// in Welle 2.

import { useCallback, useEffect, useState } from 'react'
import { listSessions } from './useTeacherSession'

export function useSessionsList({ limit = 50 } = {}) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSessions({ limit })
      setSessions(Array.isArray(data?.sessions) ? data.sessions : [])
    } catch (err) {
      setError(err?.message || 'Sessions konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => { refresh() }, [refresh])

  return { sessions, loading, error, refresh }
}
