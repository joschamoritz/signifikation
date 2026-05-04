import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API } from '../../config'
import { getErrorMessage, mapSessionState, readJsonSafe } from './classroomUtils'

export function useTeacherClassroom({ isTeacher, setTeacherError }) {
  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('')

  const [creating, setCreating] = useState(false)
  const [createNotice, setCreateNotice] = useState('')
  const [lastJoinCode, setLastJoinCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [sessionNameInput, setSessionNameInput] = useState('')

  const [timerTick, setTimerTick] = useState(0)

  const [dashboard, setDashboard] = useState(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')

  const [exportsList, setExportsList] = useState([])
  const [loadingExports, setLoadingExports] = useState(false)
  const [exportsError, setExportsError] = useState('')
  const [requestingExport, setRequestingExport] = useState('')

  const activeSessionIdRef = useRef('')

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId],
  )

  const loadSessions = useCallback(async () => {
    if (!isTeacher) return
    setLoadingSessions(true)
    try {
      const res = await fetch(`${API}/classroom/sessions?limit=10`, { credentials: 'include' })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setTeacherError(getErrorMessage(payload, 'Session-Historie konnte nicht geladen werden.'))
        return
      }
      const next = Array.isArray(payload?.sessions) ? payload.sessions : []
      setSessions(next)
      if (!activeSessionIdRef.current && next[0]?.id) {
        setActiveSessionId(next[0].id)
      } else if (activeSessionIdRef.current && !next.some((session) => session.id === activeSessionIdRef.current)) {
        setActiveSessionId(next[0]?.id || '')
      }
    } catch {
      setTeacherError('Session-Historie konnte nicht geladen werden.')
    } finally {
      setLoadingSessions(false)
    }
  }, [isTeacher, setTeacherError])

  const loadDashboard = useCallback(async (sessionId) => {
    if (!isTeacher || !sessionId) {
      setDashboard(null)
      return
    }
    setLoadingDashboard(true)
    setDashboardError('')
    try {
      const res = await fetch(`${API}/classroom/sessions/${sessionId}/dashboard`, {
        credentials: 'include',
      })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setDashboard(null)
        setDashboardError(getErrorMessage(payload, 'Dashboard konnte nicht geladen werden.'))
        return
      }
      setDashboard(payload)
    } catch {
      setDashboard(null)
      setDashboardError('Dashboard konnte nicht geladen werden.')
    } finally {
      setLoadingDashboard(false)
    }
  }, [isTeacher])

  const loadExports = useCallback(async (sessionId) => {
    if (!isTeacher || !sessionId) {
      setExportsList([])
      return
    }
    setLoadingExports(true)
    setExportsError('')
    try {
      const res = await fetch(`${API}/classroom/sessions/${sessionId}/exports`, {
        credentials: 'include',
      })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setExportsList([])
        setExportsError(getErrorMessage(payload, 'Exportstatus konnte nicht geladen werden.'))
        return
      }
      setExportsList(Array.isArray(payload?.exportJobs) ? payload.exportJobs : [])
    } catch {
      setExportsList([])
      setExportsError('Exportstatus konnte nicht geladen werden.')
    } finally {
      setLoadingExports(false)
    }
  }, [isTeacher])

  const createSession = useCallback(async () => {
    if (!isTeacher || creating) return
    setCreating(true)
    setCreateNotice('')
    try {
      const res = await fetch(`${API}/classroom/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings: { name: sessionNameInput.trim() || undefined } }),
      })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setCreateNotice(getErrorMessage(payload, 'Session konnte nicht erstellt werden.'))
        return
      }
      const session = payload?.session
      setLastJoinCode(payload?.joinCode || '')
      setCreateNotice('Sitzung erstellt. Zugangscode ist unten sichtbar.')
      await loadSessions()
      if (session?.id) setActiveSessionId(session.id)
    } catch {
      setCreateNotice('Session konnte nicht erstellt werden.')
    } finally {
      setCreating(false)
    }
  }, [creating, isTeacher, loadSessions, sessionNameInput])

  const updateSessionState = useCallback(async (action) => {
    if (!isTeacher || !activeSessionIdRef.current) return
    const sessionId = activeSessionIdRef.current
    const url = action === 'start'
      ? `${API}/classroom/sessions/${sessionId}/start`
      : `${API}/classroom/sessions/${sessionId}/finish`

    if (action === 'finish') {
      const connectedCount = Number(dashboard?.metrics?.connected_count || 0)
      if (connectedCount === 0) {
        const ok = window.confirm('Keine Teilnehmenden verbunden. Trotzdem beenden?')
        if (!ok) return
      }
    }

    setCreateNotice('')
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(action === 'start' ? { allowLateJoin: true } : {}),
      })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setCreateNotice(getErrorMessage(payload, `Session konnte nicht ${action === 'start' ? 'gestartet' : 'beendet'} werden.`))
        return
      }
      await loadSessions()
      await loadDashboard(sessionId)
      setCreateNotice(action === 'start' ? 'Session gestartet.' : 'Session beendet.')
    } catch {
      setCreateNotice(`Session konnte nicht ${action === 'start' ? 'gestartet' : 'beendet'} werden.`)
    }
  }, [dashboard?.metrics?.connected_count, isTeacher, loadDashboard, loadSessions])

  const requestExport = useCallback(async (type) => {
    if (!isTeacher || !activeSessionIdRef.current || requestingExport) return
    setRequestingExport(type)
    setExportsError('')
    try {
      const res = await fetch(`${API}/classroom/sessions/${activeSessionIdRef.current}/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type }),
      })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setExportsError(getErrorMessage(payload, 'Export konnte nicht gestartet werden.'))
        return
      }
      await loadExports(activeSessionIdRef.current)
    } catch {
      setExportsError('Export konnte nicht gestartet werden.')
    } finally {
      setRequestingExport('')
    }
  }, [isTeacher, loadExports, requestingExport])

  const copyJoinCode = useCallback(async () => {
    if (!lastJoinCode) return
    try {
      await navigator.clipboard.writeText(lastJoinCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      setCreateNotice('Zugangscode konnte nicht in die Zwischenablage kopiert werden.')
    }
  }, [lastJoinCode])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    if (!isTeacher) return
    loadSessions()
  }, [isTeacher, loadSessions])

  useEffect(() => {
    if (!isTeacher || !activeSessionId) return
    loadDashboard(activeSessionId)
    loadExports(activeSessionId)
  }, [activeSessionId, isTeacher, loadDashboard, loadExports])

  useEffect(() => {
    if (!isTeacher || !activeSessionId) return
    const current = sessions.find((session) => session.id === activeSessionId)
    if (!current || current.state === 'finished' || current.state === 'archived') return
    const timer = setInterval(() => {
      loadDashboard(activeSessionId)
      const liveSession = sessions.find((session) => session.id === activeSessionId)
      if (liveSession?.state !== 'running' && liveSession?.state !== 'lobby') {
        loadExports(activeSessionId)
      }
    }, 5000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, [activeSessionId, isTeacher, loadDashboard, loadExports, sessions])

  useEffect(() => {
    if (!activeSession?.startedAt) return
    if (activeSession.state === 'finished' || activeSession.state === 'archived') return
    const timer = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [activeSession?.startedAt, activeSession?.state])

  useEffect(() => {
    if (isTeacher) return
    setSessions([])
    setActiveSessionId('')
    setCreating(false)
    setCreateNotice('')
    setLastJoinCode('')
    setCodeCopied(false)
    setSessionNameInput('')
    setTimerTick(0)
    setDashboard(null)
    setDashboardError('')
    setExportsList([])
    setExportsError('')
    setRequestingExport('')
  }, [isTeacher])

  return {
    sessions,
    loadingSessions,
    activeSessionId,
    setActiveSessionId,
    creating,
    createNotice,
    lastJoinCode,
    codeCopied,
    sessionNameInput,
    setSessionNameInput,
    timerTick,
    dashboard,
    loadingDashboard,
    dashboardError,
    exportsList,
    loadingExports,
    exportsError,
    requestingExport,
    activeSession,
    createSession,
    updateSessionState,
    requestExport,
    copyJoinCode,
  }
}
