import { Server } from 'socket.io'
import {
  getSessionById,
  joinClassroomSession,
  markParticipantHeartbeat,
  markParticipantLeft,
  submitClassroomRound,
  getClassroomDashboard,
  finishClassroomSessionByHostTimeout,
} from '../classroom-store.js'
import logger from '../logger.js'
import { normalizeJoinCode } from '../classroom/join-codes.js'
import { verifyTeacherSocketToken } from '../classroom/teacher-socket-auth.js'
import { isAllowedOrigin } from '../config/origins.js'

const HEARTBEAT_TIMEOUT_MS = 45 * 1000
const HOST_RECONNECT_WINDOW_MS = 2 * 60 * 1000

const sessionRegistry = new Map()

// ── Socket-Join Rate-Limit ─────────────────────────────────────
// Schützt den Join-Pfad vor Code-Brute-Force via WebSocket.
// Reconnects (mit gültigem Token) sind ausgenommen.
const JOIN_RATE_LIMIT = 10        // max. Versuche pro Fenster
const JOIN_RATE_WINDOW_MS = 60_000 // 1 Minute
const joinAttempts = new Map()    // ip → { count, windowStart }

function checkJoinRateLimit(ip) {
  const now = Date.now()
  const entry = joinAttempts.get(ip)
  if (!entry || now - entry.windowStart > JOIN_RATE_WINDOW_MS) {
    joinAttempts.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= JOIN_RATE_LIMIT) return false
  entry.count++
  return true
}

function roomName(sessionId) {
  return `classroom:${sessionId}`
}

function mapSocketError(code) {
  switch (code) {
    case 'INVALID_CODE':
      return { code, message: 'Zugangscode ungueltig oder abgelaufen. Bitte Lehrkraft nach dem aktuellen Code fragen.' }
    case 'LATE_JOIN_DISABLED':
      return { code, message: 'Spaetbeitritt ist deaktiviert' }
    case 'SESSION_NOT_JOINABLE':
      return { code, message: 'Session ist nicht beitretbar' }
    case 'SESSION_FULL':
      return { code, message: 'Die Session ist voll (maximal 50 Teilnehmende)' }
    case 'PARTICIPANT_NOT_FOUND':
      return { code, message: 'Teilnehmer nicht gefunden' }
    case 'INVALID_STATE':
      return { code, message: 'Aktion in aktuellem Session-Zustand nicht erlaubt' }
    case 'NOT_FOUND':
      return { code, message: 'Session nicht gefunden' }
    default:
      return { code: 'INTERNAL', message: 'Interner Echtzeitfehler' }
  }
}

function parseScorePayload(payload = {}) {
  const roundNo = Number(payload.roundNo)
  const score = Number(payload.score)
  const maxScore = Number(payload.maxScore)
  if (!Number.isInteger(roundNo) || roundNo < 1 || roundNo > 10) return null
  if (!Number.isFinite(score) || score < 0 || score > 100) return null
  if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100) return null
  return { roundNo, score, maxScore, payload: payload.payload || {} }
}

function parseJoinPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return { error: 'INVALID_PAYLOAD' }
  const hasReconnect = payload.sessionId && payload.participantId && payload.participantToken
  if (hasReconnect) {
    const sessionId = String(payload.sessionId)
    const participantId = String(payload.participantId)
    const participantToken = String(payload.participantToken)
    if (!sessionId || !participantId || !participantToken) return { error: 'INVALID_PAYLOAD' }
    return { reconnect: { sessionId, participantId, participantToken } }
  }
  const code = String(payload.code || '').trim().toLowerCase()
  if (!code) return { error: 'INVALID_PAYLOAD' }
  if (!/^[a-z-]{4,20}$/.test(code)) return { error: 'INVALID_PAYLOAD' }
  return { code }
}

function buildDashboardBroadcast(sessionId, teacherUserId) {
  const dashboard = getClassroomDashboard({ sessionId, teacherUserId })
  if (dashboard.error) return null
  return {
    session: dashboard.session,
    metrics: dashboard.metrics,
  }
}

function emitState(io, session) {
  io.to(roomName(session.id)).emit('classroom:state', {
    sessionId: session.id,
    state: session.state,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  })
}

function emitMetrics(io, sessionId, teacherUserId) {
  const payload = buildDashboardBroadcast(sessionId, teacherUserId)
  if (!payload) return
  io.to(roomName(sessionId)).emit('classroom:metrics', payload.metrics)
}

function getSessionRegistryEntry(sessionId) {
  let entry = sessionRegistry.get(sessionId)
  if (!entry) {
    entry = {
      teacherSockets: new Set(),
      hostDisconnectSince: null,
      hostTimeoutTimer: null,
    }
    sessionRegistry.set(sessionId, entry)
  }
  return entry
}

