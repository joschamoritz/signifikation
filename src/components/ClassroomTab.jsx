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

function formatElapsed(startedAt) {
  if (!startedAt) return '—'
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
  if (text.includes('ungueltig') || text.includes('abgelaufen') || text.includes('ungültig')) {
    return 'Zugangscode ungültig oder abgelaufen. Bitte die Lehrkraft nach dem aktuellen Code fragen.'
  }
  if (text.includes('Zu viele Versuche')) {
    return 'Zu viele Versuche. Bitte 5 Minuten warten und dann erneut eingeben.'
  }
  return text || 'Beitritt fehlgeschlagen.'
}

const GAME_ROUND_NO = { kollokationen: 1, zeitreise: 2, wortzwilling: 3, zeitenwende: 4 }
const ROUND_GAME_NAME = Object.fromEntries(Object.entries(GAME_ROUND_NO).map(([k, v]) => [v, k]))
const GAME_LABELS = {
  kollokationen: 'Kollokationen',
  zeitreise: 'Zeitreise',
  wortzwilling: 'Wort-Zwilling',
  zeitenwende: 'Zeitenwende',
}

export default function ClassroomTab({ onLiveChange = () => {}, submitRef = null }) {
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

  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joinNotice, setJoinNotice] = useState('')
  const [participantSession, setParticipantSession] = useState(null)
  const [participantInfo, setParticipantInfo] = useState(null)
  const [joining, setJoining] = useState(false)

  const [submittedGames, setSubmittedGames] = useState([])

  const [socketConnected, setSocketConnected] = useState(false)
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
        if (res.status !== 401) {
          setTeacherError('Konto konnte nicht geladen werden.')
        }
        return
      }
      const payload = await res.json()
      setAccount(payload)
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
        socket.emit('classroom:join', {
          sessionId: joinedSession.id,
          participantId: participant.id,
          participantToken: participant.token,
        })
      })

      socket.on('disconnect', () => {
        setSocketConnected(false)
      })

      socket.on('classroom:state', () => {})

      socket.on('classroom:results', (payload) => {
        if (payload?.accepted) {
          const game = ROUND_GAME_NAME[payload.roundNo]
          if (game) setSubmittedGames(prev => [...prev.filter(g => g !== game), game])
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
          setJoinNotice('Zugangscode ungültig oder abgelaufen. Bitte die Lehrkraft nach dem aktuellen Code fragen.')
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
          JSON.stringify({ id: participant.id, token: participant.token, sessionId: joinedSession.id, session: joinedSession }),
        )
      } catch {}
      setJoinNotice('Beitritt erfolgreich.')
      await setupSocket(joinedSession, participant)
    } catch {
      setJoinNotice('Netzwerkfehler beim Beitritt.')
    } finally {
      setJoining(false)
    }
  }, [joinCodeInput, joining, setupSocket])

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
      const current = sessions.find((s) => s.id === activeSessionId)
      if (current?.state !== 'running' && current?.state !== 'lobby') {
        loadExports(activeSessionId)
      }
    }, 5000)
    timer.unref?.()
    return () => clearInterval(timer)
  }, [activeSessionId, isTeacher, loadDashboard, loadExports, sessions])

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

  // Schüler-Restore: läuft wenn kein Lehrer, scannt localStorage direkt
  useEffect(() => {
    if (loadingAccount || isTeacher || participantInfo) return
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith('sig_classroom_join_')) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw)
        if (parsed?.sessionId && parsed?.id && parsed?.token && parsed?.session) {
          setParticipantSession(parsed.session)
          setParticipantInfo({ id: parsed.id, token: parsed.token, sessionId: parsed.sessionId })
          setupSocket(parsed.session, { id: parsed.id, token: parsed.token })
          break
        }
      }
    } catch {}
  }, [loadingAccount, isTeacher, participantInfo, setupSocket])

  // Live-Indikator nach oben propagieren
  const isLive = socketConnected || (isTeacher && activeSession?.state === 'running')
  useEffect(() => {
    onLiveChange(isLive)
    return () => onLiveChange(false)
  }, [isLive, onLiveChange])

  // Timer-Tick für laufende Sessions
  useEffect(() => {
    if (!activeSession?.startedAt) return
    const t = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [activeSession?.startedAt])

  // submitRef für App.jsx-Spielresultate → Klassenraum-Socket
  useEffect(() => {
    if (!submitRef) return
    if (socketConnected && participantInfo) {
      submitRef.current = ({ game, score, maxScore, payload = {} }) => {
        const socket = socketRef.current
        if (!socket?.connected) return
        socket.emit('classroom:submit', {
          roundNo: GAME_ROUND_NO[game] ?? 1,
          score,
          maxScore,
          payload: { game, ...payload },
        })
      }
    } else {
      submitRef.current = null
    }
    return () => { if (submitRef) submitRef.current = null }
  }, [socketConnected, participantInfo, submitRef])

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
        <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">Gesamtausgabe</span>

        <div className="tab-placeholder-head">
          <h2 className="tab-placeholder-title">Klassenraum</h2>
          <span className="tab-placeholder-ipa">[ˈklasənˌʀaʊ̯m]</span>
        </div>
        <div className="tab-placeholder-grammar">
          <span className="tab-placeholder-pos">Bereich</span>
          <span className="tab-placeholder-rule-line" />
          <span className="tab-placeholder-category">Lehrkräfte</span>
        </div>

        <p className="tab-placeholder-definition">
          Gemeinsame Spielsitzungen für Gruppen und Klassen. Kollaboratives Lernen mit Echtzeit-Vergleich und didaktischer Auswertung.
        </p>

        <ul className="tab-placeholder-features classroom-features">
          <li>Lehrkraft erstellt Sitzungen, startet und beendet im eigenen Takt.</li>
          <li>Lernende treten anonym mit Zugangscode bei und spielen gleichzeitig.</li>
          <li>Live-Kennzahlen zeigen Beteiligung, Abgaben und Punktverteilung.</li>
          <li>Ergebnisse können als CSV oder PDF für die Nachbereitung exportiert werden.</li>
        </ul>

        {loadingAccount ? (
          <p className="tab-placeholder-definition">Konto wird geladen …</p>
        ) : teacherError ? (
          <p className="classroom-error">{teacherError}</p>
        ) : null}

        {isTeacher && (
          <section className="classroom-panel">
            <p className="classroom-panel-title">Lehrkraft-Dashboard</p>
            <div className="classroom-create-row">
              <input
                className="classroom-join-input"
                value={sessionNameInput}
                onChange={(e) => setSessionNameInput(e.target.value)}
                placeholder="Klasse oder Kurs (optional)"
                maxLength={60}
                aria-label="Name der Session"
              />
              <button
                className="test-cta"
                type="button"
                onClick={createSession}
                disabled={creating}
              >
                Erstellen
              </button>
            </div>

            {createNotice && <p className="classroom-note">{createNotice}</p>}
            {lastJoinCode && (
              <div className="classroom-code-display" aria-live="polite">
                <p className="classroom-active-label">Zugangscode für Lernende</p>
                <div className="classroom-code-row">
                  <span className="classroom-code-value">{lastJoinCode}</span>
                  <button
                    type="button"
                    className="classroom-code-copy"
                    onClick={() => {
                      navigator.clipboard.writeText(lastJoinCode)
                      setCodeCopied(true)
                      setTimeout(() => setCodeCopied(false), 2000)
                    }}
                  >
                    {codeCopied ? 'Kopiert' : 'Kopieren'}
                  </button>
                </div>
              </div>
            )}

            <div className="classroom-grid">
              <article className="classroom-card">
                <h4 className="classroom-card-title">Sitzungen</h4>
                {loadingSessions ? <p className="classroom-muted">Lädt …</p> : null}
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
                          <span>{s.settings?.name || `${s.datum}/${s.year}`}</span>
                          <span className={s.state === 'running' ? 'classroom-state-running' : ''}>
                            {mapSessionState(s.state)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="classroom-card">
                <h4 className="classroom-card-title">Aktive Session</h4>
                {!activeSession ? <p className="classroom-muted">Keine Session ausgewählt.</p> : null}
                {activeSession && (
                  <>
                    <dl className="classroom-kv">
                      <div><dt>Status</dt><dd className={activeSession.state === 'running' ? 'classroom-state-running' : ''}>{mapSessionState(activeSession.state)}</dd></div>
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
                {loadingDashboard ? <p className="classroom-muted">Lädt …</p> : null}
                {dashboardError ? <p className="classroom-error">{dashboardError}</p> : null}
                {dashboard?.metrics && (
                  <>
                    <dl className="classroom-kv classroom-kv--metrics">
                      <div><dt>Verbunden</dt><dd>{dashboard.metrics.connected_count}</dd></div>
                      <div><dt>Abgegeben</dt><dd>{dashboard.metrics.submitted_count}</dd></div>
                      <div><dt>Durchschnitt</dt><dd>{dashboard.metrics.avg_score}</dd></div>
                      <div><dt>Gesamt</dt><dd>{dashboard.metrics.total_count}</dd></div>
                    </dl>
                    {makeDistributionBuckets(dashboard.metrics.score_distribution).some((b) => b.count > 0) && (
                      <div className="classroom-distribution" aria-label="Punkteverteilung der Abgaben">
                        <p className="classroom-distribution-title">Punkteverteilung</p>
                        {makeDistributionBuckets(dashboard.metrics.score_distribution)
                          .filter((b) => b.count > 0)
                          .map((bucket, idx) => (
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
                    )}
                  </>
                )}
              </article>

              <article className="classroom-card">
                <h4 className="classroom-card-title">Sitzungsdauer</h4>
                {!activeSession?.startedAt ? (
                  <p className="classroom-muted">Noch nicht gestartet.</p>
                ) : (
                  <>
                    <p className="classroom-timer" aria-live="polite" aria-atomic="true">
                      {timerTick >= 0 && formatElapsed(activeSession.startedAt)}
                    </p>
                    {activeSession.state === 'running' && (
                      <p className="classroom-timer-label classroom-state-running">läuft</p>
                    )}
                  </>
                )}
              </article>
            </div>

            {activeSession?.state === 'finished' && (
              <div className="classroom-exports">
                <p className="classroom-exports-label">Ergebnisse exportieren</p>
                <div className="classroom-actions">
                  <button
                    className="test-cta"
                    type="button"
                    onClick={() => requestExport('csv')}
                    disabled={requestingExport === 'csv'}
                  >
                    CSV
                  </button>
                  <button
                    className="test-cta"
                    type="button"
                    onClick={() => requestExport('pdf')}
                    disabled={requestingExport === 'pdf'}
                  >
                    PDF
                  </button>
                </div>
                {exportsError ? <p className="classroom-error">{exportsError}</p> : null}
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
              </div>
            )}
          </section>
        )}

        {!isTeacher && (
          <section className="classroom-join-section">
            <p className="test-overline">Für Lernende</p>
            <h3 className="classroom-join-heading">Mit Zugangscode beitreten</h3>
            <form
              className="classroom-join-form"
              onSubmit={(event) => {
                event.preventDefault()
                joinSession()
              }}
            >
              <input
                className="classroom-join-input"
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(sanitizeJoinCodeInput(event.target.value))}
                placeholder="zugangscode"
                maxLength={20}
                autoComplete="off"
                aria-label="Zugangscode"
              />
              <button className="test-cta" type="submit" disabled={joining}>Beitreten</button>
            </form>
            {joinNotice ? <p className="classroom-note">{joinNotice}</p> : null}

            {participantSession && participantInfo && (
              <div className="classroom-active-session">
                <p className="classroom-active-label">
                  Aktive Teilnahme · {mapSessionState(participantSession.state)}
                  {socketConnected && <span className="classroom-state-running"> · Verbunden</span>}
                </p>
                {socketError ? <p className="classroom-error">{socketError}</p> : null}
                {hostCountdown > 0 ? (
                  <p className="classroom-error">Verbindung zur Lehrkraft unterbrochen. Sitzung endet in {hostCountdown}s.</p>
                ) : null}

                {submittedGames.length === 0 ? (
                  <p className="classroom-muted">Wechsel zum Tab „Spielmodi" und spiele eine Runde — das Ergebnis wird automatisch übertragen.</p>
                ) : (
                  <ul className="classroom-submitted-list">
                    {submittedGames.map((game) => (
                      <li key={game} className="classroom-submitted-item">
                        <span className="classroom-submitted-check">✓</span>
                        <span>{GAME_LABELS[game] ?? game}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Für Unterrichtssitzungen und Lerngruppen.</span>
        </div>
      </div>
    </div>
  )
}
