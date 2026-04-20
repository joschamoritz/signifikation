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

export default function ClassroomTab({ onLiveChange = () => {}, submitRef = null, onInSessionChange = () => {}, getRetroResultsRef = null }) {
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
  const pendingSubmitsRef = useRef([])
  const participantSessionRef = useRef(null)
  const isFreshJoinRef = useRef(false)
  const joinCodeRef = useRef('')

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
        // ③ Retro-Submit: bereits gespielte Ergebnisse in Pending-Queue einstellen
        if (isFreshJoinRef.current) {
          isFreshJoinRef.current = false
          const retroResults = getRetroResultsRef?.current?.()
          if (retroResults?.length) {
            for (const { game, score, maxScore } of retroResults) {
              pendingSubmitsRef.current.push({
                roundNo: GAME_ROUND_NO[game] ?? 1,
                score,
                maxScore,
                payload: { game },
              })
            }
            setSubmittedGames(prev => {
              const next = [...prev]
              for (const { game, score, maxScore } of retroResults) {
                const idx = next.findIndex(s => s.game === game)
                if (idx >= 0) next[idx] = { game, score, maxScore }
                else next.push({ game, score, maxScore })
              }
              return next
            })
          }
        }
      })

      socket.on('disconnect', () => {
        setSocketConnected(false)
      })

      socket.on('classroom:state', (payload) => {
        if (!payload) return
        setParticipantSession((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            state: payload.state ?? prev.state,
            startedAt: payload.startedAt ?? prev.startedAt,
            finishedAt: payload.finishedAt ?? prev.finishedAt,
          }
        })
        if (payload.state === 'finished' || payload.state === 'archived') {
          try { localStorage.removeItem(parseStorageKey(payload.sessionId)) } catch {}
        }
        if (payload.state === 'running' && pendingSubmitsRef.current.length > 0) {
          const pending = pendingSubmitsRef.current.splice(0)
          for (const sub of pending) {
            socket.emit('classroom:submit', sub)
          }
        }
      })

      socket.on('classroom:results', (payload) => {
        if (payload?.accepted) {
          const game = ROUND_GAME_NAME[payload.roundNo]
          // Nur als Safety-Net: optimistisches Update in submitRef.current war schneller.
          // Falls das Spiel noch nicht in der Liste ist (z.B. Flush aus Pending), eintragen.
          if (game) {
            setSubmittedGames(prev => {
              if (prev.some(s => s.game === game)) return prev
              return [...prev, { game, score: 0, maxScore: 0 }]
            })
          }
        }
      })

      socket.on('classroom:ready', (payload) => {
        if (!payload?.session) return
        setParticipantSession(prev => {
          if (!prev) return prev
          return {
            ...prev,
            state: payload.session.state ?? prev.state,
            startedAt: payload.session.startedAt ?? prev.startedAt,
            finishedAt: payload.session.finishedAt ?? prev.finishedAt,
          }
        })
        // ③ Pending-Flush: Session läuft bereits → Retro-Abgaben sofort senden
        if (payload.session.state === 'running' && pendingSubmitsRef.current.length > 0) {
          const pending = pendingSubmitsRef.current.splice(0)
          for (const sub of pending) {
            socket.emit('classroom:submit', sub)
          }
        }
      })

      socket.on('classroom:error', (payload) => {
        // NOT_JOINED ist ein transientes Echo kurz nach Reconnect —
        // classroom:join ist bereits unterwegs, kein echter Fehler.
        if (payload?.code === 'NOT_JOINED') return
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
      const code = joinCodeInput.trim().toLowerCase()
      joinCodeRef.current = code
      const ssKey = `sig_cr_${code}`

      // ④ Reconnect-Guard: gleichen Teilnehmer wiederverwenden statt neu anlegen
      let existingCreds = null
      try {
        const stored = sessionStorage.getItem(ssKey)
        if (stored) existingCreds = JSON.parse(stored)
      } catch {}

      if (existingCreds?.sessionId && existingCreds?.participantId && existingCreds?.token && existingCreds?.session) {
        const savedState = existingCreds.session?.state
        if (savedState === 'finished' || savedState === 'archived') {
          // Abgelaufene Session aus SessionStorage entfernen, dann normal beitreten
          try { sessionStorage.removeItem(ssKey) } catch {}
          existingCreds = null
        } else {
          // Teilnehmer-Credentials wiederverwenden – kein neuer HTTP-Join nötig
          setParticipantSession(existingCreds.session)
          setParticipantInfo({ id: existingCreds.participantId, token: existingCreds.token, sessionId: existingCreds.sessionId })
          setJoinNotice('Wieder verbunden.')
          isFreshJoinRef.current = true  // ③ Retro-Submit auch bei Reconnect
          await setupSocket(existingCreds.session, { id: existingCreds.participantId, token: existingCreds.token })
          return
        }
      }

      // Normaler Beitritt via HTTP
      const res = await fetch(`${API}/classroom/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
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
      // ④ Code → SessionStorage, damit spätere Reconnects denselben Teilnehmer wiederverwenden
      try {
        sessionStorage.setItem(ssKey, JSON.stringify({
          sessionId: joinedSession.id,
          participantId: participant.id,
          token: participant.token,
          session: joinedSession,
        }))
      } catch {}
      setJoinNotice('Beitritt erfolgreich.')
      isFreshJoinRef.current = true  // ③ Retro-Submit beim Socket-Connect
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
    participantSessionRef.current = participantSession
  }, [participantSession])

  // Lobby-Fallback-Poll: alle 12s classroom:join re-emittieren damit der
  // Server den aktuellen State zurücksendet – verhindert, dass Schüler
  // in "Warte auf Start" hängen wenn das classroom:state-Event verpasst wurde.
  useEffect(() => {
    if (!socketConnected || !participantInfo) return
    if (participantSession?.state !== 'lobby' && participantSession?.state !== 'created') return
    const timer = setInterval(() => {
      const sock = socketRef.current
      if (!sock?.connected) return
      sock.emit('classroom:join', {
        sessionId: participantInfo.sessionId,
        participantId: participantInfo.id,
        participantToken: participantInfo.token,
      })
    }, 12000)
    return () => clearInterval(timer)
  }, [socketConnected, participantInfo, participantSession?.state])

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
    const current = sessions.find((s) => s.id === activeSessionId)
    // Kein Polling für beendete/archivierte Sessions
    if (!current || current.state === 'finished' || current.state === 'archived') return
    const timer = setInterval(() => {
      loadDashboard(activeSessionId)
      const curr = sessions.find((s) => s.id === activeSessionId)
      if (curr?.state !== 'running' && curr?.state !== 'lobby') {
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
        if (!parsed?.sessionId || !parsed?.id || !parsed?.token || !parsed?.session) continue
        // Abgelaufene/beendete Sessions nicht wiederherstellen
        const savedState = parsed.session?.state
        if (savedState === 'finished' || savedState === 'archived') {
          try { localStorage.removeItem(key) } catch {}
          continue
        }
        setParticipantSession(parsed.session)
        setParticipantInfo({ id: parsed.id, token: parsed.token, sessionId: parsed.sessionId })
        setupSocket(parsed.session, { id: parsed.id, token: parsed.token })
        break
      }
    } catch {}
  }, [loadingAccount, isTeacher, participantInfo, setupSocket])

  // Live-Indikator: Schüler nur live wenn Socket verbunden UND Session läuft
  const isLive = (socketConnected && participantSession?.state === 'running') || (isTeacher && activeSession?.state === 'running')
  useEffect(() => {
    onLiveChange(isLive)
    return () => onLiveChange(false)
  }, [isLive, onLiveChange])

  // Schüler: App.jsx informieren wenn eine Sitzung beigetreten/verlassen wird
  useEffect(() => {
    onInSessionChange(!!participantInfo)
  }, [participantInfo, onInSessionChange])

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

  // submitRef für App.jsx-Spielresultate → Klassenraum-Socket.
  // Score/maxScore werden sofort optimistisch in submittedGames eingetragen.
  // Wenn Session noch nicht läuft, wird die Abgabe zwischengespeichert
  // und beim classroom:state(running)-Event automatisch nachgereicht.
  useEffect(() => {
    if (!submitRef) return
    if (socketConnected && participantInfo) {
      submitRef.current = ({ game, score, maxScore, payload = {} }) => {
        const sock = socketRef.current
        if (!sock?.connected) return
        const sub = {
          roundNo: GAME_ROUND_NO[game] ?? 1,
          score,
          maxScore,
          payload: { game, ...payload },
        }
        // Optimistisches UI-Update — zeigt Score sofort
        setSubmittedGames(prev => {
          const filtered = prev.filter(s => s.game !== game)
          return [...filtered, { game, score, maxScore }]
        })
        if (participantSessionRef.current?.state === 'running') {
          sock.emit('classroom:submit', sub)
        } else {
          pendingSubmitsRef.current.push(sub)
        }
      }
    } else {
      submitRef.current = null
    }
    return () => { if (submitRef) submitRef.current = null }
  }, [socketConnected, participantInfo, submitRef])

  // Raster-Statuszeile: { center, isRunning, right }
  const rasterStatus = useMemo(() => {
    if (loadingAccount) return { center: '', isRunning: false, right: '' }
    if (isTeacher) {
      if (!activeSession) return { center: 'Neue Sitzung anlegen', isRunning: false, right: 'unter ②' }
      const isIdle = activeSession.state === 'finished' || activeSession.state === 'archived'
      const stateName = mapSessionState(activeSession.state)
      const sessionName = activeSession.settings?.name
      if (isIdle) {
        return {
          center: sessionName ? `${sessionName} – ${stateName}` : stateName,
          isRunning: false,
          right: 'Neu anlegen → ②',
        }
      }
      const isRunning = activeSession.state === 'running'
      const isActive = isRunning || activeSession.state === 'lobby'
      let right = ''
      if (dashboard?.metrics && isActive) {
        right = `${dashboard.metrics.connected_count} verbunden`
        if (isRunning) {
          right += `\u202f·\u202f${dashboard.metrics.submitted_count}\u202f/\u202f${dashboard.metrics.total_count} abgegeben`
        }
      }
      return {
        center: sessionName ? `${sessionName} – ${stateName}` : stateName,
        isRunning,
        right,
      }
    }
    if (!participantSession || !participantInfo) return { center: 'Code unter ② eingeben', isRunning: false, right: '' }
    const stateLabel = (() => {
      if (!socketConnected) return mapSessionState(participantSession.state)
      if (participantSession.state === 'running') return 'Läuft'
      if (participantSession.state === 'lobby' || participantSession.state === 'created') return 'Warte auf Start'
      if (participantSession.state === 'finished' || participantSession.state === 'archived') return 'Beendet'
      return 'Verbunden'
    })()
    const sessionName = participantSession.settings?.name
    const right = submittedGames.length > 0
      ? `${submittedGames.length}\u202f${submittedGames.length === 1 ? 'Spiel' : 'Spiele'} abgegeben`
      : ''
    return {
      center: sessionName ? `${sessionName} – ${stateLabel}` : stateLabel,
      isRunning: participantSession.state === 'running',
      right,
    }
  }, [loadingAccount, isTeacher, activeSession, dashboard, participantSession, participantInfo, socketConnected, submittedGames])

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
          <span
            className={`cr-raster-center${rasterStatus.isRunning ? ' cr-raster-center--running' : ''}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {rasterStatus.center}
          </span>
          <span className="cr-raster-right">{rasterStatus.right}</span>
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
                  {!participantInfo ? (
                    <>
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
                    </>
                  ) : (
                    <div className="cr-joined-status">
                      <p className="cr-session-meta">
                        {participantSession?.settings?.name && (
                          <><span className="cr-session-name-it">{participantSession.settings.name}</span><span className="cr-meta-sep">·</span></>
                        )}
                        <span className={participantSession?.state === 'running' ? 'cr-state-running' : ''}>
                          {socketConnected
                            ? (participantSession?.state === 'running' ? 'Läuft' : 'Verbunden')
                            : mapSessionState(participantSession?.state || '')}
                        </span>
                      </p>
                      {(participantSession?.state === 'lobby' || participantSession?.state === 'created') && socketConnected && (
                        <p className="cr-hint">
                          Warte auf den Start durch die Lehrkraft.{' '}
                          <button
                            type="button"
                            className="cr-refresh-btn"
                            onClick={() => {
                              const sock = socketRef.current
                              if (!sock?.connected) return
                              sock.emit('classroom:join', {
                                sessionId: participantInfo.sessionId,
                                participantId: participantInfo.id,
                                participantToken: participantInfo.token,
                              })
                            }}
                          >Aktualisieren</button>
                        </p>
                      )}
                      {socketError && <p className="cr-error">{socketError}</p>}
                      {hostCountdown > 0 && (
                        <p className="cr-error">Verbindung unterbrochen. Sitzung endet in {hostCountdown}s.</p>
                      )}
                      <p className="cr-action-row" style={{ marginTop: '12px' }}>
                        <button
                          type="button"
                          className="test-cta"
                          onClick={() => {
                            if (participantSession) {
                              // localStorage entfernen (Auto-Restore verhindert)
                              // sessionStorage BEHALTEN → gleicher Code reconnected als selben Teilnehmer (④)
                              try { localStorage.removeItem(parseStorageKey(participantSession.id)) } catch {}
                            }
                            teardownSocket()
                            clearParticipantRuntime()
                            setParticipantInfo(null)
                            setParticipantSession(null)
                            setSubmittedGames([])
                            setSocketError('')
                            setJoinNotice('')
                            setJoinCodeInput('')
                          }}
                        >
                          Sitzung verlassen
                        </button>
                      </p>
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
                              <span className="cr-live-avg">
                                {gameData && count > 0
                                  ? `⌀\u202f${gameData.avgScore}`
                                  : '—'}
                              </span>
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
                ) : (participantSession?.state === 'lobby' || participantSession?.state === 'created') ? (
                  <p className="cr-hint">Die Sitzung hat noch nicht begonnen. Dein Ergebnis wird nach dem Start automatisch übertragen.</p>
                ) : (participantSession?.state === 'finished' || participantSession?.state === 'archived') ? (
                  <>
                    {submittedGames.length > 0 ? (
                      <ul className="cr-submitted-list">
                        {submittedGames.map(({ game, score, maxScore }) => (
                          <li key={game} className="cr-submitted-item">
                            <span className="cr-submitted-check">✓</span>
                            <span className="cr-submitted-name">{GAME_LABELS[game] ?? game}</span>
                            {maxScore > 0 && <span className="cr-submitted-score">{score}&thinsp;/&thinsp;{maxScore}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cr-hint">Sitzung beendet.</p>
                    )}
                  </>
                ) : submittedGames.length === 0 ? (
                  <p className="cr-hint">Wechsel zu „Spielmodi" und spiele — dein Ergebnis wird automatisch übertragen.</p>
                ) : (
                  <ul className="cr-submitted-list">
                    {submittedGames.map(({ game, score, maxScore }) => (
                      <li key={game} className="cr-submitted-item">
                        <span className="cr-submitted-check">✓</span>
                        <span className="cr-submitted-name">{GAME_LABELS[game] ?? game}</span>
                        {maxScore > 0 && <span className="cr-submitted-score">{score}&thinsp;/&thinsp;{maxScore}</span>}
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
