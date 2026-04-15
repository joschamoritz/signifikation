import { Server } from 'socket.io'
import {
  getSessionById,
  joinClassroomSession,
  markParticipantHeartbeat,
  markParticipantLeft,
  submitClassroomRound,
  getClassroomDashboard,
} from '../classroom-store.js'
import logger from '../logger.js'

const HEARTBEAT_TIMEOUT_MS = 45 * 1000

function roomName(sessionId) {
  return `classroom:${sessionId}`
}

function mapSocketError(code) {
  switch (code) {
    case 'INVALID_CODE':
      return { code, message: 'Join-Code ungueltig oder abgelaufen' }
    case 'LATE_JOIN_DISABLED':
      return { code, message: 'Spaetbeitritt ist deaktiviert' }
    case 'SESSION_NOT_JOINABLE':
      return { code, message: 'Session ist nicht beitretbar' }
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
  const code = String(payload.code || '').trim().toUpperCase()
  if (!code) return { error: 'INVALID_PAYLOAD' }
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return { error: 'INVALID_PAYLOAD' }
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

export function initClassroomSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
  })

  io.on('connection', socket => {
    socket.data.classroom = null

    socket.on('classroom:join', payload => {
      try {
        const parsed = parseJoinPayload(payload)
        if (parsed.error) {
          socket.emit('classroom:error', { code: 'INVALID_PAYLOAD', message: 'Join-Payload ist ungueltig' })
          return
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

        const code = parsed.code

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
