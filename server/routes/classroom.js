import express from 'express'
import {
  classroomCreateSessionSchema,
  classroomStartSessionSchema,
  classroomFinishSessionSchema,
  classroomJoinSchema,
  classroomCreateExportSchema,
  validate,
} from '../middleware/validate.js'
import { requireTeacher } from '../middleware/userAuth.js'
import {
  createClassroomSession,
  startClassroomSession,
  finishClassroomSession,
  joinClassroomSession,
  markParticipantHeartbeat,
  getClassroomDashboard,
  createClassroomExportJob,
  getClassroomExportJob,
} from '../classroom-store.js'
import logger from '../logger.js'
import {
  classroomJoinLimiter,
  classroomWriteLimiter,
  classroomExportLimiter,
} from '../middleware/rateLimiter.js'

const router = express.Router()

function mapError(errCode) {
  switch (errCode) {
    case 'NOT_FOUND':
      return { status: 404, message: 'Session nicht gefunden' }
    case 'FORBIDDEN':
      return { status: 403, message: 'Keine Berechtigung fuer diese Session' }
    case 'INVALID_STATE':
      return { status: 409, message: 'Session ist in diesem Zustand nicht gueltig' }
    case 'INVALID_CODE':
      return { status: 404, message: 'Join-Code ungueltig oder abgelaufen' }
    case 'LATE_JOIN_DISABLED':
      return { status: 409, message: 'Spaetbeitritt ist fuer diese Session deaktiviert' }
    case 'SESSION_NOT_JOINABLE':
      return { status: 409, message: 'Session ist nicht beitretbar' }
    case 'PARTICIPANT_NOT_FOUND':
      return { status: 404, message: 'Teilnehmer nicht gefunden' }
    default:
      return { status: 500, message: 'Interner Serverfehler' }
  }
}

router.post('/api/v1/classroom/sessions', classroomWriteLimiter, requireTeacher, validate(classroomCreateSessionSchema), (req, res) => {
  try {
    const { datum, year, settings } = req.body
    const { session, joinCode } = createClassroomSession({
      teacherUserId: req.user.id,
      datum,
      year,
      settings,
    })
    res.status(201).json({ session, joinCode })
  } catch (err) {
    logger.error({ err }, 'Klassenraum-Session konnte nicht erstellt werden')
    res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.post('/api/v1/classroom/sessions/:id/start', classroomWriteLimiter, requireTeacher, validate(classroomStartSessionSchema), (req, res) => {
  try {
    const result = startClassroomSession({
      sessionId: req.params.id,
      teacherUserId: req.user.id,
      allowLateJoin: req.body.allowLateJoin,
    })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.json({ session: result.session })
  } catch (err) {
    logger.error({ err, sessionId: req.params.id }, 'Session konnte nicht gestartet werden')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.post('/api/v1/classroom/sessions/:id/finish', classroomWriteLimiter, requireTeacher, validate(classroomFinishSessionSchema), (req, res) => {
  try {
    const result = finishClassroomSession({
      sessionId: req.params.id,
      teacherUserId: req.user.id,
    })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.json({ session: result.session })
  } catch (err) {
    logger.error({ err, sessionId: req.params.id }, 'Session konnte nicht beendet werden')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.post('/api/v1/classroom/join', classroomJoinLimiter, validate(classroomJoinSchema), (req, res) => {
  try {
    const result = joinClassroomSession({ code: req.body.code })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.status(201).json(result)
  } catch (err) {
    logger.error({ err }, 'Klassenraum-Join fehlgeschlagen')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.post('/api/v1/classroom/heartbeat', classroomJoinLimiter, (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '')
    const participantId = String(req.body?.participantId || '')
    const participantToken = String(req.body?.participantToken || '')
    if (!sessionId || !participantId || !participantToken) {
      return res.status(400).json({ error: 'sessionId, participantId und participantToken sind erforderlich' })
    }
    const result = markParticipantHeartbeat({ sessionId, participantId, participantToken })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'Klassenraum-Heartbeat fehlgeschlagen')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.get('/api/v1/classroom/sessions/:id/dashboard', requireTeacher, (req, res) => {
  try {
    const result = getClassroomDashboard({
      sessionId: req.params.id,
      teacherUserId: req.user.id,
    })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.json(result)
  } catch (err) {
    logger.error({ err, sessionId: req.params.id }, 'Dashboard konnte nicht geladen werden')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.post('/api/v1/classroom/sessions/:id/exports', classroomExportLimiter, requireTeacher, validate(classroomCreateExportSchema), (req, res) => {
  try {
    const result = createClassroomExportJob({
      sessionId: req.params.id,
      teacherUserId: req.user.id,
      type: req.body.type,
    })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.status(202).json(result)
  } catch (err) {
    logger.error({ err, sessionId: req.params.id }, 'Export-Job konnte nicht erstellt werden')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

router.get('/api/v1/classroom/sessions/:id/exports/:exportId', requireTeacher, (req, res) => {
  try {
    const result = getClassroomExportJob({
      sessionId: req.params.id,
      exportId: req.params.exportId,
      teacherUserId: req.user.id,
    })
    if (result.error) {
      const mapped = mapError(result.error)
      return res.status(mapped.status).json({ error: mapped.message })
    }
    return res.json(result)
  } catch (err) {
    logger.error({ err, sessionId: req.params.id, exportId: req.params.exportId }, 'Export-Status konnte nicht geladen werden')
    return res.status(500).json({ error: 'Interner Serverfehler' })
  }
})

export default router
