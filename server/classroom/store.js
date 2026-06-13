/**
 * server/classroom/store.js
 *
 * Datenzugriff-Layer fuer den Klassenraum (classroom_* Tabellen).
 *
 * Bewaehrte Patterns (Risiko R-3 im Plan): HMAC-Hash auf sensitive
 * Tokens, Submission-
 * Idempotenz via UNIQUE-Index + ON CONFLICT, Dashboard-Konsolidierung
 * in <=3 Queries. Wo hier abgewichen wird (Code im Klartext statt Hash),
 * ist es bewusst – der Code ist als oeffentlicher Identifier gedacht
 * (Beamer/QR), nur das Schueler-auth_token wird gehasht.
 */

import { createHmac, randomUUID } from 'crypto'
import db from '../db.js'
import logger from '../logger.js'
import { generateUniqueJoinCode } from './join-code.js'
import { scoreSubmission, VALID_MODES } from './modes/index.js'
import { parseJsonSafe } from './json-safe.js'
import {
  extractDistractors,
  extractPicks,
  extractItems,
  buildDistribution,
  pickTopDistractor,
  buildRevealItems,
} from './results/index.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const configuredJoinSecret = (process.env.CLASSROOM_JOIN_SECRET || '').trim()
if (IS_PROD && !configuredJoinSecret) {
  throw new Error('CLASSROOM_JOIN_SECRET ist nicht gesetzt (Classroom v2)')
}
const SECRET = configuredJoinSecret || 'dev-classroom-secret'

const CONNECTED_WINDOW_MS = 45 * 1000
const SESSION_MAX_PARTICIPANTS = 50
const MAX_LEMMATA_PER_ASSIGNMENT = 3
// W2-T2: Eine Session kann mehrere Modi nacheinander spielen. Harte
// Obergrenze, damit eine 45-Min-Stunde nicht in eine endlose Modus-Kette
// ausartet (Setup-UI limitiert ebenfalls auf 5).
const MAX_ASSIGNMENTS_PER_SESSION = 5
const MAX_RAW_ANSWER_BYTES = 4096
// VALID_MODES kommt aus der Modus-Registry (./modes/index.js) — Single Source.
// D8: Auto-End nach 90 Min Inaktivitaet. last_activity_at ist die
// persistente Bezugsgroesse (siehe Migration 0007).
export const DEFAULT_AUTO_END_IDLE_MS = 90 * 60 * 1000

// E1/D9 Retention (W4): zweistufiges Aufraeumen beendeter Sessions.
//   Stufe A — Name-Anonymisierung: 48 h nach finished_at wird display_name
//     (einziger potenzielle Klarname Minderjaehriger) durch einen neutralen
//     Platzhalter ersetzt. Der Zweck des Namens (Live-Zuordnung am Beamer, D15)
//     ist nach Stundenende erloschen; die Nachbereitung (getSessionResults)
//     ist ohnehin pseudonym.
//   Stufe B — Hard-Delete: 30 Tage nach finished_at wird die ganze Session
//     geloescht (CASCADE raeumt Assignments/Participants/Submissions/Scores/
//     Capabilities mit weg). Deckelt das Tabellenwachstum endgueltig.
//   classroom_telemetry bleibt unberuehrt — bereits pseudonym (kein
//     display_name), traegt die §14-Metriken.
export const DEFAULT_NAME_ANONYMIZE_MS = 48 * 60 * 60 * 1000      // 48 h
export const DEFAULT_HARD_DELETE_MS    = 30 * 24 * 60 * 60 * 1000 // 30 Tage
export const ANONYMIZED_DISPLAY_NAME   = 'Schüler:in'
// W4-U2: nie gestartete Lobby-Sessions (Lehrer legt an, zieht Join-Code,
// startet aber nie) erreichen weder das Auto-End (nur 'running') noch die
// finished-Retention — sie blieben sonst ewig liegen und belegen Join-Codes.
// Nach 7 Tagen ohne Start gilt die Session als verwaist und wird direkt hart
// geloescht (CASCADE). 7 Tage decken jede Wochenend-Vorbereitung ab; ein
// Planungs-/Termin-Feature existiert nicht (Sessions sind ad-hoc).
export const DEFAULT_LOBBY_ABANDON_MS  = 7 * 24 * 60 * 60 * 1000  // 7 Tage

function nowMs() { return Date.now() }

function hashToken(token) {
  return createHmac('sha256', SECRET).update(String(token)).digest('hex')
}

