/**
 * server/routes/classroom-v2.js
 *
 * API-Layer fuer Classroom v2 (T-2.1 bis T-2.10).
 * Alle Pfade unter /api/v1/classroom/ — dieser Router wird in server/index.js
 * VOR dem alten classroomRouter gemountet, sodass v2-Routen Vorrang haben.
 *
 * Auth-Modi (D14):
 *   Teacher   – better-auth-Session (cookie) + premium-Rolle + classroom_v2-Flag
 *   Participant – Bearer auth_token (HMAC-Hash in cr2_participant)
 *   Public    – nur POST /join (rate-limited)
 *
 * Sicherheits-Invarianten:
 *   R1 – /me/view liefert ausschliesslich Felder aus der WHITELIST (s. buildStudentView)
 *   R6 – /me/submit nimmt KEIN score-Feld an (D13); Zod-Schema hat es nicht
 *   Socket-Broadcasts (T-3.x): TODO-Kommentare markieren Einstiegspunkte
 */

import express from 'express'
import db from '../db.js'
import logger from '../logger.js'
import { requirePremium } from '../middleware/userAuth.js'
import { requireCapability } from '../middleware/requireCapability.js'
import { findParticipantByToken } from '../classroom-v2/store.js'
import {
  validate,
  cr2CreateSessionSchema,
  cr2CreateAssignmentSchema,
  cr2LemmataQuerySchema,
  cr2StartSessionSchema,
  cr2FinishSessionSchema,
  cr2JoinSchema,
  cr2SubmitSchema,
  cr2ListSessionsQuerySchema,
} from '../middleware/validate.js'
import {
  createSession,
  addAssignment,
  removeAssignment,
  listAssignments,
  getSessionById,
  listTeacherSessions,
  startSession,
  finishSession,
  joinByCode,
  heartbeatParticipant,
  leaveParticipant,
  submitAnswer,
  getDashboard,
} from '../classroom-v2/store.js'
import {
  classroomJoinLimiter,
  classroomHeartbeatLimiter,
  classroomWriteLimiter,
} from '../middleware/rateLimiter.js'

const router = express.Router()

// ── Feature-Flag-Check ───────────────────────────────────────────
// Prüft classroom_v2_enabled in user_entitlements.
// Admins (role=admin) passieren ohne Flag-Prüfung.
const classroomV2EnabledStmt = db.prepare(`
  SELECT classroom_v2_enabled FROM user_entitlements WHERE user_id = ?
`)

function requireClassroomV2(req, res, next) {
  // req.user ist von requirePremium gesetzt
  if (!req.user?.id) return res.status(401).json({ error: 'Nicht autorisiert' })
  if (req.user.role === 'admin') return next()
  const row = classroomV2EnabledStmt.get(req.user.id)
  if (!row?.classroom_v2_enabled) {
    return res.status(403).json({ error: 'Classroom v2 ist für diesen Account nicht aktiviert' })
  }
  return next()
}

// ── Participant-Auth aus Bearer-Token ───────────────────────────
// Für /me/*-Routen die keine spezifische Capability prüfen (view, heartbeat, leave).
function requireParticipantAuth(req, res, next) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'Bearer-Token erforderlich' })
  }
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = m ? m[1].trim() : null
  if (!token) return res.status(401).json({ error: 'Ungültiger Authorization-Header' })

  const participant = findParticipantByToken(token)
  if (!participant) return res.status(401).json({ error: 'Ungültiger oder abgelaufener Token' })
  if (participant.leftAt) return res.status(403).json({ error: 'Du hast die Session verlassen' })

  req.cr2 = { participant, sessionId: participant.sessionId }
  return next()
}

