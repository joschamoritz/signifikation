/**
 * server/classroom-v2/store.js
 *
 * Datenzugriff-Layer fuer Classroom v2 (cr2_* Tabellen).
 *
 * Patterns aus dem alten server/classroom-store.js bewusst uebernommen
 * (Risiko R-3 im Plan): HMAC-Hash auf sensitive Tokens, Submission-
 * Idempotenz via UNIQUE-Index + ON CONFLICT, Dashboard-Konsolidierung
 * in <=3 Queries. Wo hier abgewichen wird (Code im Klartext statt Hash),
 * ist es bewusst – der Code ist als oeffentlicher Identifier gedacht
 * (Beamer/QR), nur das Schueler-auth_token wird gehasht.
 */

import { createHmac, randomUUID } from 'crypto'
import db from '../db.js'
import logger from '../logger.js'
import { generateUniqueJoinCode } from './join-code.js'
import { scoreSubmission } from './scoring/index.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const configuredJoinSecret = (process.env.CLASSROOM_JOIN_SECRET || '').trim()
if (IS_PROD && !configuredJoinSecret) {
  throw new Error('CLASSROOM_JOIN_SECRET ist nicht gesetzt (Classroom v2)')
}
const SECRET = configuredJoinSecret || 'dev-classroom-secret'

const CONNECTED_WINDOW_MS = 45 * 1000
const SESSION_MAX_PARTICIPANTS = 50
const MAX_LEMMATA_PER_ASSIGNMENT = 3
const MAX_RAW_ANSWER_BYTES = 4096
const VALID_MODES = ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']

function nowMs() { return Date.now() }

function hashToken(token) {
  return createHmac('sha256', SECRET).update(String(token)).digest('hex')
}

function parseJsonSafe(value, fallback, context) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (err) {
    logger.warn({ err, context }, 'Ungueltiges JSON in cr2_* – Fallback verwendet')
    return fallback
  }
}