// ── Prepared Statements ──────────────────────────────────────────────
const stmts = {
  // Sessions
  insertSession: db.prepare(`
    INSERT INTO classroom_session (id, code, teacher_user_id, title, status, settings_json, created_at)
    VALUES (@id, @code, @teacher_user_id, @title, 'lobby', @settings_json, @created_at)
  `),
  getSessionById: db.prepare(`SELECT * FROM classroom_session WHERE id = ?`),
  getSessionByCode: db.prepare(`
    SELECT * FROM classroom_session
    WHERE code = ? AND status IN ('lobby','running')
    LIMIT 1
  `),
  listTeacherSessions: db.prepare(`
    SELECT s.*, (
      SELECT GROUP_CONCAT(a.mode, ',')
      FROM (
        SELECT mode FROM classroom_assignment
        WHERE session_id = s.id ORDER BY position ASC
      ) a
    ) AS modes
    FROM classroom_session s
    WHERE s.teacher_user_id = ?
    ORDER BY s.created_at DESC
    LIMIT ?
  `),
  startSession: db.prepare(`
    UPDATE classroom_session
    SET status = 'running', started_at = @started_at, locked_at = @started_at,
        last_activity_at = @started_at
    WHERE id = @id AND status = 'lobby'
  `),
  finishSession: db.prepare(`
    UPDATE classroom_session
    SET status = 'finished', finished_at = @finished_at, paused_at = NULL
    WHERE id = @id AND status IN ('lobby','running')
  `),
  deleteSession: db.prepare(`
    DELETE FROM classroom_session WHERE id = @id AND teacher_user_id = @teacher_user_id
  `),
  // Hinweis: Es gibt KEIN abortSession-Statement (mehr). Der 'aborted'-Status
  // wird nirgends erzeugt — es existiert kein Abort-Endpoint. Die lesende Seite
  // (getSessionResults/getParticipantReveal, Kiosk SET_VIEW) behandelt 'aborted'
  // weiterhin defensiv wie 'finished', falls der Status je eingefuehrt wird.
  // Pause/Resume als Flag: DB-Status bleibt 'running' (Index + Beitritt
  // unveraendert). pausedAt != NULL ⇒ Normalizer leitet 'paused' ab.
  // Nur eine laufende, noch nicht pausierte Session laesst sich pausieren.
  pauseSession: db.prepare(`
    UPDATE classroom_session
    SET paused_at = @ts, last_activity_at = @ts
    WHERE id = @id AND status = 'running' AND paused_at IS NULL
  `),
  resumeSession: db.prepare(`
    UPDATE classroom_session
    SET paused_at = NULL, last_activity_at = @ts
    WHERE id = @id AND status = 'running' AND paused_at IS NOT NULL
  `),
  // Aktivitaets-Heartbeat fuer Auto-End (D8). Nur laufende Sessions.
  touchSessionActivity: db.prepare(`
    UPDATE classroom_session
    SET last_activity_at = @ts
    WHERE id = @id AND status = 'running'
  `),
  // Auto-End-Kandidaten: laufende Sessions, deren letzte Aktivitaet
  // laenger als das Idle-Fenster zurueckliegt. COALESCE faengt
  // Alt-Zeilen ohne last_activity_at ab.
  listStaleRunningSessions: db.prepare(`
    SELECT * FROM classroom_session
    WHERE status = 'running'
      AND COALESCE(last_activity_at, started_at, created_at) <= @threshold
  `),

  // Retention Stufe A (E1/D9): display_name beendeter Sessions anonymisieren,
  // sobald finished_at aelter als das Fenster ist. Nur Zeilen, die noch nicht
  // anonymisiert sind (!= Platzhalter) → idempotent, kein Re-Write je Sweep.
  anonymizeStaleParticipants: db.prepare(`
    UPDATE classroom_participant
    SET display_name = @placeholder
    WHERE display_name != @placeholder
      AND session_id IN (
        SELECT id FROM classroom_session
        WHERE status IN ('finished','aborted')
          AND finished_at IS NOT NULL
          AND finished_at <= @threshold
      )
  `),
  // Retention Stufe B (E1): Kandidaten fuer Hard-Delete (beendet + ueberfaellig).
  listHardDeleteSessions: db.prepare(`
    SELECT id FROM classroom_session
    WHERE status IN ('finished','aborted')
      AND finished_at IS NOT NULL
      AND finished_at <= @threshold
  `),
  // Retention Stufe C (W4-U2): verwaiste Lobby-Sessions, die nie gestartet
  // wurden (started_at IS NULL) und deren Anlage laenger zurueckliegt als das
  // Fenster. Diese erreichen weder Auto-End (nur 'running') noch Stufe A/B
  // (kein finished_at) → ohne diese Stufe lecken sie unbegrenzt.
  listAbandonedLobbySessions: db.prepare(`
    SELECT id FROM classroom_session
    WHERE status = 'lobby'
      AND started_at IS NULL
      AND created_at <= @threshold
  `),
  // CASCADE raeumt Assignments/Participants/Submissions/Scores/Capabilities mit.
  deleteSessionById: db.prepare(`DELETE FROM classroom_session WHERE id = ?`),

  // Assignments
  insertAssignment: db.prepare(`
    INSERT INTO classroom_assignment (id, session_id, mode, lemma_ids, content_snapshot, position, created_at)
    VALUES (@id, @session_id, @mode, @lemma_ids, @content_snapshot, @position, @created_at)
  `),
  getAssignmentById: db.prepare(`SELECT * FROM classroom_assignment WHERE id = ?`),
  listAssignmentsBySession: db.prepare(`
    SELECT * FROM classroom_assignment
    WHERE session_id = ?
    ORDER BY position ASC, created_at ASC
  `),
  // Direkter Einzelzugriff auf das Assignment an Index i (0-basiert) einer Session.
  // Nutzt idx_classroom_assignment_session(session_id, position) — O(log N) statt O(N).
  // Ersetzt den listAssignmentsBySession.all()-Aufruf in submitAnswer und getCurrentAssignment.
  getAssignmentAtIndex: db.prepare(`
    SELECT * FROM classroom_assignment
    WHERE session_id = ?
    ORDER BY position ASC, created_at ASC
    LIMIT 1 OFFSET ?
  `),
  countAssignments: db.prepare(`SELECT COUNT(1) AS c FROM classroom_assignment WHERE session_id = ?`),
  deleteAssignment: db.prepare(`
    DELETE FROM classroom_assignment WHERE id = ? AND session_id = ?
  `),
  // W2-T2: Session-Zeiger auf das aktuell aktive Assignment vorruecken.
  // Nur laufende, nicht pausierte Sessions — der Wechsel selbst zaehlt als
  // Aktivitaet (D8). Bedingung @from schuetzt gegen Doppel-Klick/Race.
  advanceAssignmentIndex: db.prepare(`
    UPDATE classroom_session
    SET current_assignment_index = @to, last_activity_at = @ts
    WHERE id = @id AND status = 'running' AND paused_at IS NULL
      AND current_assignment_index = @from
  `),

  // Participants
  insertParticipant: db.prepare(`
    INSERT INTO classroom_participant (id, session_id, display_name, auth_token, joined_at, last_seen_at, connected)
    VALUES (@id, @session_id, @display_name, @auth_token, @joined_at, @joined_at, 1)
  `),
  countActiveParticipants: db.prepare(`
    SELECT COUNT(1) AS c FROM classroom_participant WHERE session_id = ? AND left_at IS NULL
  `),
  getParticipantByTokenHash: db.prepare(`
    SELECT * FROM classroom_participant WHERE auth_token = ? LIMIT 1
  `),
  heartbeatParticipant: db.prepare(`
    UPDATE classroom_participant
    SET last_seen_at = @ts, connected = 1, left_at = NULL
    WHERE id = @id
  `),
  // Socket-Disconnect ohne Leave: connected=0, last_seen_at aktualisieren,
  // left_at bleibt NULL → Schueler kann innerhalb des Reconnect-Window (D6) zurueck.
  markParticipantDisconnect: db.prepare(`
    UPDATE classroom_participant
    SET connected = 0, last_seen_at = @ts
    WHERE id = @id AND left_at IS NULL
  `),
  leaveParticipant: db.prepare(`
    UPDATE classroom_participant
    SET left_at = @ts, connected = 0
    WHERE id = @id AND left_at IS NULL
  `),
  // Kick durch die Lehrkraft: nur Teilnehmer DIESER Session, der noch dabei ist.
  kickParticipant: db.prepare(`
    UPDATE classroom_participant
    SET left_at = @ts, connected = 0
    WHERE id = @id AND session_id = @session_id AND left_at IS NULL
  `),
  listParticipantsForDashboard: db.prepare(`
    SELECT id, display_name, joined_at, last_seen_at, connected, left_at
    FROM classroom_participant
    WHERE session_id = ?
    ORDER BY joined_at ASC
  `),

  // Submissions + Scores
  insertSubmission: db.prepare(`
    INSERT INTO classroom_submission (id, session_id, assignment_id, participant_id, lemma_id, round_index, raw_answer, submitted_at, client_ms)
    VALUES (@id, @session_id, @assignment_id, @participant_id, @lemma_id, @round_index, @raw_answer, @submitted_at, @client_ms)
    ON CONFLICT(participant_id, assignment_id, lemma_id, round_index) DO NOTHING
  `),
  getSubmissionByKey: db.prepare(`
    SELECT * FROM classroom_submission
    WHERE participant_id = ? AND assignment_id = ? AND lemma_id = ? AND round_index = ?
    LIMIT 1
  `),
  insertScore: db.prepare(`
    INSERT INTO classroom_score_record (submission_id, session_id, participant_id, assignment_id, score, max_score, correct, detail_json, scored_at)
    VALUES (@submission_id, @session_id, @participant_id, @assignment_id, @score, @max_score, @correct, @detail_json, @scored_at)
    ON CONFLICT(submission_id) DO NOTHING
  `),
  getScoreBySubmission: db.prepare(`
    SELECT * FROM classroom_score_record WHERE submission_id = ?
  `),
  // Schritt 4 (C1): eigene Abgaben+Scores EINES Teilnehmers fuer die
  // Aufloesung. Nur nach Freigabe (Session finished/aborted) ausliefern (R1).
  listParticipantResultRows: db.prepare(`
    SELECT s.assignment_id, s.lemma_id, s.round_index, s.raw_answer,
           sc.score, sc.max_score, sc.correct, sc.detail_json
    FROM classroom_submission s
    JOIN classroom_score_record sc ON sc.submission_id = s.id
    WHERE s.session_id = ? AND s.participant_id = ?
  `),
  listSessionSubmissionsForDashboard: db.prepare(`
    SELECT s.lemma_id, s.assignment_id, s.participant_id, s.round_index, sc.score, sc.max_score, sc.correct
    FROM classroom_submission s
    JOIN classroom_score_record sc ON sc.submission_id = s.id
    WHERE s.session_id = ?
  `),
  // Dashboard-Hotpath: direkt auf das aktive Assignment gefiltert statt
  // JS-seitig — nutzt idx_classroom_submission_assignment (Migration 0009).
  listAssignmentSubmissionsForDashboard: db.prepare(`
    SELECT s.lemma_id, s.assignment_id, s.participant_id, s.round_index, sc.score, sc.max_score, sc.correct
    FROM classroom_submission s
    JOIN classroom_score_record sc ON sc.submission_id = s.id
    WHERE s.session_id = ? AND s.assignment_id = ?
  `),
  // W2-T4: ein einziger JOIN ueber ALLE Submissions+Scores einer Session
  // inkl. detail_json fuer die Distraktor-Auswertung. Bewusst KEIN
  // display_name / participant-Join — die Auswertung bleibt pseudonym (D7).
  listSessionResultRows: db.prepare(`
    SELECT s.assignment_id, s.lemma_id, s.participant_id, s.round_index,
           sc.score, sc.max_score, sc.correct, sc.detail_json
    FROM classroom_submission s
    JOIN classroom_score_record sc ON sc.submission_id = s.id
    WHERE s.session_id = ?
  `),

  // Capability Grants
  insertCapability: db.prepare(`
    INSERT INTO classroom_capability_grant (id, session_id, subject_kind, subject_id, capability, granted_at)
    VALUES (@id, @session_id, @subject_kind, @subject_id, @capability, @granted_at)
    ON CONFLICT(session_id, subject_kind, subject_id, capability) WHERE revoked_at IS NULL DO NOTHING
  `),
  revokeAllForSession: db.prepare(`
    UPDATE classroom_capability_grant
    SET revoked_at = @ts
    WHERE session_id = @session_id AND revoked_at IS NULL
  `),
  revokeAllForSubject: db.prepare(`
    UPDATE classroom_capability_grant
    SET revoked_at = @ts
    WHERE session_id = @session_id
      AND subject_kind = @subject_kind
      AND subject_id = @subject_id
      AND revoked_at IS NULL
  `),
  revokeByCapability: db.prepare(`
    UPDATE classroom_capability_grant
    SET revoked_at = @ts
    WHERE session_id = @session_id AND capability = @capability AND revoked_at IS NULL
  `),
  hasCapability: db.prepare(`
    SELECT 1 FROM classroom_capability_grant
    WHERE session_id = ? AND subject_kind = ? AND subject_id = ? AND capability = ?
      AND revoked_at IS NULL
    LIMIT 1
  `),
}