// ── Fehler-Mapping ───────────────────────────────────────────────
function mapError(errCode) {
  switch (errCode) {
    case 'NOT_FOUND':          return { status: 404, message: 'Nicht gefunden' }
    case 'FORBIDDEN':          return { status: 403, message: 'Keine Berechtigung' }
    case 'INVALID_STATE':      return { status: 409, message: 'Ungültiger Session-Zustand' }
    case 'INVALID_CODE':       return { status: 404, message: 'Code ungültig oder Session nicht aktiv' }
    case 'LATE_JOIN_DISABLED': return { status: 409, message: 'Spaetbeitritt deaktiviert' }
    case 'SESSION_FULL':       return { status: 409, message: 'Session voll (max. 50 Teilnehmende)' }
    case 'NO_ASSIGNMENT':      return { status: 409, message: 'Session hat kein Assignment – erst hinzufügen' }
    case 'ASSIGNMENT_EXISTS':  return { status: 409, message: 'Assignment bereits vorhanden (D2: max. 1 pro Session)' }
    case 'TOO_MANY_LEMMATA':   return { status: 400, message: 'Maximal 3 Lemmata pro Assignment (D3)' }
    case 'NO_LEMMATA':         return { status: 400, message: 'Mindestens 1 Lemma erforderlich' }
    case 'INVALID_MODE':       return { status: 400, message: 'Ungültiger Modus' }
    case 'PAYLOAD_TOO_LARGE':  return { status: 413, message: 'rawAnswer zu groß (max. 4 KiB)' }
    case 'SCORING_FAILED':     return { status: 422, message: 'Scoring fehlgeschlagen – ggf. Content-Snapshot prüfen' }
    case 'IDEMPOTENCY_RACE':   return { status: 409, message: 'Submission-Konflikt – bitte wiederholen' }
    default:                   return { status: 500, message: 'Interner Serverfehler' }
  }
}

// ── Lemmata-Lookup (für T-2.2 und T-2.3) ───────────────────────
const getLemmataByIdsStmt = db.prepare(`
  SELECT id, lemma, pos, ipa, definition, definitionen, runden, lueckenfueller
  FROM lemmata
  WHERE id IN (SELECT value FROM json_each(?))
`)

function parseLemmaJson(row) {
  function safe(v, fb) {
    if (!v) return fb
    try { return JSON.parse(v) } catch { return fb }
  }
  return {
    id:            row.id,
    lemma:         row.lemma,
    pos:           row.pos,
    ipa:           row.ipa || '',
    definition:    row.definition || '',
    definitionen:  safe(row.definitionen, []),
    runden:        safe(row.runden, {}),
    lueckenfueller: safe(row.lueckenfueller, null),
  }
}

/**
 * Baut den content_snapshot fuer ein Assignment.
 * Der Snapshot wird beim Anlegen eingefroren (D4) und fuer Scoring verwendet.
 * Struktur: { byLemma: { [lemmaId]: { ...modusspezifische Daten... } } }
 *
 * Wichtig (R1/T-6.4): Der Snapshot enthaelt answer-relevante Daten (rang,
 * periode, zuordnung, kollokator) – diese werden NIEMALS direkt an Schueler
 * gesendet! buildStudentView() filtert sie strikt heraus.
 */
function buildContentSnapshot(mode, lemmata) {
  const byLemma = {}
  for (const l of lemmata) {
    const r = l.runden || {}
    switch (mode) {
      case 'kollokationen': {
        // Kollokatoren koennen direkt oder unter runden.kollokatoren liegen
        const kollokatoren =
          r.kollokatoren ||
          r.kollokationen?.kollokatoren ||
          []
        byLemma[l.id] = {
          lemma:       l.lemma,
          ipa:         l.ipa,
          definition:  l.definition,
          kollokatoren,
        }
        break
      }
      case 'wortzwilling': {
        const wz = r.wortzwilling || r
        byLemma[l.id] = {
          lemma:       l.lemma,
          ipa:         l.ipa,
          wortA:       wz.wortA || l.lemma,
          wortB:       wz.wortB || '',
          kollokatoren: wz.kollokatoren || [],
        }
        break
      }
      case 'zeitenwende': {
        const zw = r.zeitenwende || r
        byLemma[l.id] = {
          lemma:  l.lemma,
          ipa:    l.ipa,
          words:  zw.words || [],
        }
        break
      }
      case 'lueckenfueller': {
        byLemma[l.id] = {
          lemma:  l.lemma,
          ipa:    l.ipa,
          rounds: l.lueckenfueller?.rounds || [],
        }
        break
      }
      default:
        break
    }
  }
  return { byLemma }
}