// ── Prepared Statements ──────────────────────────────────────────────
const stmts = {
  // Sessions
  insertSession: db.prepare(`
    INSERT INTO cr2_session (id, code, teacher_user_id, title, status, settings_json, created_at)
    VALUES (@id, @code, @teacher_user_id, @title, 'lobby', @settings_json, @created_at)
  `),
  getSessionById: db.prepare(`SELECT * FROM cr2_session WHERE id = ?`),
  getSessionByCode: db.prepare(`
    SELECT * FROM cr2_session
    WHERE code = ? AND status IN ('lobby','running')
    LIMIT 1
  `),
  listTeacherSessions: db.prepare(`
    SELECT * FROM cr2_session
    WHERE teacher_user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),
  startSession: db.prepare(`
    UPDATE cr2_session
    SET status = 'running', started_at = @started_at, locked_at = @started_at
    WHERE id = @id AND status = 'lobby'
  `),
  finishSession: db.prepare(`
    UPDATE cr2_session
    SET status = 'finished', finished_at = @finished_at
    WHERE id = @id AND status IN ('lobby','running')
  `),
  abortSession: db.prepare(`
    UPDATE cr2_session
    SET status = 'aborted', finished_at = @finished_at
    WHERE id = @id AND status IN ('lobby','running')
  `),

  // Assignments
  insertAssignment: db.prepare(`
    INSERT INTO cr2_assignment (id, session_id, mode, lemma_ids, content_snapshot, position, created_at)
    VALUES (@id, @session_id, @mode, @lemma_ids, @content_snapshot, @position, @created_at)
  `),
  getAssignmentById: db.prepare(`SELECT * FROM cr2_assignment WHERE id = ?`),
  listAssignmentsBySession: db.prepare(`
    SELECT * FROM cr2_assignment
    WHERE session_id = ?
    ORDER BY position ASC, created_at ASC
  `),
  countAssignments: db.prepare(`SELECT COUNT(1) AS c FROM cr2_assignment WHERE session_id = ?`),
  deleteAssignment: db.prepare(`
    DELETE FROM cr2_assignment WHERE id = ? AND session_id = ?
  `),

  // Participants
  insertParticipant: db.prepare(`
    INSERT INTO cr2_participant (id, session_id, display_name, auth_token, joined_at, last_seen_at, connected)
    VALUES (@id, @session_id, @display_name, @auth_token, @joined_at, @joined_at, 1)
  `),
  countActiveParticipants: db.prepare(`
    SELECT COUNT(1) AS c FROM cr2_participant WHERE session_id = ? AND left_at IS NULL
  `),
  getParticipantByTokenHash: db.prepare(`
    SELECT * FROM cr2_participant WHERE auth_token = ? LIMIT 1
  `),
  heartbeatParticipant: db.prepare(`
    UPDATE cr2_participant
    SET last_seen_at = @ts, connected = 1, left_at = NULL
    WHERE id = @id
  `),
  // Socket-Disconnect ohne Leave: connected=0, last_seen_at aktualisieren,
  // left_at bleibt NULL → Schueler kann innerhalb des Reconnect-Window (D6) zurueck.
  markParticipantDisconnect: db.prepare(`
    UPDATE cr2_participant
    SET connected = 0, last_seen_at = @ts
    WHERE id = @id AND left_at IS NULL
  `),
  leaveParticipant: db.prepare(`
    UPDATE cr2_participant
    SET left_at = @ts, connected = 0
    WHERE id = @id AND left_at IS NULL
  `),
  listParticipantsForDashboard: db.prepare(`
    SELECT id, display_name, joined_at, last_seen_at, connected, left_at
    FROM cr2_participant
    WHERE session_id = ?
    ORDER BY joined_at ASC
  `),

  // Submissions + Scores
  insertSubmission: db.prepare(`
    INSERT INTO cr2_submission (id, session_id, assignment_id, participant_id, lemma_id, round_index, raw_answer, submitted_at, client_ms)
    VALUES (@id, @session_id, @assignment_id, @participant_id, @lemma_id, @round_index, @raw_answer, @submitted_at, @client_ms)
    ON CONFLICT(participant_id, assignment_id, lemma_id, round_index) DO NOTHING
  `),
  getSubmissionByKey: db.prepare(`
    SELECT * FROM cr2_submission
    WHERE participant_id = ? AND assignment_id = ? AND lemma_id = ? AND round_index = ?
    LIMIT 1
  `),
  insertScore: db.prepare(`
    INSERT INTO cr2_score_record (submission_id, session_id, participant_id, assignment_id, score, max_score, correct, detail_json, scored_at)
    VALUES (@submission_id, @session_id, @participant_id, @assignment_id, @score, @max_score, @correct, @detail_json, @scored_at)
    ON CONFLICT(submission_id) DO NOTHING
  `),
  getScoreBySubmission: db.prepare(`
    SELECT * FROM cr2_score_record WHERE submission_id = ?
  `),
  listSessionSubmissionsForDashboard: db.prepare(`
    SELECT s.lemma_id, s.participant_id, sc.score, sc.max_score, sc.correct
    FROM cr2_submission s
    JOIN cr2_score_record sc ON sc.submission_id = s.id
    WHERE s.session_id = ?
  `),

  // Capability Grants
  insertCapability: db.prepare(`
    INSERT INTO cr2_capability_grant (id, session_id, subject_kind, subject_id, capability, granted_at)
    VALUES (@id, @session_id, @subject_kind, @subject_id, @capability, @granted_at)
    ON CONFLICT(session_id, subject_kind, subject_id, capability) WHERE revoked_at IS NULL DO NOTHING
  `),
  revokeAllForSession: db.prepare(`
    UPDATE cr2_capability_grant
    SET revoked_at = @ts
    WHERE session_id = @session_id AND revoked_at IS NULL
  `),
  revokeAllForSubject: db.prepare(`
    UPDATE cr2_capability_grant
    SET revoked_at = @ts
    WHERE session_id = @session_id
      AND subject_kind = @subject_kind
      AND subject_id = @subject_id
      AND revoked_at IS NULL
  `),
  revokeByCapability: db.prepare(`
    UPDATE cr2_capability_grant
    SET revoked_at = @ts
    WHERE session_id = @session_id AND capability = @capability AND revoked_at IS NULL
  `),
  hasCapability: db.prepare(`
    SELECT 1 FROM cr2_capability_grant
    WHERE session_id = ? AND subject_kind = ? AND subject_id = ? AND capability = ?
      AND revoked_at IS NULL
    LIMIT 1
  `),
}

// ── Normalizer ──────────────────────────────────────────────────────
function normalizeSessionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    teacherUserId: row.teacher_user_id,
    title: row.title,
    status: row.status,
    settings: parseJsonSafe(row.settings_json, {}, { sessionId: row.id }),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lockedAt: row.locked_at,
  }
}

function normalizeAssignmentRow(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    mode: row.mode,
    lemmaIds: parseJsonSafe(row.lemma_ids, [], { assignmentId: row.id, field: 'lemma_ids' }),
    contentSnapshot: parseJsonSafe(row.content_snapshot, {}, { assignmentId: row.id, field: 'content_snapshot' }),
    position: row.position,
    createdAt: row.created_at,
  }
}

function normalizeParticipantRow(row) {
  if (!row) return null
  return {
    id: row.id,
    sessionId: row.session_id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
    connected: !!row.connected,
    leftAt: row.left_at,
  }
}

// ── Session-CRUD ────────────────────────────────────────────────────
export function createSession({ teacherUserId, title = null, settings = {} }) {
  if (!teacherUserId) return { error: 'TEACHER_REQUIRED' }
  const code = generateUniqueJoinCode()
  const id = randomUUID()
  const tx = db.transaction(() => {
    stmts.insertSession.run({
      id,
      code,
      teacher_user_id: teacherUserId,
      title: title || null,
      settings_json: JSON.stringify(settings || {}),
      created_at: nowMs(),
    })
    // Schreibrechte (CRUD auf Session/Assignment, Start/Finish)
    stmts.insertCapability.run({
      id: randomUUID(),
      session_id: id,
      subject_kind: 'teacher',
      subject_id: teacherUserId,
      capability: 'session:manage',
      granted_at: nowMs(),
    })
    // Lese-/Socket-Recht: Voraussetzung fuer cr2-Socket-Namespace,
    // damit der Lehrer in den Teacher-Room joinen darf.
    stmts.insertCapability.run({
      id: randomUUID(),
      session_id: id,
      subject_kind: 'teacher',
      subject_id: teacherUserId,
      capability: 'session:read',
      granted_at: nowMs(),
    })
  })
  tx()
  return { session: normalizeSessionRow(stmts.getSessionById.get(id)) }
}

export function getSessionById(sessionId) {
  return normalizeSessionRow(stmts.getSessionById.get(sessionId))
}

export function listTeacherSessions({ teacherUserId, limit = 20 }) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20))
  return stmts.listTeacherSessions.all(teacherUserId, safeLimit).map(normalizeSessionRow)
}

export function startSession({ sessionId, teacherUserId }) {
  const row = stmts.getSessionById.get(sessionId)
  if (!row) return { error: 'NOT_FOUND' }
  if (row.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (row.status !== 'lobby') return { error: 'INVALID_STATE' }
  const assignmentCount = stmts.countAssignments.get(sessionId)?.c || 0
  if (assignmentCount === 0) return { error: 'NO_ASSIGNMENT' }
  const result = stmts.startSession.run({ id: sessionId, started_at: nowMs() })
  if (!result.changes) return { error: 'INVALID_STATE' }
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

export function finishSession({ sessionId, teacherUserId, reason = 'manual' }) {
  const row = stmts.getSessionById.get(sessionId)
  if (!row) return { error: 'NOT_FOUND' }
  if (row.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  const now = nowMs()
  const tx = db.transaction(() => {
    const updated = stmts.finishSession.run({ id: sessionId, finished_at: now })
    if (!updated.changes) return 'INVALID_STATE'
    // submission:write fuer alle Schueler beenden
    stmts.revokeByCapability.run({
      session_id: sessionId,
      capability: 'submission:write',
      ts: now,
    })
    return null
  })
  const err = tx()
  if (err) return { error: err }
  logger.info({ sessionId, reason }, 'cr2 session finished')
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

// ── Assignments ─────────────────────────────────────────────────────
export function addAssignment({ sessionId, teacherUserId, mode, lemmaIds, contentSnapshot }) {
  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (session.status !== 'lobby') return { error: 'INVALID_STATE' }
  if (!VALID_MODES.includes(mode)) return { error: 'INVALID_MODE' }
  if (!Array.isArray(lemmaIds) || lemmaIds.length < 1) return { error: 'NO_LEMMATA' }
  if (lemmaIds.length > MAX_LEMMATA_PER_ASSIGNMENT) return { error: 'TOO_MANY_LEMMATA' }

  const existing = stmts.countAssignments.get(sessionId)?.c || 0
  // D2: genau 1 Modus pro Session in v1 – also genau 1 Assignment.
  if (existing >= 1) return { error: 'ASSIGNMENT_EXISTS' }

  const id = randomUUID()
  stmts.insertAssignment.run({
    id,
    session_id: sessionId,
    mode,
    lemma_ids: JSON.stringify(lemmaIds),
    content_snapshot: JSON.stringify(contentSnapshot || {}),
    position: existing,
    created_at: nowMs(),
  })
  return { assignment: normalizeAssignmentRow(stmts.getAssignmentById.get(id)) }
}

export function listAssignments(sessionId) {
  return stmts.listAssignmentsBySession.all(sessionId).map(normalizeAssignmentRow)
}

export function getAssignmentById(assignmentId) {
  return normalizeAssignmentRow(stmts.getAssignmentById.get(assignmentId))
}

export function removeAssignment({ sessionId, assignmentId, teacherUserId }) {
  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (session.status !== 'lobby') return { error: 'INVALID_STATE' }
  const result = stmts.deleteAssignment.run(assignmentId, sessionId)
  if (!result.changes) return { error: 'NOT_FOUND' }
  return { ok: true }
}

// ── Join / Participant lifecycle ────────────────────────────────────
export function joinByCode({ code, displayName }) {
  const raw = stmts.getSessionByCode.get(String(code || '').trim().toLowerCase())
  if (!raw) return { error: 'INVALID_CODE' }
  if (raw.status === 'running' && raw.locked_at && raw.settings_json) {
    const settings = parseJsonSafe(raw.settings_json, {}, { sessionId: raw.id })
    if (settings.allowLateJoin === false) return { error: 'LATE_JOIN_DISABLED' }
  }

  const participantId = randomUUID()
  const authToken = randomUUID() + '.' + randomUUID()
  const authTokenHash = hashToken(authToken)

  const txResult = db.transaction(() => {
    const current = stmts.countActiveParticipants.get(raw.id)?.c || 0
    if (current >= SESSION_MAX_PARTICIPANTS) return 'SESSION_FULL'
    stmts.insertParticipant.run({
      id: participantId,
      session_id: raw.id,
      display_name: String(displayName || '').trim().slice(0, 40) || `Schueler:in ${current + 1}`,
      auth_token: authTokenHash,
      joined_at: nowMs(),
    })
    stmts.insertCapability.run({
      id: randomUUID(),
      session_id: raw.id,
      subject_kind: 'participant',
      subject_id: participantId,
      capability: 'submission:write',
      granted_at: nowMs(),
    })
    // Socket-Recht: View auf die laufende Session (cr2-Namespace, view:updated etc.).
    // Wird beim Session-Finish bewusst NICHT revoked (D6) — Schueler kann mit
    // gueltigem Token zurueckkehren, auch wenn submission:write bereits weg ist.
    stmts.insertCapability.run({
      id: randomUUID(),
      session_id: raw.id,
      subject_kind: 'participant',
      subject_id: participantId,
      capability: 'view:student',
      granted_at: nowMs(),
    })
    return null
  })()
  if (txResult) return { error: txResult }

  return {
    session: normalizeSessionRow(raw),
    participant: { id: participantId, token: authToken },
  }
}

export function findParticipantByToken(token) {
  if (!token) return null
  const row = stmts.getParticipantByTokenHash.get(hashToken(token))
  return normalizeParticipantRow(row)
}

export function heartbeatParticipant(participantId) {
  const r = stmts.heartbeatParticipant.run({ id: participantId, ts: nowMs() })
  return r.changes > 0
}

// Socket-Disconnect, KEIN Leave: nur connected=0 + last_seen_at,
// left_at bleibt NULL bis zum tatsaechlichen Leave / Timeout-Window-Ablauf (D6).
export function markParticipantDisconnect(participantId) {
  const r = stmts.markParticipantDisconnect.run({ id: participantId, ts: nowMs() })
  return r.changes > 0
}

export function leaveParticipant(participantId) {
  const r = stmts.leaveParticipant.run({ id: participantId, ts: nowMs() })
  return r.changes > 0
}

// ── Submissions (serverautoritatives Scoring) ───────────────────────
// WICHTIG (D13/R6): score wird AUSSCHLIESSLICH hier berechnet,
// raw_answer ist alles, was vom Client kommt. Idempotent via UNIQUE
// (participant_id, assignment_id, lemma_id, round_index).
export function submitAnswer({
  participantId,
  sessionId,
  assignmentId,
  lemmaId,
  roundIndex = 0,
  rawAnswer,
  clientMs = null,
}) {
  if (!participantId || !sessionId || !assignmentId || !lemmaId) {
    return { error: 'INVALID_INPUT' }
  }
  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.status !== 'running') return { error: 'INVALID_STATE' }

  const assignmentRow = stmts.getAssignmentById.get(assignmentId)
  if (!assignmentRow || assignmentRow.session_id !== sessionId) return { error: 'NOT_FOUND' }

  // Capability-Check als zweites Sicherheitsnetz; Route hat bereits
  // requireCapability('submission:write') durchgelaufen.
  const hasCap = stmts.hasCapability.get(sessionId, 'participant', participantId, 'submission:write')
  if (!hasCap) return { error: 'FORBIDDEN' }

  const rawAnswerJson = JSON.stringify(rawAnswer ?? {})
  if (rawAnswerJson.length > MAX_RAW_ANSWER_BYTES) return { error: 'PAYLOAD_TOO_LARGE' }

  const assignment = normalizeAssignmentRow(assignmentRow)
  // content_snapshot ist per Assignment; bei mehreren Lemmata muessen
  // die einzelnen lemma-spezifischen Inhalte unter contentSnapshot[lemmaId]
  // liegen. Wir akzeptieren beide Formen: { byLemma: { [lemmaId]: {...} } }
  // oder ein direktes Single-Lemma-Snapshot (wenn nur 1 Lemma in der
  // Liste war).
  const lemmaSnapshot = assignment.contentSnapshot?.byLemma?.[lemmaId]
    ?? assignment.contentSnapshot

  let scoreResult
  try {
    scoreResult = scoreSubmission({
      mode: assignment.mode,
      contentSnapshot: lemmaSnapshot,
      rawAnswer,
      roundIndex,
    })
  } catch (err) {
    logger.error({ err, assignmentId, lemmaId }, 'Scoring fehlgeschlagen')
    return { error: 'SCORING_FAILED' }
  }

  const submissionId = randomUUID()
  const submittedAt = nowMs()
  const tx = db.transaction(() => {
    stmts.insertSubmission.run({
      id: submissionId,
      session_id: sessionId,
      assignment_id: assignmentId,
      participant_id: participantId,
      lemma_id: lemmaId,
      round_index: roundIndex,
      raw_answer: rawAnswerJson,
      submitted_at: submittedAt,
      client_ms: Number.isFinite(clientMs) ? Math.trunc(clientMs) : null,
    })
    // Idempotenz: bei Konflikt existiert die Submission bereits.
    // Wir lesen sie und springen ggf. auf das bereits gespeicherte
    // Score-Record. So liefert der Client bei Retry denselben Score
    // ohne doppelt zu zaehlen.
    const existing = stmts.getSubmissionByKey.get(participantId, assignmentId, lemmaId, roundIndex)
    if (!existing) return 'IDEMPOTENCY_RACE'
    const finalSubmissionId = existing.id
    stmts.insertScore.run({
      submission_id: finalSubmissionId,
      session_id: sessionId,
      participant_id: participantId,
      assignment_id: assignmentId,
      score: scoreResult.score,
      max_score: scoreResult.maxScore,
      correct: scoreResult.correct,
      detail_json: JSON.stringify(scoreResult.detail || {}),
      scored_at: submittedAt,
    })
    return finalSubmissionId
  })

  const finalId = tx()
  if (finalId === 'IDEMPOTENCY_RACE') return { error: 'IDEMPOTENCY_RACE' }

  const existingScore = stmts.getScoreBySubmission.get(finalId)
  return {
    submissionId: finalId,
    score: existingScore?.score ?? scoreResult.score,
    maxScore: existingScore?.max_score ?? scoreResult.maxScore,
    correct: existingScore?.correct ?? scoreResult.correct,
  }
}

// ── Capability-Helfer ───────────────────────────────────────────────
export function hasCapability({ sessionId, subjectKind, subjectId, capability }) {
  const row = stmts.hasCapability.get(sessionId, subjectKind, subjectId, capability)
  return !!row
}

export function grantCapability({ sessionId, subjectKind, subjectId, capability }) {
  stmts.insertCapability.run({
    id: randomUUID(),
    session_id: sessionId,
    subject_kind: subjectKind,
    subject_id: subjectId,
    capability,
    granted_at: nowMs(),
  })
}

export function revokeCapability({ sessionId, subjectKind, subjectId }) {
  stmts.revokeAllForSubject.run({
    session_id: sessionId,
    subject_kind: subjectKind,
    subject_id: subjectId,
    ts: nowMs(),
  })
}

// ── Dashboard (konsolidiert in <=3 Queries) ─────────────────────────
export function getDashboard({ sessionId, teacherUserId }) {
  const sessionRow = stmts.getSessionById.get(sessionId)
  if (!sessionRow) return { error: 'NOT_FOUND' }
  if (sessionRow.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }

  const session = normalizeSessionRow(sessionRow)
  const now = nowMs()
  const connectedThreshold = now - CONNECTED_WINDOW_MS

  // Query 2: Participants
  const participantRows = stmts.listParticipantsForDashboard.all(sessionId)
  const participants = participantRows.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    joinedAt: p.joined_at,
    lastSeenAt: p.last_seen_at,
    connected: !!p.connected && !p.left_at && p.last_seen_at >= connectedThreshold,
    leftAt: p.left_at,
  }))

  // Query 3: Submissions + Scores zusammen (single JOIN, kein N+1)
  const submissionRows = stmts.listSessionSubmissionsForDashboard.all(sessionId)
  const perLemma = new Map()
  for (const row of submissionRows) {
    const key = String(row.lemma_id)
    if (!perLemma.has(key)) {
      perLemma.set(key, { lemmaId: key, submitted: 0, scoreSum: 0, maxSum: 0, correctSum: 0 })
    }
    const agg = perLemma.get(key)
    agg.submitted += 1
    agg.scoreSum += Number(row.score) || 0
    agg.maxSum += Number(row.max_score) || 0
    agg.correctSum += Number(row.correct) || 0
  }
  const perLemmaArr = Array.from(perLemma.values()).map((agg) => ({
    lemmaId: agg.lemmaId,
    submitted: agg.submitted,
    correctPct: agg.maxSum > 0 ? Math.round((agg.scoreSum / agg.maxSum) * 100) : 0,
  }))

  return {
    session,
    assignment: stmts.listAssignmentsBySession.all(sessionId).map(normalizeAssignmentRow)[0] || null,
    participants,
    aggregate: {
      totalParticipants: participants.length,
      connectedCount: participants.filter((p) => p.connected).length,
      submittedTotal: submissionRows.length,
      perLemma: perLemmaArr,
    },
  }
}

// ── Test-Helper (nur fuer Tests verwenden) ──────────────────────────
export const __test = {
  hashToken,
  stmts,
}
