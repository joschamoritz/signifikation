import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API } from '../config'
import {
  WEEKDAYS, MONTHS,
  localDateStr, computeStreak,
} from '../utils/homeUtils'

const HEARTBEAT_INTERVAL_MS = 15_000
const HOST_TIMEOUT_MS = 120_000

function formatDateTime(ts) {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ts))
  } catch {
    return String(ts)
  }
}

function mapSessionState(state) {
  switch (state) {
    case 'running':
      return 'Laufend'
    case 'lobby':
      return 'Lobby'
    case 'finished':
      return 'Beendet'
    case 'archived':
      return 'Archiviert'
    case 'created':
      return 'Vorbereitet'
    default:
      return state || 'Unbekannt'
  }
}

function readJsonSafe(response) {
  return response.json().catch(() => null)
}

function getErrorMessage(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
  return fallback
}

function makeDistributionBuckets(values) {
  if (!Array.isArray(values)) return []
  return values.map((count, idx) => ({
    label: `${idx * 10}-${idx * 10 + 9}`,
    count: Number(count || 0),
  }))
}

function participantLabel(index) {
  return `Teilnehmende ${index + 1}`
}

function parseStorageKey(sessionId) {
  return `sig_classroom_join_${sessionId}`
}

function sanitizeJoinCodeInput(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
}

function humanizeJoinError(message) {
  const text = String(message || '')
  if (text.includes('ungueltig') || text.includes('abgelaufen')) {
    return 'Zugangscode ungueltig oder abgelaufen. Bitte Lehrkraft nach dem aktuellen Code fragen.'
  }
  if (text.includes('Zu viele Versuche')) {
    return 'Zu viele Versuche. Bitte 5 Minuten warten und dann erneut eingeben.'
  }
  return text || 'Beitritt fehlgeschlagen.'
}