// ── Whitelist-Serialisierung fuer Schueler-View (T-2.6 / T-6.4) ─
//
// INVARIANTE (R1): Diese Funktion gibt ausschliesslich Felder zurueck,
// die Schueler sehen duerfen. Felder, die NIEMALS exponiert werden:
//   - notiz / link (interne Redaktionsnotizen)
//   - rang (verrät Ranking in Kollokationen → Antwort)
//   - periode (verrät Loesung in Zeitenwende → Antwort)
//   - zuordnung (verrät Zone in Wort-Zwilling → Antwort)
//   - kollokator (verrät Antwort in Lueckenfueller)
//   - detail_json, raw_answer, content_snapshot anderer Lemmata
//
// Aenderungen hier muessen den Audit-Test T-6.4 bestehen:
//   server/__tests__/classroom-v2.routes.test.js → 'view whitelist'

function buildSafePrompt(mode, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return {}
  switch (mode) {
    case 'kollokationen':
      return {
        // WHITELIST: nur Wort-Strings, KEIN rang (wuerde Ranking verraten)
        words:      (snapshot.kollokatoren || []).map(k => String(k.wort || '')).filter(Boolean),
        definition: snapshot.definition || '',
      }
    case 'wortzwilling':
      return {
        // WHITELIST: wortA, wortB, Wort-Strings, KEINE zuordnung
        wortA: snapshot.wortA || '',
        wortB: snapshot.wortB || '',
        words: (snapshot.kollokatoren || []).map(k => String(k.wort || '')).filter(Boolean),
      }
    case 'zeitenwende':
      return {
        // WHITELIST: nur Wort-Strings, KEINE periode
        words: (snapshot.words || []).map(w => String(w.wort || '')).filter(Boolean),
      }
    case 'lueckenfueller':
      return {
        // WHITELIST: pro Runde nur das, was zum Loesen noetig ist
        rounds: (snapshot.rounds || []).map(buildSafeRound),
      }
    default:
      return {}
  }
}

function buildSafeRound(round) {
  if (!round || typeof round !== 'object') return null
  const base = { type: round.type, sentence: round.sentence || round.text || '' }
  if (round.type === 'choice') {
    // WHITELIST: options (alle Auswahlmoeglichkeiten inkl. korrekte), KEIN kollokator-Label
    return { ...base, options: Array.isArray(round.options) ? round.options : [] }
  }
  if (round.type === 'double') {
    return {
      ...base,
      // WHITELIST: nur text der Saetze, KEIN kollokator
      sentences: (round.sentences || []).map(s => ({ text: s.text || s.sentence || '' })),
    }
  }
  // 'free': Schueler tippt, kein Hinweis noetig → nur Satz
  return base
}

// Submissions fuer einen Teilnehmer laden (fuer Fortschrittsberechnung)
const getParticipantSubmissionsStmt = db.prepare(`
  SELECT DISTINCT lemma_id, round_index
  FROM cr2_submission
  WHERE participant_id = ? AND assignment_id = ?
  ORDER BY lemma_id, round_index
`)

const getRoundsCountFromSnapshot = (snapshot) =>
  Array.isArray(snapshot?.rounds) ? snapshot.rounds.length : 1