function clearHostTimeout(entry) {
  if (entry.hostTimeoutTimer) {
    clearTimeout(entry.hostTimeoutTimer)
    entry.hostTimeoutTimer = null
  }
}

function scheduleHostTimeout(io, sessionId, teacherUserId) {
  const entry = getSessionRegistryEntry(sessionId)
  if (entry.hostTimeoutTimer || entry.teacherSockets.size > 0) return
  entry.hostDisconnectSince = Date.now()
  entry.hostTimeoutTimer = setTimeout(() => {
    entry.hostTimeoutTimer = null
    if (entry.teacherSockets.size > 0) return
    const session = getSessionById({ sessionId })
    if (!session || session.state === 'finished' || session.state === 'archived') return
    const finished = finishClassroomSessionByHostTimeout({ sessionId })
    if (!finished.error && finished.session) {
      emitState(io, finished.session)
    }
    io.to(roomName(sessionId)).emit('classroom:error', {
      code: 'HOST_TIMEOUT',
      message: 'Verbindung zur Lehrkraft unterbrochen. Session wird beendet.',
    })
  }, HOST_RECONNECT_WINDOW_MS)
  entry.hostTimeoutTimer.unref()
}

function registerTeacherSocket(sessionId, socketId) {
  const entry = getSessionRegistryEntry(sessionId)
  entry.teacherSockets.add(socketId)
  entry.hostDisconnectSince = null
  clearHostTimeout(entry)
}

function unregisterTeacherSocket(io, sessionId, teacherUserId, socketId) {
  const entry = sessionRegistry.get(sessionId)
  if (!entry) return
  entry.teacherSockets.delete(socketId)
  if (entry.teacherSockets.size === 0) {
    scheduleHostTimeout(io, sessionId, teacherUserId)
  }
}