// ── Normalizer ──────────────────────────────────────────────────────
function normalizeSessionRow(row) {
  if (!row) return null
  // Abgeleiteter Status: pausedAt-Flag hat Vorrang, solange die Session
  // in der DB noch 'running' ist (siehe Migration 0007 — Pause ist kein
  // eigener DB-Status, um den CHECK-Rebuild zu vermeiden).
  const paused = row.status === 'running' && row.paused_at != null
  return {
    id: row.id,
    code: row.code,
    teacherUserId: row.teacher_user_id,
    title: row.title,
    status: paused ? 'paused' : row.status,
    paused,
    settings: parseJsonSafe(row.settings_json, {}, { sessionId: row.id }),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lockedAt: row.locked_at,
    pausedAt: row.paused_at ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    // W2-T2: 0-basierter Zeiger auf das aktuell aktive Assignment.
    currentAssignmentIndex: row.current_assignment_index ?? 0,
    // Liste aller Assignment-Modi in Reihenfolge (nur listTeacherSessions liefert
    // die Spalte). Für die Übersicht, die sonst nur den ersten Modus zeigte.
    ...(row.modes !== undefined
      ? { modes: row.modes ? String(row.modes).split(',').filter(Boolean) : [] }
      : {}),
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
const CODE_INSERT_MAX_ATTEMPTS = 5

export function createSession({ teacherUserId, title = null, settings = {} }) {
  if (!teacherUserId) return { error: 'TEACHER_REQUIRED' }
  const id = randomUUID()
  const settingsJson = JSON.stringify(settings || {})

  // generateUniqueJoinCode prueft per SELECT, ist aber gegen den Insert
  // nicht atomar (TOCTOU): zwei parallele createSession koennen denselben
  // freien Code ziehen, der zweite Insert scheitert dann am partial unique
  // index. Statt das Symptom zu ignorieren, regenerieren wir den Code und
  // versuchen es erneut — bounded, damit kein Endlos-Retry entsteht.
  for (let attempt = 0; attempt < CODE_INSERT_MAX_ATTEMPTS; attempt += 1) {
    const code = generateUniqueJoinCode()
    const tx = db.transaction(() => {
      stmts.insertSession.run({
        id,
        code,
        teacher_user_id: teacherUserId,
        title: title || null,
        settings_json: settingsJson,
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
      // Lese-/Socket-Recht: Voraussetzung fuer classroom-Socket-Namespace,
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
    try {
      tx()
      return { session: normalizeSessionRow(stmts.getSessionById.get(id)) }
    } catch (err) {
      // Nur Code-Kollision ist retrybar; alles andere weiterreichen.
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' && attempt < CODE_INSERT_MAX_ATTEMPTS - 1) {
        logger.warn({ attempt }, 'classroom join-code collision beim Insert — neuer Code, Retry')
        continue
      }
      throw err
    }
  }
  // Theoretisch unerreichbar (Schleife liefert oder wirft), defensiv:
  throw new Error('createSession: Join-Code konnte nicht eindeutig vergeben werden')
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
  logger.info({ sessionId, reason }, 'classroom session finished')
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

export function deleteSession({ sessionId, teacherUserId }) {
  const row = stmts.getSessionById.get(sessionId)
  if (!row) return { error: 'NOT_FOUND' }
  if (row.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  // ON DELETE CASCADE raeumt participants/submissions/scores/capabilities mit ab.
  stmts.deleteSession.run({ id: sessionId, teacher_user_id: teacherUserId })
  logger.info({ sessionId }, 'classroom session deleted')
  return { ok: true }
}

// W4 — „Mit neuer Klasse wiederholen": klont Titel + alle Assignment-Bloecke
// (Modus, Lemmata, eingefrorener content_snapshot) in eine frische Session im
// Status 'lobby' mit neuem Join-Code. Teilnehmer/Abgaben/Scores werden bewusst
// NICHT uebernommen — es ist eine neue Stunde. Funktioniert aus jedem Status
// (typisch: aus einer beendeten Session heraus).
export function duplicateSession({ sessionId, teacherUserId, title = null }) {
  const source = stmts.getSessionById.get(sessionId)
  if (!source) return { error: 'NOT_FOUND' }
  if (source.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }

  const assignments = listAssignments(sessionId)
  if (assignments.length === 0) return { error: 'NO_ASSIGNMENT' }

  const sourceNorm = normalizeSessionRow(source)
  const created = createSession({
    teacherUserId,
    title: title != null ? title : sourceNorm.title,
    settings: sourceNorm.settings || {},
  })
  if (created.error) return created

  // Snapshot 1:1 uebernehmen (kein Neuaufbau noetig — reproduziert den Content
  // exakt, auch wenn sich Korpusdaten seither geaendert haben).
  const blocks = assignments.map((a) => ({
    mode:            a.mode,
    lemmaIds:        a.lemmaIds,
    contentSnapshot: a.contentSnapshot,
  }))
  const added = addAssignments({ sessionId: created.session.id, teacherUserId, blocks })
  if (added.error) {
    // Rollback der frisch angelegten, noch leeren Session — kein Halbzustand.
    deleteSession({ sessionId: created.session.id, teacherUserId })
    return added
  }

  logger.info(
    { sourceId: sessionId, newId: created.session.id, blocks: blocks.length },
    'classroom session duplicated',
  )
  return { session: created.session }
}

export function pauseSession({ sessionId, teacherUserId }) {
  const row = stmts.getSessionById.get(sessionId)
  if (!row) return { error: 'NOT_FOUND' }
  if (row.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  // Nur eine laufende, nicht bereits pausierte Session ist pausierbar.
  if (row.status !== 'running' || row.paused_at != null) return { error: 'INVALID_STATE' }
  const result = stmts.pauseSession.run({ id: sessionId, ts: nowMs() })
  if (!result.changes) return { error: 'INVALID_STATE' }
  logger.info({ sessionId }, 'classroom session paused')
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

export function resumeSession({ sessionId, teacherUserId }) {
  const row = stmts.getSessionById.get(sessionId)
  if (!row) return { error: 'NOT_FOUND' }
  if (row.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (row.status !== 'running' || row.paused_at == null) return { error: 'INVALID_STATE' }
  const result = stmts.resumeSession.run({ id: sessionId, ts: nowMs() })
  if (!result.changes) return { error: 'INVALID_STATE' }
  logger.info({ sessionId }, 'classroom session resumed')
  return { session: normalizeSessionRow(stmts.getSessionById.get(sessionId)) }
}

// Aktivitaets-Heartbeat fuer Lehrer-Events (Dashboard-Abruf, Assignment-
// Aenderung etc.), damit aktives Unterrichten das Auto-End-Fenster (D8)
// verschiebt, auch wenn gerade keine Schueler-Submission kommt.
export function touchSessionActivity(sessionId) {
  if (!sessionId) return false
  const r = stmts.touchSessionActivity.run({ id: sessionId, ts: nowMs() })
  return r.changes > 0
}

// ── Auto-End nach Inaktivitaet (D8) ─────────────────────────────────
// Server-autoritativ und NEUSTART-FEST: gerechnet wird gegen den
// persistierten last_activity_at-Timestamp, NICHT gegen einen
// In-Memory-Timer. Ein setTimeout pro Session waere fragil (geht beim
// Neustart verloren, driftet). Stattdessen scannt der Job (jobs/
// classroomAutoEnd.js) periodisch die abgelaufenen Sessions.
// `now`/`maxIdleMs` sind injizierbar → in Tests deterministisch.
export function autoEndStaleSessions({ now = nowMs(), maxIdleMs = DEFAULT_AUTO_END_IDLE_MS } = {}) {
  const threshold = now - maxIdleMs
  const stale = stmts.listStaleRunningSessions.all({ threshold })
  const ended = []
  for (const row of stale) {
    const tx = db.transaction(() => {
      const updated = stmts.finishSession.run({ id: row.id, finished_at: now })
      if (!updated.changes) return false
      stmts.revokeByCapability.run({
        session_id: row.id,
        capability: 'submission:write',
        ts: now,
      })
      return true
    })
    if (tx()) {
      logger.info({ sessionId: row.id }, 'classroom session auto-ended (idle timeout)')
      ended.push(normalizeSessionRow(stmts.getSessionById.get(row.id)))
    }
  }
  return { ended }
}

// ── Retention / Aufraeumen (E1 / D9) ────────────────────────────────
// Zweistufig, server-autoritativ, neustart-fest (gerechnet gegen den
// persistierten finished_at — kein In-Memory-Timer). Der Job
// (jobs/classroomRetention.js) ruft dies periodisch. `now`/Fenster sind
// injizierbar → in Tests deterministisch.
//
// Reihenfolge im Sweep: erst anonymisieren (Stufe A), dann loeschen
// (Stufe B). Schon geloeschte Zeilen koennen nicht mehr anonymisiert
// werden — die Stufen ueberschneiden sich nicht (48 h < 30 Tage).
export function runClassroomRetention({
  now = nowMs(),
  anonymizeAfterMs = DEFAULT_NAME_ANONYMIZE_MS,
  hardDeleteAfterMs = DEFAULT_HARD_DELETE_MS,
  lobbyAbandonMs = DEFAULT_LOBBY_ABANDON_MS,
} = {}) {
  // Stufe A — display_name anonymisieren (idempotent via != Platzhalter).
  const anonResult = stmts.anonymizeStaleParticipants.run({
    placeholder: ANONYMIZED_DISPLAY_NAME,
    threshold: now - anonymizeAfterMs,
  })
  const anonymized = anonResult.changes

  // Pro Session eine atomare CASCADE-Loeschung; ein Fehler an einer Session
  // stoppt die uebrigen nicht. Stufe B (beendet + ueberfaellig) und Stufe C
  // (verwaiste Lobby) nutzen denselben Lösch-Helfer.
  const deleteSessions = (rows, label) => {
    let n = 0
    for (const row of rows) {
      try {
        const r = stmts.deleteSessionById.run(row.id)
        if (r.changes > 0) n += 1
      } catch (err) {
        logger.warn({ err, sessionId: row.id }, `classroom retention ${label} fehlgeschlagen`)
      }
    }
    return n
  }

  // Stufe B — beendete Sessions 30 Tage nach finished_at hart loeschen.
  const deleted = deleteSessions(
    stmts.listHardDeleteSessions.all({ threshold: now - hardDeleteAfterMs }),
    'hard-delete',
  )

  // Stufe C (W4-U2) — verwaiste Lobby-Sessions (nie gestartet) nach dem
  // Abandon-Fenster hart loeschen, damit sie nicht ewig Join-Codes belegen.
  const lobbyDeleted = deleteSessions(
    stmts.listAbandonedLobbySessions.all({ threshold: now - lobbyAbandonMs }),
    'lobby-cleanup',
  )

  if (anonymized > 0 || deleted > 0 || lobbyDeleted > 0) {
    logger.info({ anonymized, deleted, lobbyDeleted }, 'classroom retention sweep')
  }
  return { anonymized, deleted, lobbyDeleted }
}

// ── Assignments ─────────────────────────────────────────────────────
// Validierung eines einzelnen Modus-Blocks (Form-Pruefung, ohne DB).
function validateAssignmentBlock(block) {
  if (!block || typeof block !== 'object') return 'INVALID_MODE'
  if (!VALID_MODES.includes(block.mode)) return 'INVALID_MODE'
  if (!Array.isArray(block.lemmaIds) || block.lemmaIds.length < 1) return 'NO_LEMMATA'
  if (block.lemmaIds.length > MAX_LEMMATA_PER_ASSIGNMENT) return 'TOO_MANY_LEMMATA'
  return null
}

// W2-T2: Mehrere Modus-Bloecke in Reihenfolge anlegen (atomar).
// content_snapshot wird PRO Assignment beim Anlegen eingefroren (D-Entscheidung
// beibehalten) — der Aufrufer (Route) baut ihn aus den aktuellen Lemmata.
// position vergeben wir fortlaufend ab dem bestehenden Count, damit
// mehrfache Aufrufe (oder gemischtes addAssignment/addAssignments) eine
// luckenlose Ordnung 0,1,2,… ergeben.
export function addAssignments({ sessionId, teacherUserId, blocks }) {
  const session = stmts.getSessionById.get(sessionId)
  if (!session) return { error: 'NOT_FOUND' }
  if (session.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (session.status !== 'lobby') return { error: 'INVALID_STATE' }
  if (!Array.isArray(blocks) || blocks.length < 1) return { error: 'NO_ASSIGNMENT' }

  for (const block of blocks) {
    const err = validateAssignmentBlock(block)
    if (err) return { error: err }
  }

  const existing = stmts.countAssignments.get(sessionId)?.c || 0
  if (existing + blocks.length > MAX_ASSIGNMENTS_PER_SESSION) {
    return { error: 'TOO_MANY_ASSIGNMENTS' }
  }

  const ids = []
  const tx = db.transaction(() => {
    blocks.forEach((block, i) => {
      const id = randomUUID()
      stmts.insertAssignment.run({
        id,
        session_id: sessionId,
        mode: block.mode,
        lemma_ids: JSON.stringify(block.lemmaIds),
        content_snapshot: JSON.stringify(block.contentSnapshot || {}),
        position: existing + i,
        created_at: nowMs(),
      })
      ids.push(id)
    })
  })
  tx()
  return { assignments: ids.map((id) => normalizeAssignmentRow(stmts.getAssignmentById.get(id))) }
}

// Einzel-Variante (Bestand): delegiert an addAssignments und liefert das
// erste Assignment. Reihenfolge entsteht durch fortlaufende position.
export function addAssignment({ sessionId, teacherUserId, mode, lemmaIds, contentSnapshot }) {
  const result = addAssignments({
    sessionId,
    teacherUserId,
    blocks: [{ mode, lemmaIds, contentSnapshot }],
  })
  if (result.error) return result
  return { assignment: result.assignments[0] }
}

// Aktuell aktives Assignment einer Session (per current_assignment_index).
// Nutzt getAssignmentAtIndex statt listAssignmentsBySession.all() — spart
// das Laden aller Assignments (max 5) und filtert direkt per LIMIT 1 OFFSET.
export function getCurrentAssignment(sessionId) {
  const sessionRow = stmts.getSessionById.get(sessionId)
  if (!sessionRow) return null
  const idx = Math.max(0, sessionRow.current_assignment_index ?? 0)
  return normalizeAssignmentRow(stmts.getAssignmentAtIndex.get(sessionId, idx))
}

// W2-T2: Auf das naechste Assignment vorruecken. Server-autoritativ (D13).
//   - Nur durch den Besitzer, nur bei laufender, nicht pausierter Session.
//   - Aktuelles Assignment gilt mit dem Wechsel als abgeschlossen.
//   - Nach dem letzten Block wird die Session beendet (status 'finished'),
//     identisch zu finishSession (submission:write wird revoked).
// Rueckgabe bei Wechsel: { session, assignment, index, total }.
// Rueckgabe nach letztem Block: { session, done: true }.
export function nextAssignment({ sessionId, teacherUserId }) {
  const row = stmts.getSessionById.get(sessionId)
  if (!row) return { error: 'NOT_FOUND' }
  if (row.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (row.status !== 'running') return { error: 'INVALID_STATE' }
  // Im Pause-Zustand kein Wechsel — sonst saehen die Schueler waehrend des
  // Wartebilds einen neuen Modus aufploppen. Lehrer muss erst fortsetzen.
  if (row.paused_at != null) return { error: 'SESSION_PAUSED' }

  // Kleinkram-Refactor: nur COUNT + Einzelzugriff auf das naechste Assignment
  // (getAssignmentAtIndex, LIMIT 1 OFFSET) statt alle Assignments zu laden —
  // analog submitAnswer. Gleiche Ordnung (position ASC, created_at ASC).
  const total = stmts.countAssignments.get(sessionId)?.c || 0
  if (total === 0) return { error: 'NO_ASSIGNMENT' }

  const currentIndex = Math.min(Math.max(0, row.current_assignment_index ?? 0), total - 1)
  const nextIndex = currentIndex + 1

  // Letzter Block → Session beenden (gleiche Semantik wie finishSession).
  if (nextIndex >= total) {
    const finished = finishSession({ sessionId, teacherUserId, reason: 'completed' })
    if (finished.error) return finished
    return { session: finished.session, done: true }
  }

  const now = nowMs()
  const result = stmts.advanceAssignmentIndex.run({
    id: sessionId, from: currentIndex, to: nextIndex, ts: now,
  })
  if (!result.changes) return { error: 'INVALID_STATE' }

  return {
    session: normalizeSessionRow(stmts.getSessionById.get(sessionId)),
    assignment: normalizeAssignmentRow(stmts.getAssignmentAtIndex.get(sessionId, nextIndex)),
    index: nextIndex,
    total,
  }
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
    // Socket-Recht: View auf die laufende Session (classroom-Namespace, view:updated etc.).
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

// Lehrkraft entfernt einen Teilnehmer (z. B. Fake-Name/Beleidigung). Markiert
// left_at → der naechste /me/view oder Heartbeat des Schuelers bekommt 403 und
// fuehrt zurueck zum Beitritt (neuer Name moeglich). Nur Besitzer der Session.
export function kickParticipant({ sessionId, participantId, teacherUserId }) {
  const sessionRow = stmts.getSessionById.get(sessionId)
  if (!sessionRow) return { error: 'NOT_FOUND' }
  if (sessionRow.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  const r = stmts.kickParticipant.run({ id: participantId, session_id: sessionId, ts: nowMs() })
  if (r.changes === 0) return { error: 'NOT_FOUND' } // nicht in Session oder bereits weg
  return { ok: true, participantId }
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
  // Serverautoritativ (D13): waehrend einer Pause werden keine
  // Submissions angenommen — paused_at ist gesetzt, DB-Status ist 'running'.
  if (session.paused_at != null) return { error: 'SESSION_PAUSED' }

  const assignmentRow = stmts.getAssignmentById.get(assignmentId)
  if (!assignmentRow || assignmentRow.session_id !== sessionId) return { error: 'NOT_FOUND' }

  // W2-T2: Submissions werden IMMER nur dem aktuell aktiven Assignment
  // zugeordnet. Ein bereits abgeschlossener (oder noch nicht erreichter)
  // Modus-Block nimmt keine Abgaben mehr an — server-autoritativ (D13).
  // Optimierung: getAssignmentAtIndex statt listAssignmentsBySession.all()
  // reduziert den Submit-Hotpath um O(N)-Lesen auf O(1)-Lesen (LIMIT 1 OFFSET).
  const activeIndex = Math.max(0, session.current_assignment_index ?? 0)
  const activeAssignment = normalizeAssignmentRow(stmts.getAssignmentAtIndex.get(sessionId, activeIndex))
  if (!activeAssignment || activeAssignment.id !== assignmentId) {
    return { error: 'ASSIGNMENT_NOT_ACTIVE' }
  }

  // Capability-Check als zweites Sicherheitsnetz; Route hat bereits
  // requireCapability('submission:write') durchgelaufen.
  const hasCap = stmts.hasCapability.get(sessionId, 'participant', participantId, 'submission:write')
  if (!hasCap) return { error: 'FORBIDDEN' }

  const rawAnswerJson = JSON.stringify(rawAnswer ?? {})
  // byte-genau (mehrbyte-UTF-8 wird sonst unterschätzt) — vor dem Scoring.
  if (Buffer.byteLength(rawAnswerJson, 'utf8') > MAX_RAW_ANSWER_BYTES) return { error: 'PAYLOAD_TOO_LARGE' }

  const assignment = normalizeAssignmentRow(assignmentRow)
  // content_snapshot wird IMMER als { byLemma: { [lemmaId]: {...} } } gebaut
  // (buildContentSnapshot). Das lemma-spezifische Snapshot liegt also unter
  // byLemma[lemmaId]; fehlt es, scort der Modus auf einem leeren Objekt
  // (0 Punkte) statt auf der falschen { byLemma }-Huelle. Der frueher hier
  // stehende „?? contentSnapshot"-Fallback war tot/irrefuehrend (P3): er haette
  // dem Scoring die gesamte byLemma-Huelle als Single-Lemma-Snapshot
  // untergeschoben — es gibt keinen Pfad, der je ein Single-Lemma-Snapshot ablegt.
  const lemmaSnapshot = assignment.contentSnapshot?.byLemma?.[lemmaId] ?? {}

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
    const info = stmts.insertSubmission.run({
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
    // changes === 1 → neu eingefuegt (kein Konflikt); changes === 0 → die
    // Submission existierte bereits (Retry/Race). Bei Konflikt lesen wir die
    // bestehende Submission, um auf deren Score-Record zu springen, damit der
    // Client bei Retry denselben Score ohne Doppelzaehlung bekommt.
    const inserted = info.changes === 1
    const existing = inserted ? null : stmts.getSubmissionByKey.get(participantId, assignmentId, lemmaId, roundIndex)
    if (!inserted && !existing) return { race: true }
    const finalSubmissionId = inserted ? submissionId : existing.id
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
    // Aktivitaet registrieren — verschiebt das Auto-End-Fenster (D8).
    // Bewusst INNERHALB der Transaktion: liefe es danach als separater
    // Write, koennte eine gewertete Submission bei SQLITE_BUSY das Fenster
    // nicht verschieben und die Session mitten im Spielen idle-timeouten.
    stmts.touchSessionActivity.run({ id: sessionId, ts: submittedAt })
    return { submissionId: finalSubmissionId, inserted }
  })

  const result = tx()
  if (result.race) return { error: 'IDEMPOTENCY_RACE' }

  // Normalfall (neu eingefuegt): unser scoreResult IST der gerade gespeicherte
  // Score — ein Zuruecklesen waere redundant. Nur bei Idempotenz-Konflikt kann
  // ein bereits vorhandener (evtl. abweichender) Score gelten → dann lesen.
  if (result.inserted) {
    return {
      submissionId: result.submissionId,
      score: scoreResult.score,
      maxScore: scoreResult.maxScore,
      correct: scoreResult.correct,
    }
  }
  const existingScore = stmts.getScoreBySubmission.get(result.submissionId)
  return {
    submissionId: result.submissionId,
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

  // Aktuelles Assignment + Reihenfolge-Metadaten (W2-T2).
  const orderedAssignments = stmts.listAssignmentsBySession.all(sessionId).map(normalizeAssignmentRow)
  const assignmentTotal = orderedAssignments.length
  const assignmentIndex = assignmentTotal > 0
    ? Math.min(Math.max(0, session.currentAssignmentIndex), assignmentTotal - 1)
    : 0
  const currentAssignment = orderedAssignments[assignmentIndex] || null

  // Query 3: Submissions + Scores zusammen (single JOIN, kein N+1).
  // Die Trefferquote bezieht sich auf das AKTUELL aktive Assignment — direkt
  // im WHERE gefiltert (Index 0009) statt alle Session-Zeilen zu laden und
  // JS-seitig 4/5 davon wegzuwerfen (Review 2026-06-10).
  const submissionRows = currentAssignment
    ? stmts.listAssignmentSubmissionsForDashboard.all(sessionId, currentAssignment.id)
    : stmts.listSessionSubmissionsForDashboard.all(sessionId)
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

  // W4-S4 (3.3): Runden-Fortschritt pro Teilnehmer im AKTUELLEN Assignment.
  // Ein Lemma gilt als "fertig", wenn alle seine Runden eingereicht sind —
  // exakt wie buildStudentView (Lueckenfueller hat mehrere Runden pro Lemma,
  // sonst eine). So unterscheidet die Live-Ansicht "spielt noch" von "fertig".
  const lemmaIdsCur = currentAssignment?.lemmaIds || []
  const lemmataTotal = lemmaIdsCur.length
  const roundsByPart = new Map() // participantId → Map(lemmaId → Set(roundIndex))
  for (const row of submissionRows) {
    const pid = String(row.participant_id)
    if (!roundsByPart.has(pid)) roundsByPart.set(pid, new Map())
    const byLemma = roundsByPart.get(pid)
    const lid = String(row.lemma_id)
    if (!byLemma.has(lid)) byLemma.set(lid, new Set())
    byLemma.get(lid).add(Number(row.round_index) || 0)
  }
  const totalRoundsFor = (lemmaId) => {
    if (currentAssignment?.mode !== 'lueckenfueller') return 1
    const snap = currentAssignment?.contentSnapshot?.byLemma?.[lemmaId]
    return Array.isArray(snap?.rounds) ? snap.rounds.length : 1
  }
  const doneLemmataFor = (participantId) => {
    const byLemma = roundsByPart.get(String(participantId))
    if (!byLemma) return 0
    let done = 0
    for (const lid of lemmaIdsCur) {
      if ((byLemma.get(String(lid))?.size || 0) >= totalRoundsFor(lid)) done += 1
    }
    return done
  }
  for (const p of participants) {
    p.submittedLemmata = doneLemmataFor(p.id)
    p.done = lemmataTotal > 0 && p.submittedLemmata >= lemmataTotal
  }

  return {
    session,
    assignment: currentAssignment,
    // W2-T2: Reihenfolge-Metadaten fuer "Modus X von N" in der Live-Ansicht.
    assignmentIndex,
    assignmentTotal,
    // W4-S4 (3.3): Lemma-Anzahl des aktuellen Blocks = Runden pro Teilnehmer.
    lemmataPerAssignment: lemmataTotal,
    participants,
    aggregate: {
      totalParticipants: participants.length,
      connectedCount: participants.filter((p) => p.connected).length,
      submittedTotal: submissionRows.length,
      // Teilnehmer, die ALLE Runden des aktuellen Blocks abgegeben haben.
      doneCount: participants.filter((p) => p.done).length,
      perLemma: perLemmaArr,
    },
  }
}

// ── Post-Session-Auswertung (W2-T4) ─────────────────────────
// Die reine Auswertungs-/Reporting-Logik (extract*/buildDistribution/
// pickTopDistractor/buildRevealItems/zwPeriodLabel/roundTypeLabel/lemmaLogDice)
// liegt jetzt in ./results/index.js (Code-Review P1). store.js behaelt nur
// Datenzugriff + Orchestrierung.

// Aggregierte, PSEUDONYMISIERTE Auswertung nach Session-Ende.
// Bewusst KEINE Teilnehmer-Identitaet im Ergebnis (kein display_name, keine
// participant-Zeilen) — D7 gilt auch nach Session-Ende.
//
// Effizienz: genau zwei Reads (Assignments + ein JOIN ueber alle
// Submissions/Scores), danach EIN JS-Pass. Datenmengen sind hart begrenzt
// (<=50 Teilnehmer, <=5 Bloecke, <=3 Lemmata, wenige Runden) → kein N+1,
// kein Recompute pro Teilnehmer im Hotpath.
//
// Entscheidung: nur fuer beendete Sessions ('finished'/'aborted'). Begruendung:
// Live-Aggregate liefert getDashboard; die Ergebnisansicht ist explizit die
// Nachbereitung und braucht einen stabilen, vollstaendigen Endstand.
export function getSessionResults({ sessionId, teacherUserId }) {
  const sessionRow = stmts.getSessionById.get(sessionId)
  if (!sessionRow) return { error: 'NOT_FOUND' }
  if (sessionRow.teacher_user_id !== teacherUserId) return { error: 'FORBIDDEN' }
  if (sessionRow.status !== 'finished' && sessionRow.status !== 'aborted') {
    return { error: 'SESSION_NOT_ENDED' }
  }
  const session = normalizeSessionRow(sessionRow)

  const assignments = stmts.listAssignmentsBySession.all(sessionId).map(normalizeAssignmentRow)
  const modeByAssignment = new Map(assignments.map((a) => [a.id, a.mode]))
  const rows = stmts.listSessionResultRows.all(sessionId)

  // Aggregat je (assignmentId :: lemmaId) in einem Durchlauf.
  const byKey = new Map()
  const participantsAll = new Set()
  for (const row of rows) {
    participantsAll.add(row.participant_id)
    const key = `${row.assignment_id}::${String(row.lemma_id)}`
    let agg = byKey.get(key)
    if (!agg) {
      agg = {
        submissions: 0,
        scoreSum: 0,
        maxSum: 0,
        correctSum: 0,
        participants: new Set(),
        distractors: new Map(),
        picks: new Map(),
        items: new Map(),
      }
      byKey.set(key, agg)
    }
    agg.submissions += 1
    agg.scoreSum += Number(row.score) || 0
    agg.maxSum += Number(row.max_score) || 0
    agg.correctSum += Number(row.correct) || 0
    agg.participants.add(row.participant_id)
    const rowMode = modeByAssignment.get(row.assignment_id)
    for (const label of extractDistractors(rowMode, row)) {
      agg.distractors.set(label, (agg.distractors.get(label) || 0) + 1)
    }
    for (const word of extractPicks(rowMode, row)) {
      agg.picks.set(word, (agg.picks.get(word) || 0) + 1)
    }
    for (const { key: itemKey, isCorrect } of extractItems(rowMode, row)) {
      const it = agg.items.get(itemKey) || { answered: 0, correct: 0 }
      it.answered += 1
      if (isCorrect) it.correct += 1
      agg.items.set(itemKey, it)
    }
  }

  // Karten in inhaltlicher Reihenfolge: Assignment-Position, dann Lemma-Folge.
  // Lemmata ohne jede Abgabe werden uebersprungen (keine aussagekraeftige Quote).
  const byLemma = []
  for (const a of assignments) {
    for (const lemmaId of a.lemmaIds) {
      const agg = byKey.get(`${a.id}::${String(lemmaId)}`)
      if (!agg) continue
      const hitRatePct = agg.maxSum > 0 ? Math.round((agg.scoreSum / agg.maxSum) * 100) : 0
      const avgScore = agg.submissions > 0
        ? Math.round((agg.scoreSum / agg.submissions) * 10) / 10
        : 0
      const maxScore = agg.submissions > 0 ? Math.round(agg.maxSum / agg.submissions) : 0
      const lemmaSnapshot = a.contentSnapshot?.byLemma?.[lemmaId] ?? a.contentSnapshot
      const distribution = buildDistribution(a.mode, lemmaSnapshot, agg, agg.participants.size)
      byLemma.push({
        assignmentId: a.id,
        mode: a.mode,
        position: a.position,
        lemmaId: String(lemmaId),
        lemma: lemmaSnapshot?.lemma || String(lemmaId),
        participants: agg.participants.size,
        submissions: agg.submissions,
        hitRatePct,
        avgScore,
        maxScore,
        topDistractor: pickTopDistractor(agg.distractors),
        distribution,
      })
    }
  }

  return {
    session: {
      id: session.id,
      status: session.status,
      title: session.title,
      finishedAt: session.finishedAt,
    },
    totals: {
      participants: participantsAll.size,
      submissions: rows.length,
    },
    hasSubmissions: rows.length > 0,
    byLemma,
  }
}

// ── Schritt 4 (C1): Schueler-Aufloesung, item-genau ────────────────────
// Liefert AUSSCHLIESSLICH die EIGENE Abgabe + Korrektheit + Loesung eines
// Teilnehmers, und das NUR nach Freigabe (Session finished/aborted). Vor der
// Freigabe wird { revealed: false } ohne jede Loesung zurueckgegeben (R1).
// Pseudonymitaet (D7) bleibt unberuehrt: nur die eigenen Daten, keine anderen
// Teilnehmer.
//
// Hinweis (Code-Review H1): Die Eigen-Aufloesung bleibt bewusst auch nach der
// Namens-Anonymisierung (Stufe A, ~48 h) bis zum Hard-Delete verfuegbar — die
// Loesungswoerter sind nicht personenbezogen, nur der Name ist es.
export function getParticipantReveal({ sessionId, participantId }) {
  const sessionRow = stmts.getSessionById.get(sessionId)
  if (!sessionRow) return { error: 'NOT_FOUND' }
  const session = normalizeSessionRow(sessionRow)
  // R1-Gate: vor der Freigabe NIEMALS Loesungsdaten ausliefern.
  if (session.status !== 'finished' && session.status !== 'aborted') {
    return { revealed: false, byKey: {} }
  }

  const assignments = stmts.listAssignmentsBySession.all(sessionId).map(normalizeAssignmentRow)
  const byAssignment = new Map(assignments.map((a) => [a.id, a]))
  const rows = stmts.listParticipantResultRows.all(sessionId, participantId)

  const byKey = {}
  for (const row of rows) {
    const a = byAssignment.get(row.assignment_id)
    if (!a) continue
    const lemmaId = String(row.lemma_id)
    const snapshot = a.contentSnapshot?.byLemma?.[lemmaId] ?? a.contentSnapshot
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    const { items, solution } = buildRevealItems(a.mode, detail, snapshot)
    byKey[`${lemmaId}:${Number(row.round_index) || 0}`] = {
      lemmaId,
      roundIndex: Number(row.round_index) || 0,
      mode: a.mode,
      score: Number(row.score) || 0,
      maxScore: Number(row.max_score) || 0,
      items,
      solution,
    }
  }

  return { revealed: true, byKey }
}

// ── Test-Helper (nur fuer Tests verwenden) ──────────────────────────
export const __test = {
  hashToken,
  stmts,
}
