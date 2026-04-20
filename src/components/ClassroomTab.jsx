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
      return 'Wartend'
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

function formatStagnation(lastAt) {
  if (!lastAt) return null
  const mins = Math.floor((Date.now() - lastAt) / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins === 1) return 'vor 1 Minute'
  if (mins < 60) return `vor ${mins} Minuten`
  return 'vor über einer Stunde'
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

  const [activeCard, setActiveCard] = useState(0)

  const [socketConnected, setSocketConnected] = useState(false)
  const [socketError, setSocketError] = useState('')
  const [hostCountdown, setHostCountdown] = useState(0)

  const socketRef = useRef(null)
  const entriesRef = useRef(null)
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

  // Timer-Tick für laufende Sessions (stoppt wenn beendet)
  useEffect(() => {
    if (!activeSession?.startedAt) return
    if (activeSession.state === 'finished' || activeSession.state === 'archived') return
    const t = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [activeSession?.startedAt, activeSession?.state])

  // ── Mobile Snap-Navigation ──────────────────────────────────
  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return
    const container = entriesRef.current
    if (!container) return
    const items = container.querySelectorAll('.test-entry')
    if (!items.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setActiveCard(Array.from(items).indexOf(entry.target))
          }
        })
      },
      { root: container, threshold: 0.5 },
    )
    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [loadingAccount, isTeacher])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.forEach((item, i) => {
      if (i === activeCard) item.removeAttribute('inert')
      else item.setAttribute('inert', '')
    })
  }, [activeCard, isTeacher])

  const handleSnapKeyDown = useCallback((e) => {
    if (!window.matchMedia('(max-width: 699px)').matches) return
    const maxCard = isTeacher ? 3 : 2
    if (e.key === 'ArrowDown') scrollToCard(Math.min(activeCard + 1, maxCard))
    if (e.key === 'ArrowUp') scrollToCard(Math.max(activeCard - 1, 0))
  }, [activeCard, isTeacher, scrollToCard])

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

      {/* Raster-Leiste — nur Desktop */}
      <nav className="cr-raster" aria-label="Klassenraum-Übersicht">
        <div className="cr-raster-content">
          <span className="cr-raster-label" aria-hidden="true">Klassenraum</span>
          <div className="cr-raster-words">
            {['Sitzung', 'Beitritt', 'Echtzeit', 'Protokoll'].map((w) => (
              <span key={w} className="cr-raster-word">{w}</span>
            ))}
          </div>
          <span className="cr-raster-folio" aria-hidden="true">①②③④</span>
        </div>
      </nav>

      <div className="tab-placeholder-inner classroom-inner">
        {loadingAccount && <p className="cr-loading">Konto wird geladen …</p>}
        {!loadingAccount && teacherError && <p className="cr-error">{teacherError}</p>}

        <ul className="classroom-entries" ref={entriesRef} onKeyDown={handleSnapKeyDown}>

          {/* ① Klassenraum – Erklärung */}
          <li className="test-entry">
            <div className="test-entry-number" aria-hidden="true">
              <span className="test-entry-num-glyph">①</span>
              <span className="test-entry-marginalia">ERKL.</span>
            </div>
            <div className="test-entry-body">
              <div className="test-entry-head">
                <span className="test-headword">Klassenraum</span>
                <span className="test-ipa">[ˈklasənˌʀaʊ̯m]</span>
              </div>
              <div className="test-entry-grammar">
                <span className="test-pos">Bereich</span>
                <span className="test-pos-rule" />
                <span className="test-entry-category">Lehrkräfte</span>
              </div>
              <p className="cr-definition">
                Kollaborative Spielsitzungen für Gruppen und Schulklassen. Lehrkräfte öffnen eine Sitzung und steuern den Ablauf im eigenen Takt — Lernende treten anonym mit einem Zugangscode bei und spielen gleichzeitig auf ihrem Gerät.
              </p>
              <ul className="cr-feature-list">
                <li>Echtzeit-Überblick über Beteiligung und Abgaben während der Sitzung.</li>
                <li>Spielergebnisse aller vier Modi werden automatisch übertragen.</li>
                <li>Nach der Sitzung: Auswertung nach Spielmodus, Export als CSV oder PDF.</li>
              </ul>
              <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">Gesamtausgabe</span>
            </div>
          </li>

          {/* ② Sitzung (Lehrer) / Beitritt (Schüler) */}
          <li className="test-entry">
            <div className="test-entry-number" aria-hidden="true">
              <span className="test-entry-num-glyph">②</span>
              <span className="test-entry-marginalia">{isTeacher ? 'SITZG.' : 'BEITR.'}</span>
            </div>
            <div className="test-entry-body">
              <div className="test-entry-head">
                <span className="test-headword">{isTeacher ? 'Sitzung' : 'Beitritt'}</span>
                <span className="test-ipa">{isTeacher ? '[ˈzɪt͡sʊŋ]' : '[ˈbaɪ̯tʁɪt]'}</span>
              </div>
              <div className="test-entry-grammar">
                <span className="test-pos">{isTeacher ? 'Verwaltung' : 'Teilnahme'}</span>
                <span className="test-pos-rule" />
                <span className="test-entry-category">Vorbereitung</span>
              </div>

              {isTeacher ? (
                <div className="cr-section">
                  <div className="cr-create-row">
                    <input
                      className="cr-input"
                      value={sessionNameInput}
                      onChange={(e) => setSessionNameInput(e.target.value)}
                      placeholder="Klasse oder Kurs (optional)"
                      maxLength={60}
                      aria-label="Name der Session"
                    />
                    <button className="test-cta" type="button" onClick={createSession} disabled={creating}>
                      Erstellen →
                    </button>
                  </div>
                  {createNotice && <p className="cr-note">{createNotice}</p>}

                  {lastJoinCode && (
                    <div className="cr-code-block" aria-live="polite">
                      <span className="cr-section-label">Zugangscode</span>
                      <div className="cr-code-row">
                        <span className="cr-code-value">{lastJoinCode}</span>
                        <button
                          type="button"
                          className="cr-code-copy"
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

                  {activeSession && (
                    <div className="cr-active-controls">
                      <p className="cr-session-meta">
                        <span className={activeSession.state === 'running' ? 'cr-state-running' : ''}>
                          {mapSessionState(activeSession.state)}
                        </span>
                        {activeSession.startedAt && (
                          <><span className="cr-meta-sep">·</span><span>gestartet {formatDateTime(activeSession.startedAt)}</span></>
                        )}
                        {activeSession.finishedAt && (
                          <><span className="cr-meta-sep">·</span><span>beendet {formatDateTime(activeSession.finishedAt)}</span></>
                        )}
                      </p>
                      <p className="cr-action-row">
                        <button
                          className="test-cta"
                          type="button"
                          onClick={() => updateSessionState('start')}
                          disabled={activeSession.state === 'running' || activeSession.state === 'finished' || activeSession.state === 'archived'}
                        >
                          Starten
                        </button>
                        <span className="cr-action-sep">·</span>
                        <button
                          className="test-cta"
                          type="button"
                          onClick={() => updateSessionState('finish')}
                          disabled={activeSession.state === 'finished' || activeSession.state === 'archived'}
                        >
                          Beenden
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="cr-section">
                  <form className="cr-join-form" onSubmit={(e) => { e.preventDefault(); joinSession() }}>
                    <input
                      className="cr-input"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(sanitizeJoinCodeInput(e.target.value))}
                      placeholder="zugangscode"
                      maxLength={20}
                      autoComplete="off"
                      aria-label="Zugangscode"
                    />
                    <button className="test-cta" type="submit" disabled={joining}>Beitreten →</button>
                  </form>
                  {joinNotice && <p className="cr-note">{joinNotice}</p>}

                  {participantSession && participantInfo && (
                    <div className="cr-joined-status">
                      <p className="cr-session-meta">
                        {participantSession.settings?.name && (
                          <><span className="cr-session-name-it">{participantSession.settings.name}</span><span className="cr-meta-sep">·</span></>
                        )}
                        <span className={socketConnected ? 'cr-state-running' : ''}>
                          {socketConnected ? 'Verbunden' : mapSessionState(participantSession.state)}
                        </span>
                      </p>
                      {(participantSession.state === 'lobby' || participantSession.state === 'created') && (
                        <p className="cr-hint">Warte auf den Start durch die Lehrkraft.</p>
                      )}
                      {socketError && <p className="cr-error">{socketError}</p>}
                      {hostCountdown > 0 && (
                        <p className="cr-error">Verbindung unterbrochen. Sitzung endet in {hostCountdown}s.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>

          {/* ③ Live */}
          {isTeacher ? (
            <li className={`test-entry${!activeSession || activeSession.state === 'created' ? ' test-entry--disabled' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">③</span>
                <span className="test-entry-marginalia">LIVE</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span className="test-headword">Live</span>
                  <span className="test-ipa">[laɪ̯f]</span>
                </div>
                <div className="test-entry-grammar">
                  <span className="test-pos">Echtzeit</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">Durchführung</span>
                </div>
                {!activeSession || activeSession.state === 'created' ? (
                  <p className="cr-hint">Starte eine Sitzung unter ②.</p>
                ) : (
                  <div className="cr-section">
                    {activeSession.startedAt && (
                      <p className="cr-timer" aria-live="polite" aria-atomic="true">
                        {timerTick >= 0 && formatElapsed(activeSession.startedAt)}
                        {activeSession.state === 'running' && <span className="cr-timer-running"> läuft</span>}
                      </p>
                    )}
                    {dashboard?.metrics && (
                      <p className="cr-metric-line">
                        <span className="cr-metric-value">{dashboard.metrics.submitted_count}</span>
                        <span className="cr-metric-of"> von </span>
                        <span className="cr-metric-value">{dashboard.metrics.total_count}</span>
                        <span className="cr-metric-label"> abgegeben</span>
                        <span className="cr-metric-dot"> · </span>
                        <span className="cr-metric-value">{dashboard.metrics.connected_count}</span>
                        <span className="cr-metric-label"> verbunden</span>
                      </p>
                    )}
                    {dashboard?.metrics?.last_submission_at && activeSession.state === 'running' && (
                      <p className="cr-stagnation">
                        Letzte Abgabe {formatStagnation(dashboard.metrics.last_submission_at)}
                      </p>
                    )}
                    {activeSession.startedAt && dashboard && (
                      <ul className="cr-live-list" aria-label="Abgaben je Spielmodus">
                        {[1, 2, 3, 4].map((roundNo) => {
                          const gameKey = ROUND_GAME_NAME[roundNo]
                          const gameData = dashboard.perGame?.find((g) => g.roundNo === roundNo)
                          const count = gameData?.participantCount ?? 0
                          const total = dashboard.metrics?.total_count ?? 0
                          return (
                            <li key={roundNo} className="cr-live-row">
                              <span className="cr-live-game">{GAME_LABELS[gameKey] ?? `Modus ${roundNo}`}</span>
                              <span className="cr-live-bar-wrap" aria-hidden="true">
                                <span
                                  className="cr-live-bar"
                                  style={{ width: total > 0 ? `${Math.round((count / total) * 100)}%` : '0%' }}
                                />
                              </span>
                              <span className="cr-live-num">{count}</span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </li>
          ) : (
            <li className={`test-entry${!participantInfo ? ' test-entry--disabled' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">③</span>
                <span className="test-entry-marginalia">ABGB.</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span className="test-headword">Abgaben</span>
                  <span className="test-ipa">[ˈapˌɡaːbən]</span>
                </div>
                <div className="test-entry-grammar">
                  <span className="test-pos">Ergebnisse</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">Durchführung</span>
                </div>
                {!participantInfo ? (
                  <p className="cr-hint">Tritt einer Sitzung unter ② bei, um zu spielen.</p>
                ) : submittedGames.length === 0 ? (
                  <p className="cr-hint">Wechsel zu „Spielmodi" und spiele — dein Ergebnis wird automatisch übertragen.</p>
                ) : (
                  <ul className="cr-submitted-list">
                    {submittedGames.map((game) => (
                      <li key={game} className="cr-submitted-item">
                        <span className="cr-submitted-check">✓</span>
                        <span className="cr-submitted-name">{GAME_LABELS[game] ?? game}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )}

          {/* ④ Protokoll – Lehrer only */}
          {isTeacher && (
            <li className={`test-entry${activeSession?.state !== 'finished' ? ' test-entry--disabled' : ''}`}>
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">④</span>
                <span className="test-entry-marginalia">PROT.</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span className="test-headword">Protokoll</span>
                  <span className="test-ipa">[pʁotoˈkɔl]</span>
                </div>
                <div className="test-entry-grammar">
                  <span className="test-pos">Auswertung</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">Nachbereitung</span>
                </div>
                {activeSession?.state !== 'finished' ? (
                  <p className="cr-hint">Verfügbar nach Abschluss der Sitzung unter ②.</p>
                ) : (
                  <div className="cr-section">
                    {dashboard?.perGame?.length > 0 && (
                      <div className="cr-per-game">
                        <span className="cr-section-label">Spielmodus-Auswertung</span>
                        <ul className="cr-per-game-list">
                          {dashboard.perGame.map((g) => (
                            <li key={g.roundNo} className="cr-per-game-row">
                              <span className="cr-per-game-name">{g.label}</span>
                              <span className="cr-per-game-bar-wrap">
                                <span
                                  className="cr-per-game-bar"
                                  style={{ width: `${Math.round((g.avgScore / Math.max(g.avgMaxScore, 1)) * 100)}%` }}
                                />
                              </span>
                              <span className="cr-per-game-score">{g.avgScore}&thinsp;/&thinsp;{g.avgMaxScore}</span>
                              <span className="cr-per-game-count">{g.participantCount} Abg.</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="cr-export-block">
                      <span className="cr-section-label">Exportieren</span>
                      <p className="cr-action-row">
                        <button className="test-cta" type="button" onClick={() => requestExport('csv')} disabled={requestingExport === 'csv'}>CSV</button>
                        <span className="cr-action-sep">·</span>
                        <button className="test-cta" type="button" onClick={() => requestExport('pdf')} disabled={requestingExport === 'pdf'}>PDF</button>
                      </p>
                      {exportsError && <p className="cr-error">{exportsError}</p>}
                      {exportsList.length > 0 && (
                        <ul className="cr-export-list">
                          {exportsList.map((e) => (
                            <li key={e.id} className="cr-export-item">
                              <span className="cr-export-type">{e.type.toUpperCase()}</span>
                              <span className="cr-export-status">{e.status}</span>
                              <span className="cr-export-date">{formatDateTime(e.createdAt)}</span>
                              {e.status === 'done' && (
                                <a
                                  className="cr-export-link"
                                  href={`${API}/classroom/sessions/${activeSessionId}/exports/${e.id}/download`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Download
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </li>
          )}

        </ul>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Für Unterrichtssitzungen und Lerngruppen.</span>
        </div>
      </div>

      {/* Snap-Navigation — nur mobil (position: fixed via test.css) */}
      <nav className="snap-nav" aria-label="Klassenraum-Navigation">
        <div className="snap-nav-games">
          {(isTeacher
            ? [['①', 'Klassenraum'], ['②', 'Sitzung'], ['③', 'Live'], ['④', 'Protokoll']]
            : [['①', 'Klassenraum'], ['②', 'Beitritt'], ['③', 'Abgaben']]
          ).map(([glyph, label], i) => (
            <button
              key={i}
              className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
              aria-label={label}
              aria-current={activeCard === i ? 'true' : undefined}
              onClick={() => scrollToCard(i)}
            >{glyph}</button>
          ))}
        </div>
      </nav>
    </div>
  )
}
