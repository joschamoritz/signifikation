import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../../config'
import {
  GAME_ROUND_NO,
  HEARTBEAT_INTERVAL_MS,
  HOST_TIMEOUT_MS,
  ROUND_GAME_NAME,
  getErrorMessage,
  humanizeJoinError,
  parseStorageKey,
  readJsonSafe,
} from './classroomUtils'

export function useStudentClassroom({
  sessions,
  loadingAccount,
  isTeacher,
  submitRef,
  getRetroResultsRef,
  onLiveChange,
  onInSessionChange,
  activeSession,
}) {
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
  const pendingSubmitsRef = useRef([])
  const participantSessionRef = useRef(null)
  const isFreshJoinRef = useRef(false)

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
    const socket = socketRef.current
    if (!socket) return
    try {
      socket.close()
    } catch {}
    socketRef.current = null
    setSocketConnected(false)
  }, [])

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
            setSubmittedGames((prev) => {
              const next = [...prev]
              for (const { game, score, maxScore } of retroResults) {
                const idx = next.findIndex((entry) => entry.game === game)
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
          for (const submission of pending) {
            socket.emit('classroom:submit', submission)
          }
        }
      })

      socket.on('classroom:results', (payload) => {
        if (payload?.accepted) {
          const game = ROUND_GAME_NAME[payload.roundNo]
          if (game) {
            setSubmittedGames((prev) => {
              if (prev.some((entry) => entry.game === game)) return prev
              return [...prev, { game, score: 0, maxScore: 0 }]
            })
          }
        }
      })

      socket.on('classroom:ready', (payload) => {
        if (!payload?.session) return
        setParticipantSession((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            state: payload.session.state ?? prev.state,
            startedAt: payload.session.startedAt ?? prev.startedAt,
            finishedAt: payload.session.finishedAt ?? prev.finishedAt,
          }
        })
        if (payload.session.state === 'running' && pendingSubmitsRef.current.length > 0) {
          const pending = pendingSubmitsRef.current.splice(0)
          for (const submission of pending) {
            socket.emit('classroom:submit', submission)
          }
        }
      })

      socket.on('classroom:error', (payload) => {
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
  }, [clearParticipantRuntime, getRetroResultsRef, postParticipantHeartbeat, teardownSocket])

  const joinSession = useCallback(async () => {
    if (joining) return
    setJoining(true)
    setJoinNotice('')
    setSocketError('')
    try {
      const code = joinCodeInput.trim().toLowerCase()
      const sessionStorageKey = `sig_cr_${code}`

      let existingCreds = null
      try {
        const stored = sessionStorage.getItem(sessionStorageKey)
        if (stored) existingCreds = JSON.parse(stored)
      } catch {}

      if (existingCreds?.sessionId && existingCreds?.participantId && existingCreds?.token && existingCreds?.session) {
        const savedState = existingCreds.session?.state
        if (savedState === 'finished' || savedState === 'archived') {
          try { sessionStorage.removeItem(sessionStorageKey) } catch {}
          existingCreds = null
        } else {
          setParticipantSession(existingCreds.session)
          setParticipantInfo({
            id: existingCreds.participantId,
            token: existingCreds.token,
            sessionId: existingCreds.sessionId,
          })
          setJoinNotice('Wieder verbunden.')
          isFreshJoinRef.current = true
          await setupSocket(existingCreds.session, { id: existingCreds.participantId, token: existingCreds.token })
          return
        }
      }

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
      try {
        sessionStorage.setItem(sessionStorageKey, JSON.stringify({
          sessionId: joinedSession.id,
          participantId: participant.id,
          token: participant.token,
          session: joinedSession,
        }))
      } catch {}
      setJoinNotice('Beitritt erfolgreich.')
      isFreshJoinRef.current = true
      await setupSocket(joinedSession, participant)
    } catch {
      setJoinNotice('Netzwerkfehler beim Beitritt.')
    } finally {
      setJoining(false)
    }
  }, [joinCodeInput, joining, setupSocket])

  const requestJoinRefresh = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected || !participantInfo) return
    socket.emit('classroom:join', {
      sessionId: participantInfo.sessionId,
      participantId: participantInfo.id,
      participantToken: participantInfo.token,
    })
  }, [participantInfo])

  const leaveSession = useCallback(() => {
    if (participantSession) {
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
  }, [clearParticipantRuntime, participantSession, teardownSocket])

  useEffect(() => {
    participantSessionRef.current = participantSession
  }, [participantSession])

  useEffect(() => {
    if (!socketConnected || !participantInfo) return
    if (participantSession?.state !== 'lobby' && participantSession?.state !== 'created') return
    const timer = setInterval(() => {
      const socket = socketRef.current
      if (!socket?.connected) return
      socket.emit('classroom:join', {
        sessionId: participantInfo.sessionId,
        participantId: participantInfo.id,
        participantToken: participantInfo.token,
      })
    }, 12000)
    return () => clearInterval(timer)
  }, [socketConnected, participantInfo, participantSession?.state])

  useEffect(() => {
    if (participantInfo || sessions.length === 0) return
    for (const session of sessions) {
      try {
        const raw = localStorage.getItem(parseStorageKey(session.id))
        if (!raw) continue
        const parsed = JSON.parse(raw)
        if (parsed?.sessionId === session.id && parsed?.id && parsed?.token) {
          setParticipantSession(session)
          setParticipantInfo(parsed)
          setupSocket(session, parsed)
          break
        }
      } catch {}
    }
  }, [participantInfo, sessions, setupSocket])

  useEffect(() => () => {
    clearParticipantRuntime()
    teardownSocket()
  }, [clearParticipantRuntime, teardownSocket])

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

  const isLive = (socketConnected && participantSession?.state === 'running') || (isTeacher && activeSession?.state === 'running')

  useEffect(() => {
    onLiveChange(isLive)
    return () => onLiveChange(false)
  }, [isLive, onLiveChange])

  useEffect(() => {
    onInSessionChange(!!participantInfo)
  }, [participantInfo, onInSessionChange])

  useEffect(() => {
    if (!submitRef) return
    if (socketConnected && participantInfo) {
      submitRef.current = ({ game, score, maxScore, payload = {} }) => {
        const socket = socketRef.current
        if (!socket?.connected) return
        const submission = {
          roundNo: GAME_ROUND_NO[game] ?? 1,
          score,
          maxScore,
          payload: { game, ...payload },
        }
        setSubmittedGames((prev) => {
          const filtered = prev.filter((entry) => entry.game !== game)
          return [...filtered, { game, score, maxScore }]
        })
        if (participantSessionRef.current?.state === 'running') {
          socket.emit('classroom:submit', submission)
        } else {
          pendingSubmitsRef.current.push(submission)
        }
      }
    } else {
      submitRef.current = null
    }
    return () => {
      if (submitRef) submitRef.current = null
    }
  }, [participantInfo, socketConnected, submitRef])

  return {
    joinCodeInput,
    setJoinCodeInput,
    joinNotice,
    participantSession,
    participantInfo,
    joining,
    submittedGames,
    socketConnected,
    socketError,
    hostCountdown,
    joinSession,
    requestJoinRefresh,
    leaveSession,
    isLive,
  }
}