export function initClassroomSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) callback(null, true)
        else callback(new Error(`Socket-CORS: Unerlaubte Origin ${origin}`))
      },
      credentials: true,
    },
  })

  io.on('connection', socket => {
    socket.data.classroom = null
    socket.data.classroomTeacher = null

    socket.on('classroom:teacher-join', payload => {
      try {
        const sessionId = String(payload?.sessionId || '')
        const token = String(payload?.token || '')
        if (!sessionId || !token) {
          socket.emit('classroom:error', { code: 'INVALID_PAYLOAD', message: 'Teacher-Join-Payload ist ungueltig' })
          return
        }
        const auth = verifyTeacherSocketToken(token)
        if (auth.error || auth.sessionId !== sessionId) {
          socket.emit('classroom:error', { code: 'FORBIDDEN', message: 'Keine Berechtigung fuer diese Session' })
          return
        }
        const teacherUserId = auth.teacherUserId
        const session = getSessionById({ sessionId })
        if (!session || session.teacherUserId !== teacherUserId) {
          socket.emit('classroom:error', { code: 'FORBIDDEN', message: 'Keine Berechtigung fuer diese Session' })
          return
        }
        socket.join(roomName(sessionId))
        socket.data.classroomTeacher = { sessionId, teacherUserId }
        registerTeacherSocket(sessionId, socket.id)
        emitMetrics(io, sessionId, teacherUserId)
      } catch (err) {
        logger.error({ err }, 'Socket classroom:teacher-join fehlgeschlagen')
        socket.emit('classroom:error', { code: 'INTERNAL', message: 'Interner Echtzeitfehler' })
      }
    })

    socket.on('classroom:join', payload => {
      try {
        const parsed = parseJoinPayload(payload)
        if (parsed.error) {
          socket.emit('classroom:error', { code: 'INVALID_PAYLOAD', message: 'Join-Payload ist ungueltig' })
          return
        }

        // Rate-Limit nur für neue Joins – Reconnects haben gültiges Token und sind ausgenommen
        if (!parsed.reconnect) {
          const ip = socket.handshake.address
          if (!checkJoinRateLimit(ip)) {
            socket.emit('classroom:error', { code: 'RATE_LIMITED', message: 'Zu viele Beitrittsversuche. Bitte kurz warten.' })
            return
          }
        }

        if (parsed.reconnect) {
          const { sessionId: existingSessionId, participantId: existingParticipantId, participantToken: existingParticipantToken } = parsed.reconnect
          const heartbeat = markParticipantHeartbeat({
            sessionId: existingSessionId,
            participantId: existingParticipantId,
            participantToken: existingParticipantToken,
          })
          if (heartbeat.error) {
            const mapped = mapSocketError(heartbeat.error)
            socket.emit('classroom:error', mapped)
            return
          }
          const session = getSessionById({ sessionId: existingSessionId })
          if (!session) {
            socket.emit('classroom:error', mapSocketError('NOT_FOUND'))
            return
          }
          socket.join(roomName(existingSessionId))
          socket.data.classroom = {
            sessionId: existingSessionId,
            participantId: existingParticipantId,
            participantToken: existingParticipantToken,
            teacherUserId: session.teacherUserId,
            joinedAt: Date.now(),
          }
          socket.emit('classroom:ready', {
            session,
            participant: {
              id: existingParticipantId,
              token: existingParticipantToken,
              reconnectTtlMs: HEARTBEAT_TIMEOUT_MS,
            },
          })
          emitState(io, session)
          emitMetrics(io, session.id, session.teacherUserId)
          return
        }

        const code = normalizeJoinCode(parsed.code)

        const joined = joinClassroomSession({ code })
        if (joined.error) {
          socket.emit('classroom:error', mapSocketError(joined.error))
          return
        }

        socket.join(roomName(joined.session.id))
        socket.data.classroom = {
          sessionId: joined.session.id,
          participantId: joined.participant.id,
          participantToken: joined.participant.token,
          teacherUserId: joined.session.teacherUserId,
          joinedAt: Date.now(),
        }

        socket.emit('classroom:ready', {
          session: joined.session,
          participant: {
            id: joined.participant.id,
            token: joined.participant.token,
            reconnectTtlMs: HEARTBEAT_TIMEOUT_MS,
          },
        })
        emitState(io, joined.session)
        emitMetrics(io, joined.session.id, joined.session.teacherUserId)
      } catch (err) {
        logger.error({ err }, 'Socket classroom:join fehlgeschlagen')
        socket.emit('classroom:error', { code: 'INTERNAL', message: 'Interner Echtzeitfehler' })
      }
    })

    socket.on('classroom:heartbeat', payload => {
      try {
        const data = socket.data.classroom
        if (!data) {
          socket.emit('classroom:error', { code: 'NOT_JOINED', message: 'Noch keiner Session beigetreten' })
          return
        }
        const sessionId = String(payload?.sessionId || data.sessionId)
        const participantId = String(payload?.participantId || data.participantId)
        const participantToken = String(payload?.participantToken || data.participantToken)
        const result = markParticipantHeartbeat({ sessionId, participantId, participantToken })
        if (result.error) {
          socket.emit('classroom:error', mapSocketError(result.error))
          return
        }
        emitMetrics(io, sessionId, data.teacherUserId)
      } catch (err) {
        logger.error({ err }, 'Socket classroom:heartbeat fehlgeschlagen')
        socket.emit('classroom:error', { code: 'INTERNAL', message: 'Interner Echtzeitfehler' })
      }
    })

    socket.on('classroom:submit', payload => {
      try {
        const data = socket.data.classroom
        if (!data) {
          socket.emit('classroom:error', { code: 'NOT_JOINED', message: 'Noch keiner Session beigetreten' })
          return
        }
        const parsed = parseScorePayload(payload)
        if (!parsed) {
          socket.emit('classroom:error', { code: 'INVALID_PAYLOAD', message: 'Ungueltige Submit-Payload' })
          return
        }
        const result = submitClassroomRound({
          sessionId: data.sessionId,
          participantId: data.participantId,
          participantToken: data.participantToken,
          roundNo: parsed.roundNo,
          score: parsed.score,
          maxScore: parsed.maxScore,
          payload: parsed.payload,
        })
        if (result.error) {
          socket.emit('classroom:error', mapSocketError(result.error))
          return
        }
        socket.emit('classroom:results', {
          roundNo: parsed.roundNo,
          accepted: true,
        })
        emitMetrics(io, data.sessionId, data.teacherUserId)
      } catch (err) {
        logger.error({ err }, 'Socket classroom:submit fehlgeschlagen')
        socket.emit('classroom:error', { code: 'INTERNAL', message: 'Interner Echtzeitfehler' })
      }
    })

    socket.on('disconnect', () => {
      const teacherData = socket.data.classroomTeacher
      if (teacherData) {
        unregisterTeacherSocket(io, teacherData.sessionId, teacherData.teacherUserId, socket.id)
      }

      const data = socket.data.classroom
      if (!data) return
      const result = markParticipantLeft({
        sessionId: data.sessionId,
        participantId: data.participantId,
        participantToken: data.participantToken,
      })
      if (result.error) {
        logger.warn({ sessionId: data.sessionId, participantId: data.participantId }, 'Teilnehmer konnte beim Disconnect nicht als left markiert werden')
      }
      emitMetrics(io, data.sessionId, data.teacherUserId)
    })
  })

  logger.info('socket.io Klassenraum initialisiert')
  return io
}