function buildStudentView(participant, session, assignment) {
  const lemmaIds = assignment.lemmaIds || []
  const rows = getParticipantSubmissionsStmt.all(participant.id, assignment.id)

  // Welche Lemmata haben mindestens eine Submission?
  const submittedLemmaIdSet = new Set(rows.map(r => r.lemma_id))

  // Fuer Lueckenfueller: zaehle Runden pro Lemma
  const roundsPerLemma = {}
  for (const r of rows) {
    if (!roundsPerLemma[r.lemma_id]) roundsPerLemma[r.lemma_id] = new Set()
    roundsPerLemma[r.lemma_id].add(r.round_index)
  }

  // Fortschritt: Lemmata, bei denen alle Runden eingereicht sind
  const doneLemmaIds = new Set()
  for (const lemmaId of submittedLemmaIdSet) {
    const snap = assignment.contentSnapshot?.byLemma?.[lemmaId]
    const totalRounds = assignment.mode === 'lueckenfueller'
      ? getRoundsCountFromSnapshot(snap)
      : 1
    if ((roundsPerLemma[lemmaId]?.size || 0) >= totalRounds) {
      doneLemmaIds.add(lemmaId)
    }
  }

  // Aktuelles Lemma = erstes in der Liste, das noch nicht fertig ist
  const currentLemmaId = lemmaIds.find(id => !doneLemmaIds.has(id)) || null
  const allDone = doneLemmaIds.size >= lemmaIds.length

  // Lemmata aus DB laden (nur das aktuelle, um Leaks anderer Lemmata zu verhindern)
  // R1: Wir laden NUR das aktuelle Lemma, nie alle auf einmal ans Frontend
  let currentLemmaData = null
  if (currentLemmaId && !allDone) {
    const rows2 = getLemmataByIdsStmt.all(JSON.stringify([currentLemmaId]))
    const lemmaRow = rows2.find(r => r.id === currentLemmaId)
    if (lemmaRow) {
      const lemma = parseLemmaJson(lemmaRow)
      const snap = assignment.contentSnapshot?.byLemma?.[currentLemmaId] ?? {}

      // Aktueller Runden-Index fuer Lueckenfueller
      const submittedRounds = roundsPerLemma[currentLemmaId] || new Set()
      const currentRoundIndex = submittedRounds.size

      // Prompt ist mode-spezifisch und gewhitelistet
      const safePrompt = buildSafePrompt(assignment.mode, snap)
      // Fuer Lueckenfueller: nur die aktuelle Runde zeigen
      if (assignment.mode === 'lueckenfueller' && Array.isArray(safePrompt.rounds)) {
        safePrompt.currentRound = safePrompt.rounds[currentRoundIndex] || null
        safePrompt.roundIndex   = currentRoundIndex
        delete safePrompt.rounds  // alle Runden verschweigen, nur aktuelle
      }

      currentLemmaData = {
        // WHITELIST (R1): nur diese Felder sind fuer Schueler bestimmt
        id:     lemma.id,
        lemma:  lemma.lemma,
        ipa:    lemma.ipa,
        prompt: safePrompt,
        // definition nur aus oeffentlichem Feld, KEIN notiz
        definition: lemma.definition || (lemma.definitionen[0] ?? ''),
      }
    }
  }

  return {
    sessionId:     session.id,
    sessionStatus: session.status,
    assignment: {
      id:         assignment.id,
      mode:       assignment.mode,
      lemmaCount: lemmaIds.length,
    },
    currentLemma: currentLemmaData,
    progress: {
      submittedCount: doneLemmaIds.size,
      totalLemmata:   lemmaIds.length,
      done:           allDone,
    },
  }
}

// ════════════════════════════════════════════════════════════════
// LEHRER-ENDPUNKTE
// ════════════════════════════════════════════════════════════════