export default function ClassroomTab() {
  const streak = computeStreak()
  const today = new Date()
  const dateStr = localDateStr(today)

  const [account, setAccount] = useState(null)
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [teacherError, setTeacherError] = useState('')

  const [sessions, setSessions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('')

  const [creating, setCreating] = useState(false)
  const [createNotice, setCreateNotice] = useState('')
  const [lastJoinCode, setLastJoinCode] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')

  const [exportsList, setExportsList] = useState([])
  const [loadingExports, setLoadingExports] = useState(false)
  const [exportsError, setExportsError] = useState('')
  const [requestingExport, setRequestingExport] = useState('')

  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joinNotice, setJoinNotice] = useState('')
  const [participantSession, setParticipantSession] = useState(null)
  const [participantInfo, setParticipantInfo] = useState(null)
  const [joining, setJoining] = useState(false)

  const [submitRoundNo, setSubmitRoundNo] = useState(1)
  const [submitScore, setSubmitScore] = useState(0)
  const [submitMaxScore, setSubmitMaxScore] = useState(10)
  const [submitNotice, setSubmitNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [socketConnected, setSocketConnected] = useState(false)
  const [socketState, setSocketState] = useState('')
  const [socketMetrics, setSocketMetrics] = useState(null)
  const [socketError, setSocketError] = useState('')
  const [hostCountdown, setHostCountdown] = useState(0)

  const socketRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const hostTimeoutTimerRef = useRef(null)
  const hostCountdownTimerRef = useRef(null)
  const activeSessionIdRef = useRef('')

  const isTeacher = account?.role === 'teacher'
  const activeSession = useMemo(() => sessions.find((s) => s.id === activeSessionId) || null, [sessions, activeSessionId])

  const clearParticipantRuntime = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    if (hostTimeoutTimerRef.current) {
      clearTimeout(hostTimeoutTimerRef.current)
      hostTimeoutTimerRef.current = null
    }
    if (hostCountdownTimerRef.current) {
      clearInterval(hostCountdownTimerRef.current)
      hostCountdownTimerRef.current = null
    }
    setHostCountdown(0)
  }, [])

  const teardownSocket = useCallback(() => {
    const s = socketRef.current
    if (!s) return
    try {
      s.close()
    } catch {}
    socketRef.current = null
    setSocketConnected(false)
  }, [])

  const loadAccount = useCallback(async () => {
    setLoadingAccount(true)
    setTeacherError('')
    try {
      const res = await fetch(`${API}/account/me`, { credentials: 'include' })
      if (!res.ok) {
        setAccount(null)
        if (res.status === 401) {
          setTeacherError('Der Klassenraum ist fuer Lehrkraft-Konten der Gesamtausgabe verfuegbar. Im Konto-Tab anmelden und freischalten.')
        } else {
          setTeacherError('Konto konnte nicht geladen werden.')
        }
        return
      }
      const payload = await res.json()
      setAccount(payload)
      if (payload?.role !== 'teacher') {
        setTeacherError('Der Klassenraum ist fuer Lehrkraft-Konten der Gesamtausgabe vorgesehen.')
      }
    } catch {
      setAccount(null)
      setTeacherError('Netzwerkfehler beim Laden des Kontos.')
    } finally {
      setLoadingAccount(false)
    }
  }, [])

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
      } else if (activeSessionIdRef.current && !next.some((s) => s.id === activeSessionIdRef.current)) {
        setActiveSessionId(next[0]?.id || '')
      }
    } catch {
      setTeacherError('Session-Historie konnte nicht geladen werden.')
    } finally {
      setLoadingSessions(false)
    }
  }, [isTeacher])

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

  const ensureTeacherSocket = useCallback(async (sessionId) => {
    if (!isTeacher || !sessionId) return
    const active = sessions.find((s) => s.id === sessionId)
    if (!active || (active.state !== 'running' && active.state !== 'lobby' && active.state !== 'created')) return

    try {
      const authRes = await fetch(`${API}/classroom/sessions/${sessionId}/teacher-socket-auth`, {
        method: 'POST',
        credentials: 'include',
      })
      const authPayload = await readJsonSafe(authRes)
      if (!authRes.ok || !authPayload?.teacherUserId) return

      const mod = await import('socket.io-client')
      const io = mod.io
      const socket = io('/', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      })

      socket.on('connect', () => {
        socket.emit('classroom:teacher-join', {
          sessionId,
          teacherUserId: authPayload.teacherUserId,
        })
      })

      socket.on('classroom:state', () => {
        loadSessions()
        loadDashboard(sessionId)
      })

      socket.on('classroom:metrics', () => {
        loadDashboard(sessionId)
      })

      setTimeout(() => {
        try { socket.close() } catch {}
      }, 5000).unref?.()
    } catch {}
  }, [isTeacher, loadDashboard, loadSessions, sessions])

  const createSession = useCallback(async () => {
    if (!isTeacher || creating) return
    setCreating(true)
    setCreateNotice('')
    try {
      const res = await fetch(`${API}/classroom/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
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
  }, [creating, isTeacher, loadSessions])

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

  const postParticipantHeartbeat = useCallback(async (participant) => {
    try {
      await fetch(`${API}/classroom/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: participant.sessionId,
          participantId: participant.id,
          participantToken: participant.token,
        }),
      })
    } catch {}
  }, [])

  const setupSocket = useCallback(async (joinedSession, participant) => {
    clearParticipantRuntime()
    teardownSocket()
    if (!joinedSession?.id || !participant?.id || !participant?.token) return

    try {
      const mod = await import('socket.io-client')
      const io = mod.io
      const socket = io('/', {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      })
      socketRef.current = socket

      socket.on('connect', () => {
        setSocketConnected(true)
        setSocketError('')
        setSocketState('Verbunden')
        socket.emit('classroom:join', {
          sessionId: joinedSession.id,
          participantId: participant.id,
          participantToken: participant.token,
        })
      })

      socket.on('disconnect', () => {
        setSocketConnected(false)
      })

      socket.on('classroom:state', (payload) => {
        setSocketState(`Session: ${mapSessionState(payload?.state)}`)
      })

      socket.on('classroom:metrics', (payload) => {
        setSocketMetrics(payload || null)
      })

      socket.on('classroom:results', (payload) => {
        if (payload?.accepted) {
          setSubmitNotice(`Runde ${payload.roundNo}: uebermittelt.`)
        }
      })

      socket.on('classroom:error', (payload) => {
        const message = payload?.message || 'Socket-Fehler'
        setSocketError(humanizeJoinError(message))
        if (payload?.code === 'HOST_TIMEOUT') {
          clearParticipantRuntime()
          setHostCountdown(Math.ceil(HOST_TIMEOUT_MS / 1000))
          hostCountdownTimerRef.current = setInterval(() => {
            setHostCountdown((prev) => {
              if (prev <= 1) {
                if (hostCountdownTimerRef.current) {
                  clearInterval(hostCountdownTimerRef.current)
                  hostCountdownTimerRef.current = null
                }
                return 0
              }
              return prev - 1
            })
          }, 1000)
          hostCountdownTimerRef.current.unref?.()
        }
        if (payload?.code === 'INVALID_CODE') {
          setJoinNotice('Zugangscode ungueltig oder abgelaufen. Bitte Lehrkraft nach dem aktuellen Code fragen.')
        }
      })

      heartbeatTimerRef.current = setInterval(() => {
        socket.emit('classroom:heartbeat', {
          sessionId: joinedSession.id,
          participantId: participant.id,
          participantToken: participant.token,
        })
        postParticipantHeartbeat({ sessionId: joinedSession.id, id: participant.id, token: participant.token })
      }, HEARTBEAT_INTERVAL_MS)
      heartbeatTimerRef.current.unref?.()

      hostTimeoutTimerRef.current = setTimeout(() => {
        setSocketError('Verbindung zur Lehrkraft unterbrochen. Session wird beendet.')
      }, HOST_TIMEOUT_MS)
      hostTimeoutTimerRef.current.unref?.()
    } catch {
      setSocketError('Echtzeitverbindung konnte nicht aufgebaut werden.')
    }
  }, [clearParticipantRuntime, postParticipantHeartbeat, teardownSocket])

  const joinSession = useCallback(async () => {
    if (joining) return
    setJoining(true)
    setJoinNotice('')
    setSocketError('')
    try {
      const res = await fetch(`${API}/classroom/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCodeInput.trim().toLowerCase() }),
      })
      const payload = await readJsonSafe(res)
      if (!res.ok) {
        setJoinNotice(humanizeJoinError(getErrorMessage(payload, 'Beitritt fehlgeschlagen.')))
        return
      }
      const joinedSession = payload?.session
      const participant = payload?.participant
      if (!joinedSession || !participant) {
        setJoinNotice('Beitritt fehlgeschlagen.')
        return
      }
      setParticipantSession(joinedSession)
      setParticipantInfo({
        id: participant.id,
        token: participant.token,
        sessionId: joinedSession.id,
      })
      try {
        localStorage.setItem(
          parseStorageKey(joinedSession.id),
          JSON.stringify({ id: participant.id, token: participant.token, sessionId: joinedSession.id }),
        )
      } catch {}
      setJoinNotice('Beitritt erfolgreich.')
      setSubmitNotice('')
      setSubmitRoundNo(1)
      setSubmitScore(0)
      setSubmitMaxScore(10)
      await setupSocket(joinedSession, participant)
    } catch {
      setJoinNotice('Netzwerkfehler beim Beitritt.')
    } finally {
      setJoining(false)
    }
  }, [joinCodeInput, joining, setupSocket])

  const submitRound = useCallback(async (event) => {
    event.preventDefault()
    if (!participantInfo || !participantSession || submitting) return
    setSubmitting(true)
    setSubmitNotice('')
    try {
      const payload = {
        roundNo: Number(submitRoundNo),
        score: Number(submitScore),
        maxScore: Number(submitMaxScore),
        payload: {},
      }

      const socket = socketRef.current
      if (socket && socket.connected) {
        socket.emit('classroom:submit', payload)
      }

      const res = await fetch(`${API}/classroom/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: participantSession.id,
          participantId: participantInfo.id,
          participantToken: participantInfo.token,
        }),
      })
      if (!res.ok) {
        const e = await readJsonSafe(res)
        setSubmitNotice(getErrorMessage(e, 'Heartbeat fehlgeschlagen.'))
        return
      }
      setSubmitNotice(`Runde ${payload.roundNo}: gesendet.`)
    } catch {
      setSubmitNotice('Runde konnte nicht gesendet werden.')
    } finally {
      setSubmitting(false)
    }
  }, [participantInfo, participantSession, submitMaxScore, submitRoundNo, submitScore, submitting])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    loadAccount()
  }, [loadAccount])

  useEffect(() => {
    if (!isTeacher) return
    loadSessions()
  }, [isTeacher, loadSessions])

  useEffect(() => {
    if (!isTeacher || !activeSessionId) return
    loadDashboard(activeSessionId)
    loadExports(activeSessionId)
    ensureTeacherSocket(activeSessionId)
  }, [activeSessionId, ensureTeacherSocket, isTeacher, loadDashboard, loadExports])

  useEffect(() => {
    if (!isTeacher || !activeSessionId) return
    const timer = setInterval(() => {
      loadDashboard(activeSessionId)
      loadExports(activeSessionId)
    }, 5000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, [activeSessionId, isTeacher, loadDashboard, loadExports])

  useEffect(() => {
    if (participantInfo || sessions.length === 0) return
    for (const s of sessions) {
      try {
        const raw = localStorage.getItem(parseStorageKey(s.id))
        if (!raw) continue
        const parsed = JSON.parse(raw)
        if (parsed?.sessionId === s.id && parsed?.id && parsed?.token) {
          setParticipantSession(s)
          setParticipantInfo(parsed)
          setupSocket(s, parsed)
          break
        }
      } catch {}
    }
  }, [participantInfo, sessions, setupSocket])

  useEffect(() => () => {
    clearParticipantRuntime()
    teardownSocket()
  }, [clearParticipantRuntime, teardownSocket])

  return (
    <div className="tab-placeholder classroom-tab">
      <header className="test-title-section" role="banner">
        <p className="test-overline">Tägliches Wortspiel · Linguistik</p>
        <h1 className="test-title">Signifikation</h1>
        <p className="test-subtitle">
          <time dateTime={dateStr}>
            {`${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
          </time>
        </p>
        {streak > 0 && (
          <span className="test-title-streak" aria-label={`${streak} Tage Streak`}>
            🔥 {streak}
          </span>
        )}
      </header>

      <div className="tab-placeholder-inner classroom-inner">
        <div className="tab-placeholder-head">
          <h2 className="tab-placeholder-title">Klassenraum</h2>
          <span className="tab-placeholder-ipa">[ˈklasənˌʀaʊ̯m]</span>
        </div>
        <div className="tab-placeholder-grammar">
          <span className="tab-placeholder-pos">Bereich</span>
          <span className="tab-placeholder-rule-line" />
          <span className="tab-placeholder-category">Lehrkraefte</span>
        </div>

        <p className="tab-placeholder-definition">
          Gemeinsame Spielsitzungen fuer Gruppen und Klassen. Kollaboratives Lernen mit Echtzeit-Vergleich und didaktischer Auswertung.
        </p>

        <ul className="tab-placeholder-features classroom-features">
          <li>Lehrkraft erstellt Sitzungen, startet und beendet im eigenen Takt.</li>
          <li>Lernende treten anonym mit Zugangscode bei und spielen gleichzeitig.</li>
          <li>Live-Kennzahlen zeigen Beteiligung, Abgaben und Punktverteilung.</li>
          <li>Ergebnisse koennen als CSV oder PDF fuer Nachbereitung exportiert werden.</li>
        </ul>

        {loadingAccount ? (
          <p className="tab-placeholder-definition">Konto wird geladen …</p>
        ) : teacherError ? (
          <p className="classroom-error">{teacherError}</p>
        ) : null}

        {isTeacher && (
          <section className="classroom-panel">
            <div className="classroom-panel-head">
              <h3 className="classroom-panel-title">Lehrkraft-Dashboard</h3>
              <button
                className="test-cta"
                type="button"
                onClick={createSession}
                disabled={creating}
              >
                Session erstellen
              </button>
            </div>

            {createNotice && <p className="classroom-note">{createNotice}</p>}
            {lastJoinCode && (
              <p className="classroom-join-code" aria-live="polite">
                Zugangscode: <strong>{lastJoinCode}</strong>
              </p>
            )}

            <div className="classroom-grid">
              <article className="classroom-card">
                <h4 className="classroom-card-title">Session-Historie (letzte 10)</h4>
                {loadingSessions ? <p className="classroom-muted">Laedt …</p> : null}
                {!loadingSessions && sessions.length === 0 ? <p className="classroom-muted">Noch keine Sessions.</p> : null}
                {sessions.length > 0 && (
                  <ul className="classroom-session-list">
                    {sessions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`classroom-session-btn${activeSessionId === s.id ? ' classroom-session-btn--active' : ''}`}
                          onClick={() => setActiveSessionId(s.id)}
                        >
                          <span>{s.datum}/{s.year}</span>
                          <span>{mapSessionState(s.state)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="classroom-card">
                <h4 className="classroom-card-title">Aktive Session</h4>
                {!activeSession ? <p className="classroom-muted">Keine Session ausgewaehlt.</p> : null}
                {activeSession && (
                  <>
                    <dl className="classroom-kv">
                      <div><dt>Status</dt><dd>{mapSessionState(activeSession.state)}</dd></div>
                      <div><dt>Erstellt</dt><dd>{formatDateTime(activeSession.createdAt)}</dd></div>
                      <div><dt>Gestartet</dt><dd>{formatDateTime(activeSession.startedAt)}</dd></div>
                      <div><dt>Beendet</dt><dd>{formatDateTime(activeSession.finishedAt)}</dd></div>
                    </dl>
                    <div className="classroom-actions">
                      <button
                        className="test-cta"
                        type="button"
                        onClick={() => updateSessionState('start')}
                        disabled={activeSession.state === 'running' || activeSession.state === 'finished' || activeSession.state === 'archived'}
                      >
                        Starten
                      </button>
                      <button
                        className="test-cta"
                        type="button"
                        onClick={() => updateSessionState('finish')}
                        disabled={activeSession.state === 'finished' || activeSession.state === 'archived'}
                      >
                        Beenden
                      </button>
                    </div>
                  </>
                )}
              </article>

              <article className="classroom-card">
                <h4 className="classroom-card-title">Live-Metriken</h4>
                {loadingDashboard ? <p className="classroom-muted">Laedt …</p> : null}
                {dashboardError ? <p className="classroom-error">{dashboardError}</p> : null}
                {dashboard?.metrics && (
                  <>
                    <dl className="classroom-kv classroom-kv--metrics">
                      <div><dt>Verbunden</dt><dd>{dashboard.metrics.connected_count}</dd></div>
                      <div><dt>Abgegeben</dt><dd>{dashboard.metrics.submitted_count}</dd></div>
                      <div><dt>Durchschnitt</dt><dd>{dashboard.metrics.avg_score}</dd></div>
                      <div><dt>Gesamt</dt><dd>{dashboard.metrics.total_count}</dd></div>
                    </dl>
                    <div className="classroom-distribution" aria-label="Score-Verteilung">
                      {makeDistributionBuckets(dashboard.metrics.score_distribution).map((bucket, idx) => (
                        <div key={`${bucket.label}-${idx}`} className="classroom-distribution-row">
                          <span className="classroom-distribution-label">{bucket.label}</span>
                          <span className="classroom-distribution-bar-wrap">
                            <span
                              className="classroom-distribution-bar"
                              style={{ width: `${Math.min(100, bucket.count * 12)}%` }}
                            />
                          </span>
                          <span className="classroom-distribution-count">{bucket.count}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <article className="classroom-card classroom-card--full">
                <h4 className="classroom-card-title">Exporte</h4>
                <div className="classroom-actions">
                  <button
                    className="test-cta"
                    type="button"
                    onClick={() => requestExport('csv')}
                    disabled={!activeSession || activeSession.state !== 'finished' || requestingExport === 'csv'}
                  >
                    CSV erzeugen
                  </button>
                  <button
                    className="test-cta"
                    type="button"
                    onClick={() => requestExport('pdf')}
                    disabled={!activeSession || activeSession.state !== 'finished' || requestingExport === 'pdf'}
                  >
                    PDF erzeugen
                  </button>
                </div>
                {loadingExports ? <p className="classroom-muted">Laedt …</p> : null}
                {exportsError ? <p className="classroom-error">{exportsError}</p> : null}
                {!loadingExports && exportsList.length === 0 ? (
                  <p className="classroom-muted">Noch keine Exportjobs.</p>
                ) : null}
                {exportsList.length > 0 && (
                  <ul className="classroom-export-list">
                    {exportsList.map((e) => (
                      <li key={e.id}>
                        <span>{e.type.toUpperCase()}</span>
                        <span>{e.status}</span>
                        <span>{formatDateTime(e.createdAt)}</span>
                        <span className="classroom-export-ref">
                          {e.status === 'done' ? (
                            <a
                              href={`${API}/classroom/sessions/${activeSessionId}/exports/${e.id}/download`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          ) : (e.fileRef || '—')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </section>
        )}

        <section className="classroom-panel classroom-panel--participant">
          <div className="classroom-panel-head">
            <h3 className="classroom-panel-title">Lernende-Beitritt (anonym)</h3>
          </div>
          <form
            className="classroom-join-form"
            onSubmit={(event) => {
              event.preventDefault()
              joinSession()
            }}
          >
            <label className="classroom-field">
              <span>Zugangscode</span>
              <input
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(sanitizeJoinCodeInput(event.target.value))}
                placeholder="zugangscode eingeben"
                maxLength={20}
                autoComplete="off"
              />
            </label>
            <button className="test-cta" type="submit" disabled={joining}>Beitreten</button>
          </form>
          {joinNotice ? <p className="classroom-note">{joinNotice}</p> : null}

          {participantSession && participantInfo && (
            <div className="classroom-participant-box classroom-margin-note">
              <p className="classroom-margin-title">Randnotiz</p>
              <p className="classroom-note classroom-margin-line">
                Teilnahme aktiv: <strong>{participantLabel(0)}</strong> · Sitzung {participantSession.id}
              </p>
              <p className="classroom-muted classroom-margin-line">Status: {mapSessionState(participantSession.state)} · Socket: {socketConnected ? 'online' : 'offline'}</p>
              {socketState ? <p className="classroom-muted classroom-margin-line">{socketState}</p> : null}
              {socketError ? <p className="classroom-error classroom-margin-line">{socketError}</p> : null}
              {hostCountdown > 0 ? (
                <p className="classroom-error classroom-margin-line">Verbindung zur Lehrkraft unterbrochen. Sitzung endet in {hostCountdown}s.</p>
              ) : null}

              {socketMetrics && (
                <dl className="classroom-kv classroom-kv--metrics">
                  <div><dt>Verbunden</dt><dd>{socketMetrics.connected_count}</dd></div>
                  <div><dt>Abgegeben</dt><dd>{socketMetrics.submitted_count}</dd></div>
                  <div><dt>Durchschnitt</dt><dd>{socketMetrics.avg_score}</dd></div>
                </dl>
              )}

              <form className="classroom-submit-form" onSubmit={submitRound}>
                <label className="classroom-field">
                  <span>Runde</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={submitRoundNo}
                    onChange={(event) => setSubmitRoundNo(event.target.value)}
                  />
                </label>
                <label className="classroom-field">
                  <span>Score</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={submitScore}
                    onChange={(event) => setSubmitScore(event.target.value)}
                  />
                </label>
                <label className="classroom-field">
                  <span>Max</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={submitMaxScore}
                    onChange={(event) => setSubmitMaxScore(event.target.value)}
                  />
                </label>
                <button className="test-cta" type="submit" disabled={submitting}>Runde senden</button>
              </form>
              {submitNotice ? <p className="classroom-note">{submitNotice}</p> : null}
            </div>
          )}
        </section>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-status">In Entwicklung.</span>
          <span className="tab-placeholder-edition">Beta-Modus fuer Unterrichtssitzungen.</span>
        </div>
      </div>
    </div>
  )
}
