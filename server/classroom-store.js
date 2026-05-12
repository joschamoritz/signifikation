import { createHmac, randomUUID } from 'crypto'
import db from './db.js'
import logger from './logger.js'
import { generateJoinCode, normalizeJoinCode } from './classroom/join-codes.js'

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'
const IS_PROD = process.env.NODE_ENV === 'production'
const configuredJoinSecret = (process.env.CLASSROOM_JOIN_SECRET || '').trim()

if (IS_PROD && !configuredJoinSecret) {
  throw new Error('Classroom-Join-Secret ist nicht gesetzt (CLASSROOM_JOIN_SECRET)')
}

if (!IS_PROD && !configuredJoinSecret) {
  logger.warn('Classroom-Join-Secret nicht gesetzt – Dev-Fallback aktiv (nur lokal!)')
}

const JOIN_SECRET = configuredJoinSecret || 'dev-classroom-secret'
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const CONNECTED_WINDOW_MS = 45 * 1000
const SESSION_MAX_PARTICIPANTS = 50

function parseJsonSafe(value, fallback, loggerInstance, context) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (err) {
    loggerInstance?.warn?.({ err, context }, 'Ungueltiges JSON in Classroom-Session – Fallback verwendet')
    return fallback
  }
}

const stmts = {
  insertSession: db.prepare(`
    INSERT INTO classroom_sessions (
      id, teacher_user_id, join_code_hash, state, datum, year, settings_json, created_at, expires_at
    ) VALUES (
      @id, @teacher_user_id, @join_code_hash, @state, @datum, @year, @settings_json, @created_at, @expires_at
    )
  `),
  getSessionById: db.prepare('SELECT * FROM classroom_sessions WHERE id = ?'),
  listTeacherSessions: db.prepare(`
    SELECT *
    FROM classroom_sessions
    WHERE teacher_user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  findActiveSessionByJoinHash: db.prepare(`
    SELECT *
    FROM classroom_sessions
    WHERE join_code_hash = ?
      AND state IN ('created','lobby','running')
      AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `),
  countActiveByJoinHash: db.prepare(`
    SELECT COUNT(1) AS c
    FROM classroom_sessions
    WHERE join_code_hash = ?
      AND state IN ('created','lobby','running')
      AND expires_at > ?
  `),
  updateSessionState: db.prepare(`
    UPDATE classroom_sessions
    SET state = @state,
        settings_json = @settings_json,
        started_at = @started_at,
        finished_at = @finished_at
    WHERE id = @id
  `),
  insertParticipant: db.prepare(`
    INSERT INTO classroom_participants (
      id, session_id, participant_token_hash, joined_at, last_seen_at
    ) VALUES (
      @id, @session_id, @participant_token_hash, @joined_at, @last_seen_at
    )
  `),
  updateParticipantSeen: db.prepare(`
    UPDATE classroom_participants
    SET last_seen_at = @last_seen_at
      , left_at = NULL
    WHERE id = @id
      AND session_id = @session_id
      AND participant_token_hash = @participant_token_hash
  `),
  markParticipantLeft: db.prepare(`
    UPDATE classroom_participants
    SET left_at = @left_at
    WHERE id = @id
      AND session_id = @session_id
      AND participant_token_hash = @participant_token_hash
  `),
  getParticipant: db.prepare(`
    SELECT *
    FROM classroom_participants
    WHERE id = ?
      AND session_id = ?
      AND participant_token_hash = ?
    LIMIT 1
  `),
  upsertSubmission: db.prepare(`
    INSERT INTO classroom_submissions (
      id, session_id, participant_id, round_no, payload_json, score, max_score, submitted_at
    ) VALUES (
      @id, @session_id, @participant_id, @round_no, @payload_json, @score, @max_score, @submitted_at
    )
    ON CONFLICT(session_id, participant_id, round_no) DO NOTHING
  `),
  countActiveParticipants: db.prepare(`
    SELECT COUNT(1) AS c
    FROM classroom_participants
    WHERE session_id = ?
      AND left_at IS NULL
  `),
  countParticipants: db.prepare(`
    SELECT COUNT(1) AS c
    FROM classroom_participants
    WHERE session_id = ?
  `),
  countConnectedParticipants: db.prepare(`
    SELECT COUNT(1) AS c
    FROM classroom_participants
    WHERE session_id = ?
      AND (left_at IS NULL)
      AND last_seen_at >= ?
  `),
  countSubmittedParticipants: db.prepare(`
    SELECT COUNT(DISTINCT participant_id) AS c
    FROM classroom_submissions
    WHERE session_id = ?
  `),
  avgScore: db.prepare(`
    SELECT AVG(score * 1.0) AS avg_score
    FROM classroom_submissions
    WHERE session_id = ?
  `),
  listSubmissionScores: db.prepare(`
    SELECT score, max_score
    FROM classroom_submissions
    WHERE session_id = ?
  `),
  lastSubmissionAt: db.prepare(`
    SELECT MAX(submitted_at) AS last_at
    FROM classroom_submissions
    WHERE session_id = ?
  `),
  perGameStats: db.prepare(`
    SELECT round_no,
           COUNT(DISTINCT participant_id) AS participant_count,
           AVG(score * 1.0)              AS avg_score,
           AVG(max_score * 1.0)          AS avg_max_score
    FROM classroom_submissions
    WHERE session_id = ?
    GROUP BY round_no
    ORDER BY round_no
  `),
  insertExport: db.prepare(`
    INSERT INTO classroom_exports (
      id, session_id, type, status, created_at
    ) VALUES (
      @id, @session_id, @type, @status, @created_at
    )
  `),
  getExportById: db.prepare('SELECT * FROM classroom_exports WHERE id = ? AND session_id = ?'),
  listExportsBySession: db.prepare(`
    SELECT *
    FROM classroom_exports
    WHERE session_id = ?
    ORDER BY created_at DESC
  `),
  claimExportJob: db.prepare(`
    UPDATE classroom_exports
    SET status = 'running'
    WHERE id = @id
      AND session_id = @session_id
      AND status = 'queued'
  `),
  updateExportStatus: db.prepare(`
    UPDATE classroom_exports
    SET status = @status,
        file_ref = @file_ref,
        error = @error,
        finished_at = @finished_at
    WHERE id = @id
      AND session_id = @session_id
  `),
  listQueuedExportsByType: db.prepare(`
    SELECT *
    FROM classroom_exports
    WHERE status = 'queued'
      AND type = ?
    ORDER BY created_at ASC
    LIMIT ?
  `),
  listExportRowsForSession: db.prepare(`
    SELECT
      p.id AS participant_id,
      p.joined_at,
      p.last_seen_at,
      p.left_at,
      s.round_no,
      s.score,
      s.max_score,
      s.submitted_at
    FROM classroom_participants p
    LEFT JOIN classroom_submissions s
      ON s.session_id = p.session_id
     AND s.participant_id = p.id
    WHERE p.session_id = ?
    ORDER BY p.joined_at ASC, s.round_no ASC
  `),
  listExpiredSessionIds: db.prepare(`
    SELECT id
    FROM classroom_sessions
    WHERE expires_at < ?
      AND state = 'archived'
    ORDER BY expires_at ASC
    LIMIT ?
  `),
  archiveExpiredSessions: db.prepare(`
    UPDATE classroom_sessions
    SET state = 'archived'
    WHERE expires_at < ?
      AND state != 'archived'
  `),
  listExportFileRefsForSession: db.prepare(`
    SELECT file_ref
    FROM classroom_exports
    WHERE session_id = ?
      AND file_ref IS NOT NULL
  `),
  deleteSessionById: db.prepare('DELETE FROM classroom_sessions WHERE id = ?'),
}

function nowMs() {
  return Date.now()
}

function todayDatum() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
  const [year, month, day] = iso.split('-')
  return { datum: `${month}-${day}`, year: Number(year) }
}

function hashValue(input) {
  return createHmac('sha256', JOIN_SECRET).update(input).digest('hex')
}

function normalizeSessionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    teacherUserId: row.teacher_user_id,
    state: row.state,
    datum: row.datum,
    year: row.year,
    settings: parseJsonSafe(row.settings_json, {}, logger, { sessionId: row.id, field: 'settings_json' }),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    expiresAt: row.expires_at,
  }
}

function normalizeExportRow(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    status: row.status,
    fileRef: row.file_ref,
    error: row.error,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

function resolveJoinCode() {
  const now = nowMs()
  for (let i = 0; i < 40; i += 1) {
    const candidate = generateJoinCode()
    const candidateHash = hashValue(normalizeJoinCode(candidate))
    const row = stmts.countActiveByJoinHash.get(candidateHash, now)
    if (!row || row.c === 0) {
      return { joinCode: candidate, joinCodeHash: candidateHash }
    }
  }
  throw new Error('Join-Code konnte nicht eindeutig erzeugt werden')
}

function mergeSettings(existingSettings, updates) {
  return { ...(existingSettings || {}), ...(updates || {}) }
}

function buildDistribution(rows) {
  const dist = Array(11).fill(0)
  for (const row of rows) {
    const maxScore = Number(row.max_score || 0)
    const score = Number(row.score || 0)
    const bucket = maxScore > 0 ? Math.round((score / maxScore) * 10) : 0
    const clamped = Math.max(0, Math.min(10, bucket))
    dist[clamped] += 1
  }
  return dist
}

export function createClassroomSession({ teacherUserId, datum, settings }) {
  const now = nowMs()
  const today = todayDatum()
  const id = randomUUID()
  const { joinCode, joinCodeHash } = resolveJoinCode()

  // datum kommt als YYYY-MM-DD von der API → in MM-DD + year aufsplitten
  let resolvedDatum, resolvedYear
  if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    const [y, m, d] = datum.split('-')
    resolvedDatum = `${m}-${d}`
    resolvedYear = Number(y)
  } else {
    resolvedDatum = today.datum
    resolvedYear = today.year
  }

  const row = {
    id,
    teacher_user_id: teacherUserId,
    join_code_hash: joinCodeHash,
    state: 'lobby',
    datum: resolvedDatum,
    year: resolvedYear,
    settings_json: JSON.stringify(mergeSettings({ allowLateJoin: true }, settings || {})),
    created_at: now,
    expires_at: now + RETENTION_MS,
  }
  stmts.insertSession.run(row)
  return {
    session: normalizeSessionRow(stmts.getSessionById.get(id)),
    joinCode,
  }
}

export function getSessionById({ sessionId }) {
  return normalizeSessionRow(stmts.getSessionById.get(sessionId))
}

export function listTeacherSessions({ teacherUserId, limit = 10 }) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10))
  return stmts.listTeacherSessions.all(teacherUserId, safeLimit).map(normalizeSessionRow)
}

export function startClassroomSession({ sessionId, teacherUserId, allowLateJoin }) {
  const raw = stmts.getSessionById.get(sessionId)
  if (!raw) return { error: 'NOT_FOUND' }
  if (raw.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (!['created', 'lobby'].includes(raw.state)) return { error: 'INVALID_STATE' }

  const startedAt = nowMs()
  const existingSettings = parseJsonSafe(raw.settings_json, {}, logger, { sessionId, field: 'settings_json' })
  const settings = mergeSettings(existingSettings, {
    allowLateJoin: typeof allowLateJoin === 'boolean'
      ? allowLateJoin
      : (typeof existingSettings.allowLateJoin === 'boolean' ? existingSettings.allowLateJoin : true),
  })
  stmts.updateSessionState.run({
    id: sessionId,
    state: 'running',
    settings_json: JSON.stringify(settings),
    started_at: startedAt,
    finished_at: raw.finished_at,
  })
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

export function finishClassroomSession({ sessionId, teacherUserId }) {
  const raw = stmts.getSessionById.get(sessionId)
  if (!raw) return { error: 'NOT_FOUND' }
  if (raw.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (!['running', 'lobby', 'created'].includes(raw.state)) return { error: 'INVALID_STATE' }

  stmts.updateSessionState.run({
    id: sessionId,
    state: 'finished',
    settings_json: raw.settings_json,
    started_at: raw.started_at,
    finished_at: nowMs(),
  })
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

export function finishClassroomSessionByHostTimeout({ sessionId }) {
  const raw = stmts.getSessionById.get(sessionId)
  if (!raw) return { error: 'NOT_FOUND' }
  if (!['running', 'lobby', 'created'].includes(raw.state)) return { error: 'INVALID_STATE' }

  const settings = mergeSettings(parseJsonSafe(raw.settings_json, {}, logger, { sessionId, field: 'settings_json' }), { host_timeout: true })
  stmts.updateSessionState.run({
    id: sessionId,
    state: 'finished',
    settings_json: JSON.stringify(settings),
    started_at: raw.started_at,
    finished_at: nowMs(),
  })
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

export function joinClassroomSession({ code }) {
  const normalizedCode = normalizeJoinCode(code)
  const raw = stmts.findActiveSessionByJoinHash.get(hashValue(normalizedCode), nowMs())
  if (!raw) return { error: 'INVALID_CODE' }

  const settings = parseJsonSafe(raw.settings_json, {}, logger, { sessionId: raw.id, field: 'settings_json' })
  if (raw.state === 'running' && !settings.allowLateJoin) {
    return { error: 'LATE_JOIN_DISABLED' }
  }
  if (!['created', 'lobby', 'running'].includes(raw.state)) {
    return { error: 'SESSION_NOT_JOINABLE' }
  }

  const currentParticipants = stmts.countActiveParticipants.get(raw.id)?.c || 0
  if (currentParticipants >= SESSION_MAX_PARTICIPANTS) {
    return { error: 'SESSION_FULL' }
  }

  const participantId = randomUUID()
  const participantToken = randomUUID()
  const joinedAt = nowMs()
  stmts.insertParticipant.run({
    id: participantId,
    session_id: raw.id,
    participant_token_hash: hashValue(participantToken),
    joined_at: joinedAt,
    last_seen_at: joinedAt,
  })

  return {
    session: normalizeSessionRow(raw),
    participant: {
      id: participantId,
      token: participantToken,
    },
  }
}

export function markParticipantHeartbeat({ sessionId, participantId, participantToken }) {
  const participantTokenHash = hashValue(participantToken)
  const info = stmts.updateParticipantSeen.run({
    session_id: sessionId,
    id: participantId,
    participant_token_hash: participantTokenHash,
    last_seen_at: nowMs(),
  })
  if (!info.changes) return { error: 'PARTICIPANT_NOT_FOUND' }
  return { ok: true }
}

export function markParticipantLeft({ sessionId, participantId, participantToken }) {
  const participantTokenHash = hashValue(participantToken)
  const info = stmts.markParticipantLeft.run({
    session_id: sessionId,
    id: participantId,
    participant_token_hash: participantTokenHash,
    left_at: nowMs(),
  })
  if (!info.changes) return { error: 'PARTICIPANT_NOT_FOUND' }
  return { ok: true }
}

export function submitClassroomRound({ sessionId, participantId, participantToken, roundNo, payload, score, maxScore }) {
  const participantTokenHash = hashValue(participantToken)
  const participant = stmts.getParticipant.get(participantId, sessionId, participantTokenHash)
  if (!participant) return { error: 'PARTICIPANT_NOT_FOUND' }

  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.state !== 'running') return { error: 'INVALID_STATE' }

  stmts.upsertSubmission.run({
    id: randomUUID(),
    session_id: sessionId,
    participant_id: participantId,
    round_no: roundNo,
    payload_json: JSON.stringify(payload || {}),
    score: Math.max(0, Number(score || 0)),
    max_score: Math.max(0, Number(maxScore || 0)),
    submitted_at: nowMs(),
  })

  return { ok: true }
}

export function getClassroomDashboard({ sessionId, teacherUserId }) {
  const raw = stmts.getSessionById.get(sessionId)
  if (!raw) return { error: 'NOT_FOUND' }
  if (raw.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }

  const ROUND_GAME = { 1: 'kollokationen', 2: 'wortzwilling', 3: 'zeitenwende', 4: 'lueckenfueller' }
  const GAME_LABEL = { kollokationen: 'Kollokationen', wortzwilling: 'Wort-Zwilling', zeitenwende: 'Zeitenwende', lueckenfueller: 'Lückenfüller' }

  const now = nowMs()
  const totalParticipants = stmts.countParticipants.get(sessionId)?.c || 0
  const connectedCount = stmts.countConnectedParticipants.get(sessionId, now - CONNECTED_WINDOW_MS)?.c || 0
  const submittedCount = stmts.countSubmittedParticipants.get(sessionId)?.c || 0
  const avg = stmts.avgScore.get(sessionId)?.avg_score
  const rows = stmts.listSubmissionScores.all(sessionId)
  const distribution = buildDistribution(rows)
  const lastAt = stmts.lastSubmissionAt.get(sessionId)?.last_at || null
  const perGameRows = stmts.perGameStats.all(sessionId)

  const perGame = perGameRows.map((r) => ({
    roundNo: r.round_no,
    game: ROUND_GAME[r.round_no] || `runde-${r.round_no}`,
    label: GAME_LABEL[ROUND_GAME[r.round_no]] || `Runde ${r.round_no}`,
    participantCount: r.participant_count,
    avgScore: Number.isFinite(r.avg_score) ? Number(r.avg_score.toFixed(1)) : 0,
    avgMaxScore: Number.isFinite(r.avg_max_score) ? Number(r.avg_max_score.toFixed(1)) : 10,
  }))

  return {
    session: normalizeSessionRow(raw),
    metrics: {
      total_count: totalParticipants,
      connected_count: connectedCount,
      submitted_count: submittedCount,
      avg_score: Number.isFinite(avg) ? Number(avg.toFixed(2)) : 0,
      score_distribution: distribution,
      last_submission_at: lastAt,
    },
    perGame,
  }
}

export function createClassroomExportJob({ sessionId, teacherUserId, type }) {
  const raw = stmts.getSessionById.get(sessionId)
  if (!raw) return { error: 'NOT_FOUND' }
  if (raw.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (raw.state !== 'finished') return { error: 'INVALID_STATE' }

  const exportId = randomUUID()
  stmts.insertExport.run({
    id: exportId,
    session_id: sessionId,
    type,
    status: 'queued',
    created_at: nowMs(),
  })

  return { exportJob: normalizeExportRow(stmts.getExportById.get(exportId, sessionId)) }
}

export function getClassroomExportJob({ sessionId, exportId, teacherUserId }) {
  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }

  const exportRow = stmts.getExportById.get(exportId, sessionId)
  if (!exportRow) return { error: 'NOT_FOUND' }

  return { exportJob: normalizeExportRow(exportRow) }
}

export function listClassroomExportJobs({ sessionId, teacherUserId }) {
  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  return {
    exportJobs: stmts.listExportsBySession.all(sessionId).map(normalizeExportRow),
  }
}

export function listQueuedExports({ type, limit = 10 }) {
  return stmts.listQueuedExportsByType.all(type, limit).map(normalizeExportRow)
}

export function claimExportJob({ sessionId, exportId }) {
  const result = stmts.claimExportJob.run({ id: exportId, session_id: sessionId })
  return result.changes > 0
}

export function markExportDone({ sessionId, exportId, fileRef }) {
  stmts.updateExportStatus.run({
    id: exportId,
    session_id: sessionId,
    status: 'done',
    file_ref: fileRef,
    error: null,
    finished_at: nowMs(),
  })
}

export function markExportFailed({ sessionId, exportId, errorMessage }) {
  stmts.updateExportStatus.run({
    id: exportId,
    session_id: sessionId,
    status: 'failed',
    file_ref: null,
    error: String(errorMessage || 'Unbekannter Exportfehler').slice(0, 1000),
    finished_at: nowMs(),
  })
}

export function getExportRowsForSession({ sessionId }) {
  return stmts.listExportRowsForSession.all(sessionId)
}

export function cleanupExpiredSessions({ now = nowMs(), limit = 100 } = {}) {
  const archivedNow = stmts.archiveExpiredSessions.run(now).changes || 0
  const expiredIds = stmts.listExpiredSessionIds.all(now, limit).map(r => r.id)
  if (!expiredIds.length) return { deletedSessions: 0, archivedSessions: archivedNow, expiredIds: [], fileRefs: [] }
  const tx = db.transaction(() => {
    let deleted = 0
    const fileRefs = []
    for (const id of expiredIds) {
      const rows = stmts.listExportFileRefsForSession.all(id)
      for (const row of rows) {
        if (row?.file_ref) fileRefs.push(row.file_ref)
      }
      const result = stmts.deleteSessionById.run(id)
      deleted += result.changes
    }
    return { deleted, fileRefs }
  })
  const result = tx()
  return {
    deletedSessions: result.deleted,
    archivedSessions: archivedNow,
    expiredIds,
    fileRefs: result.fileRefs,
  }
}