// ── T-2.1 POST /api/v1/classroom/sessions ───────────────────────
// Lehrer legt neue Session im Status 'lobby' an.
router.post(
  '/api/v1/classroom/sessions',
  classroomWriteLimiter,
  requirePremium,
  requireClassroomV2,
  validate(cr2CreateSessionSchema),
  (req, res) => {
    try {
      const { title, settings } = req.body
      const result = createSession({
        teacherUserId: req.user.id,
        title: title || null,
        settings: settings || {},
      })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }
      logger.info({ sessionId: result.session.id, teacherId: req.user.id }, 'cr2 session created')
      // TODO (T-3.x): keine Broadcast nötig beim Anlegen
      return res.status(201).json({
        id:     result.session.id,
        code:   result.session.code,
        status: result.session.status,
        title:  result.session.title,
      })
    } catch (err) {
      logger.error({ err }, 'cr2 createSession crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.3 GET /api/v1/classroom/lemmata ────────────────────────
// Picker-Endpoint fuer die Teacher-UI (Suche + Filter).
// Nur oeffentliche Felder — KEIN notiz, runden, rundenInfo.
const lemmataSearchStmt = db.prepare(`
  SELECT id, lemma, pos, ipa, definition, definitionen
  FROM lemmata
  WHERE
    (:q IS NULL OR lemma LIKE :q OR definition LIKE :q)
    AND (:pos IS NULL OR pos = :pos)
  ORDER BY lemma
  LIMIT :limit
`)

const lemmataCountStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM lemmata
  WHERE
    (:q IS NULL OR lemma LIKE :q OR definition LIKE :q)
    AND (:pos IS NULL OR pos = :pos)
`)

router.get(
  '/api/v1/classroom/lemmata',
  requirePremium,
  requireClassroomV2,
  validate(cr2LemmataQuerySchema, 'query'),
  (req, res) => {
    try {
      const { q, pos, limit } = req.query
      const qParam = q ? `%${q}%` : null
      const posParam = pos || null

      const rows = lemmataSearchStmt.all({ q: qParam, pos: posParam, limit })
      const { total } = lemmataCountStmt.get({ q: qParam, pos: posParam })

      function safe(v, fb) { try { return v ? JSON.parse(v) : fb } catch { return fb } }

      const items = rows.map(r => ({
        id:         r.id,
        lemma:      r.lemma,
        pos:        r.pos,
        ipa:        r.ipa || '',
        // Erste Definition aus definitionen-Array oder Fallback auf definition
        definition: (() => {
          const arr = safe(r.definitionen, [])
          return arr[0] || r.definition || ''
        })(),
      }))

      return res.json({ items, total: Number(total) })
    } catch (err) {
      logger.error({ err }, 'cr2 lemmata search crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.10 GET /api/v1/classroom/sessions ───────────────────────
// Liste eigener Sessions des Lehrers.
router.get(
  '/api/v1/classroom/sessions',
  requirePremium,
  requireClassroomV2,
  validate(cr2ListSessionsQuerySchema, 'query'),
  (req, res) => {
    try {
      const { limit } = req.query
      const sessions = listTeacherSessions({ teacherUserId: req.user.id, limit })
      return res.json({ sessions })
    } catch (err) {
      logger.error({ err }, 'cr2 listSessions crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.2 POST /api/v1/classroom/sessions/:id/assignments ───────
// Modus + Lemmata festlegen, content_snapshot einfrieren.
// Nur bei status='lobby' (store erzwingt das).
router.post(
  '/api/v1/classroom/sessions/:id/assignments',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(cr2CreateAssignmentSchema),
  (req, res) => {
    try {
      const { mode, lemmaIds } = req.body
      const sessionId   = req.params.id
      const teacherUserId = req.cr2.subject.id

      // Lemmata aus DB laden, um Snapshot einzufrieren
      const lemmaRows = getLemmataByIdsStmt.all(JSON.stringify(lemmaIds))
      const lemmata   = lemmaRows.map(parseLemmaJson)

      // Alle angeforderten IDs muessen existieren
      const foundIds = new Set(lemmata.map(l => l.id))
      const missing  = lemmaIds.filter(id => !foundIds.has(id))
      if (missing.length > 0) {
        return res.status(404).json({ error: `Lemmata nicht gefunden: ${missing.join(', ')}` })
      }

      // Reihenfolge aus Request erhalten
      const orderedLemmata = lemmaIds.map(id => lemmata.find(l => l.id === id))
      const contentSnapshot = buildContentSnapshot(mode, orderedLemmata)

      const result = addAssignment({
        sessionId,
        teacherUserId,
        mode,
        lemmaIds,
        contentSnapshot,
      })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }

      logger.info({ sessionId, mode, lemmaCount: lemmaIds.length }, 'cr2 assignment added')
      return res.status(201).json({
        id:         result.assignment.id,
        mode:       result.assignment.mode,
        lemmaCount: result.assignment.lemmaIds.length,
      })
    } catch (err) {
      logger.error({ err }, 'cr2 addAssignment crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── DELETE /api/v1/classroom/sessions/:id/assignments/:aid ──────
// Nur bei status='lobby'. (Nicht in T-2.x nummeriert, aber im API-Vertrag)
router.delete(
  '/api/v1/classroom/sessions/:id/assignments/:aid',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  (req, res) => {
    try {
      const result = removeAssignment({
        sessionId:    req.params.id,
        assignmentId: req.params.aid,
        teacherUserId: req.cr2.subject.id,
      })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }
      return res.status(204).end()
    } catch (err) {
      logger.error({ err }, 'cr2 removeAssignment crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.4 POST /api/v1/classroom/sessions/:id/start ────────────
router.post(
  '/api/v1/classroom/sessions/:id/start',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(cr2StartSessionSchema),
  (req, res) => {
    try {
      const sessionId    = req.params.id
      const teacherUserId = req.cr2.subject.id
      const result = startSession({ sessionId, teacherUserId })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }
      logger.info({ sessionId }, 'cr2 session started')
      // TODO (T-3.x): io.to(`cr2:${sessionId}:students`).emit('session:started', { sessionId, startedAt: result.session.startedAt, assignment: { mode } })
      return res.json({
        status:    result.session.status,
        startedAt: result.session.startedAt,
      })
    } catch (err) {
      logger.error({ err }, 'cr2 startSession crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.4 POST /api/v1/classroom/sessions/:id/finish ───────────
router.post(
  '/api/v1/classroom/sessions/:id/finish',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(cr2FinishSessionSchema),
  (req, res) => {
    try {
      const sessionId    = req.params.id
      const teacherUserId = req.cr2.subject.id
      const { reason }   = req.body
      const result = finishSession({ sessionId, teacherUserId, reason })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }
      logger.info({ sessionId, reason }, 'cr2 session finished')
      // TODO (T-3.x): io.to(`cr2:${sessionId}:students`).emit('session:finished', { sessionId, finishedAt: result.session.finishedAt })
      // TODO (T-3.x): io.to(`cr2:${sessionId}:teacher`).emit('session:finished', { sessionId, finishedAt: result.session.finishedAt })
      return res.json({
        status:     result.session.status,
        finishedAt: result.session.finishedAt,
      })
    } catch (err) {
      logger.error({ err }, 'cr2 finishSession crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.9 GET /api/v1/classroom/sessions/:id/dashboard ─────────
// Aggregierte Trefferquote pro Lemma + Abgaben-Count (D7).
// KEIN Live-Leaderboard, KEINE Einzelantworten.
router.get(
  '/api/v1/classroom/sessions/:id/dashboard',
  requireCapability('session:manage'),
  (req, res) => {
    try {
      const result = getDashboard({
        sessionId:    req.params.id,
        teacherUserId: req.cr2.subject.id,
      })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }
      return res.json(result)
    } catch (err) {
      logger.error({ err }, 'cr2 getDashboard crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ════════════════════════════════════════════════════════════════
// SCHUELER-ENDPUNKTE
// ════════════════════════════════════════════════════════════════

// ── T-2.5 POST /api/v1/classroom/join (public) ──────────────────
// Beitritt per Code + Anzeigename → Participant-Token.
// Rate-Limit: classroomJoinLimiter (10 / 5 Min).
router.post(
  '/api/v1/classroom/join',
  classroomJoinLimiter,
  validate(cr2JoinSchema),
  (req, res) => {
    try {
      const { code, displayName } = req.body
      const result = joinByCode({ code, displayName: displayName || null })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }
      logger.info(
        { sessionId: result.session.id, participantId: result.participant.id },
        'cr2 participant joined',
      )
      // TODO (T-3.x): io.to(`cr2:${result.session.id}:teacher`).emit('student:joined', { participantId, displayName, joinedAt })
      return res.status(201).json({
        participantId: result.participant.id,
        token:         result.participant.token,
        sessionId:     result.session.id,
        sessionStatus: result.session.status,
      })
    } catch (err) {
      logger.error({ err }, 'cr2 join crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.6 GET /api/v1/classroom/me/view ────────────────────────
// Schueler-Sicht auf aktuelle Aufgabe.
// WHITELIST-Serialisierung — R1 ist hier der kritischste Punkt.
// buildStudentView() ist die einzige Stelle, die Antwortdaten haelt.
router.get(
  '/api/v1/classroom/me/view',
  requireParticipantAuth,
  (req, res) => {
    try {
      const { participant, sessionId } = req.cr2
      const session = getSessionById(sessionId)
      if (!session) return res.status(404).json({ error: 'Session nicht gefunden' })

      // Session-Status pruefen — Schueler koennen Retro-View sehen (D5)
      // auch wenn die Session beendet ist (read-only)
      const assignments = listAssignments(sessionId)
      const assignment  = assignments[0] || null
      if (!assignment) {
        return res.json({
          sessionId,
          sessionStatus: session.status,
          assignment:    null,
          currentLemma:  null,
          progress:      { submittedCount: 0, totalLemmata: 0, done: false },
        })
      }

      const view = buildStudentView(participant, session, assignment)
      return res.json(view)
    } catch (err) {
      logger.error({ err }, 'cr2 me/view crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.7 POST /api/v1/classroom/me/submit ─────────────────────
// Serverautoritatives Scoring (D13/R6).
// KEIN score-Feld im Request-Schema — Score wird ausschliesslich
// server-seitig berechnet. requireCapability stellt sicher, dass
// submission:write nicht revoked ist (Session bereits beendet → 403).
router.post(
  '/api/v1/classroom/me/submit',
  classroomWriteLimiter,
  requireCapability('submission:write'),
  validate(cr2SubmitSchema),
  (req, res) => {
    try {
      const { participant, sessionId } = req.cr2
      const { assignmentId, lemmaId, roundIndex, rawAnswer, clientMs } = req.body

      const result = submitAnswer({
        participantId: participant.id,
        sessionId,
        assignmentId,
        lemmaId,
        roundIndex,
        rawAnswer,
        clientMs: clientMs ?? null,
      })
      if (result.error) {
        const mapped = mapError(result.error)
        return res.status(mapped.status).json({ error: mapped.message })
      }

      // TODO (T-3.x): io.to(`cr2:${sessionId}:teacher`).emit('submission:received', { participantId, assignmentId, lemmaId, score, maxScore, correct, scoredAt })
      return res.json({
        score:    result.score,
        correct:  result.correct,
        maxScore: result.maxScore,
      })
    } catch (err) {
      logger.error({ err }, 'cr2 submit crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.8 POST /api/v1/classroom/me/heartbeat ──────────────────
// Aktualisiert last_seen_at + connected=1. Antwort { ok, status }.
router.post(
  '/api/v1/classroom/me/heartbeat',
  classroomHeartbeatLimiter,
  requireParticipantAuth,
  (req, res) => {
    try {
      const { participant, sessionId } = req.cr2
      heartbeatParticipant(participant.id)

      const session = getSessionById(sessionId)
      // TODO (T-3.x): io.to(`cr2:${sessionId}:teacher`).emit('student:heartbeat', { participantId, connected: true, lastSeenAt })
      return res.json({ ok: true, status: session?.status || 'unknown' })
    } catch (err) {
      logger.error({ err }, 'cr2 heartbeat crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

// ── T-2.10 POST /api/v1/classroom/me/leave ─────────────────────
router.post(
  '/api/v1/classroom/me/leave',
  requireParticipantAuth,
  (req, res) => {
    try {
      const { participant, sessionId } = req.cr2
      leaveParticipant(participant.id)
      // TODO (T-3.x): io.to(`cr2:${sessionId}:teacher`).emit('student:left', { participantId, reason: 'self' })
      return res.status(204).end()
    } catch (err) {
      logger.error({ err }, 'cr2 leave crashed')
      return res.status(500).json({ error: 'Interner Serverfehler' })
    }
  },
)

export default router
