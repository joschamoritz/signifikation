/**
 * server/routes/classroom.js
 *
 * API-Layer fuer den Klassenraum (T-2.1 bis T-2.10).
 * Alle Pfade unter /api/v1/classroom/.
 *
 * Auth-Modi (D14):
 *   Teacher   – better-auth-Session (cookie) + premium-Rolle
 *   Participant – Bearer auth_token (HMAC-Hash in classroom_participant)
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
import { serverError } from '../middleware/auth.js'
import { requireCapability } from '../middleware/requireCapability.js'
import { findParticipantByToken } from '../classroom/store.js'
import {
  trackSessionCreated,
  trackJoinAttempted,
  trackJoinSucceeded,
  trackJoinFailed,
  trackSessionStarted,
  trackSessionFinished,
  trackSessionPaused,
  trackSessionResumed,
  trackAssignmentChanged,
  trackSubmissionReceived,
} from '../classroom/telemetry.js'
import {
  validate,
  classroomCreateSessionSchema,
  classroomCreateAssignmentSchema,
  classroomCreateAssignmentsSchema,
  classroomNextAssignmentSchema,
  classroomLemmataQuerySchema,
  classroomTodayLemmataQuerySchema,
  classroomStartSessionSchema,
  classroomFinishSessionSchema,
  classroomDuplicateSessionSchema,
  classroomPauseSessionSchema,
  classroomResumeSessionSchema,
  classroomJoinSchema,
  classroomSubmitSchema,
  classroomListSessionsQuerySchema,
  classroomSessionIdParamsSchema,
  classroomAssignmentIdParamsSchema,
  classroomParticipantKickParamsSchema,
} from '../middleware/validate.js'
import {
  createSession,
  duplicateSession,
  addAssignment,
  addAssignments,
  removeAssignment,
  listAssignments,
  countAssignments,
  getAssignmentAtIndex,
  nextAssignment,
  getSessionById,
  listTeacherSessions,
  startSession,
  finishSession,
  deleteSession,
  pauseSession,
  resumeSession,
  joinByCode,
  heartbeatParticipant,
  leaveParticipant,
  kickParticipant,
  submitAnswer,
  getDashboard,
  getSessionResults,
  getParticipantReveal,
  buildStudentView,
  buildSafePrompt,
} from '../classroom/store.js'
import { fetchLemma, fetchZeitenwende } from '../wortprofil.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { buildLueckenfueller } from '../lueckenfueller.js'
import { parseWzId } from '../classroom/content.js'
import { withTimeout } from '../classroom/withTimeout.js'
import { getMode } from '../classroom/modes/index.js'
import { loadKalenderEntry, getLemmataIndex, loadWortZwillingEntry, loadZeitenwendeEntry } from '../store.js'
import {
  notifyStudentJoined,
  notifyStudentLeft,
  notifyStudentHeartbeat,
  notifySubmissionReceived,
  notifyParticipantProgress,
  notifySessionStarted,
  notifySessionFinished,
  notifySessionPaused,
  notifySessionResumed,
  notifyAssignmentChanged,
  notifyStudentViewUpdated,
} from '../realtime/classroomSocket.js'
import {
  classroomJoinLimiter,
  classroomHeartbeatLimiter,
  classroomWriteLimiter,
  classroomReadLimiter,
} from '../middleware/rateLimiter.js'
import { isJoinBlocked, recordJoinFailure } from '../classroom/join-guard.js'
import { loadDemoContent } from '../classroom/demoContent.js'

const router = express.Router()

// Reveal-Fenster nach Sitzungsende: so lange bleibt der Schüler-Token gültig
// (Auflösung ansehen), danach 401. Während Lobby/Running gilt er unbegrenzt.
const PARTICIPANT_REVEAL_TTL_MS = 2 * 60 * 60 * 1000 // 2 h

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

  // Token-TTL (H3): nach Sitzungsende gilt der Token nur noch ein kurzes
  // Reveal-Fenster (Auflösung ansehen), nicht bis zum Hard-Delete (30 Tage).
  // Während Lobby/Running gilt er unbegrenzt.
  const session = getSessionById(participant.sessionId)
  if (session && (session.status === 'finished' || session.status === 'aborted')
      && session.finishedAt && Date.now() - session.finishedAt > PARTICIPANT_REVEAL_TTL_MS) {
    return res.status(401).json({ error: 'Token abgelaufen' })
  }

  req.classroom = { participant, sessionId: participant.sessionId }
  return next()
}

// ── Fehler-Mapping ───────────────────────────────────────────────
function mapError(errCode) {
  switch (errCode) {
    case 'NOT_FOUND':          return { status: 404, message: 'Nicht gefunden' }
    case 'FORBIDDEN':          return { status: 403, message: 'Keine Berechtigung' }
    case 'INVALID_STATE':      return { status: 409, message: 'Ungültiger Session-Zustand' }
    case 'SESSION_NOT_ENDED':  return { status: 409, message: 'Auswertung erst nach Session-Ende verfügbar' }
    case 'SESSION_PAUSED':     return { status: 409, message: 'Session ist pausiert' }
    case 'INVALID_CODE':       return { status: 404, message: 'Code ungültig oder Session nicht aktiv' }
    case 'LATE_JOIN_DISABLED': return { status: 409, message: 'Spaetbeitritt deaktiviert' }
    case 'SESSION_FULL':       return { status: 409, message: 'Session voll (max. 50 Teilnehmende)' }
    case 'NO_ASSIGNMENT':      return { status: 409, message: 'Session hat kein Assignment – erst hinzufügen' }
    case 'ASSIGNMENT_EXISTS':  return { status: 409, message: 'Assignment bereits vorhanden' }
    case 'TOO_MANY_ASSIGNMENTS': return { status: 409, message: 'Maximal 5 Modus-Blöcke pro Session' }
    case 'ASSIGNMENT_NOT_ACTIVE': return { status: 409, message: 'Dieser Modus ist nicht mehr aktiv' }
    case 'TOO_MANY_LEMMATA':   return { status: 400, message: 'Maximal 3 Lemmata pro Assignment (D3)' }
    case 'NO_LEMMATA':         return { status: 400, message: 'Mindestens 1 Lemma erforderlich' }
    case 'INVALID_MODE':       return { status: 400, message: 'Ungültiger Modus' }
    case 'INVALID_INPUT':      return { status: 400, message: 'Ungültige oder fehlende Eingabe' }
    case 'PAYLOAD_TOO_LARGE':  return { status: 413, message: 'rawAnswer zu groß (max. 4 KiB)' }
    case 'SCORING_FAILED':     return { status: 422, message: 'Scoring fehlgeschlagen – ggf. Content-Snapshot prüfen' }
    case 'IDEMPOTENCY_RACE':   return { status: 409, message: 'Submission-Konflikt – bitte wiederholen' }
    default:                   return { status: 500, message: 'Interner Serverfehler' }
  }
}

// ── Store-Ergebnis → HTTP-Response ──────────────────────────────
// Übernimmt das wiederkehrende result.error-Mapping (mapError → Status +
// { error: message }) und ruft bei Erfolg onSuccess(result) auf.
// Default-onSuccess: res.json(result) (Dashboard/Results/Reveal).
// Domänen-Fehlercode → HTTP-Fehler-Response (mapError + { error }). withCode
// hängt zusätzlich den stabilen Code an — nur /join + /me/submit, fürs
// schülerfreundliche Kiosk-Routing (NameState wählt daraus die Meldung).
function respondStoreError(res, errCode, { withCode = false } = {}) {
  const mapped = mapError(errCode)
  const body = withCode ? { error: mapped.message, code: errCode } : { error: mapped.message }
  return res.status(mapped.status).json(body)
}

function respondStoreResult(res, result, onSuccess = (r) => res.json(r)) {
  if (result.error) return respondStoreError(res, result.error)
  return onSuccess(result)
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

// Synthetisches Lemma-Objekt fuer ein Wort-Zwilling-Paar (hat keinen DB-Eintrag).
function synthWzLemma(id, pair) {
  return {
    id,
    lemma:        `${pair.wortA} ↔ ${pair.wortB}`,
    pos:          pair.pos || 'Substantiv',
    ipa:          '',
    definition:   '',
    definitionen: [],
    runden:       { wzPair: pair },
    lueckenfueller: null,
  }
}

// Laedt die Lemmata fuer ein Assignment: echte IDs aus der DB, „wz:"-Paar-IDs
// (Wort-Zwilling) als synthetische Objekte. → { lemmata, missing }.
function loadAssignmentLemmata(lemmaIds) {
  const realIds = lemmaIds.filter((id) => !parseWzId(id))
  const rows = realIds.length ? getLemmataByIdsStmt.all(JSON.stringify(realIds)) : []
  const lemmata = rows.map(parseLemmaJson)
  for (const id of lemmaIds) {
    const pair = parseWzId(id)
    if (pair) lemmata.push(synthWzLemma(id, pair))
  }
  const foundIds = new Set(lemmata.map((l) => l.id))
  const missing = lemmaIds.filter((id) => !foundIds.has(id))
  return { lemmata, missing }
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
// Hartes Limit pro Lemma-Snapshot, damit eine haengende Sekundaer-DB
// (wortprofil.db/belege.db) den Anlegen-Request nicht unbegrenzt blockiert.
const SNAPSHOT_BUILD_TIMEOUT_MS = 10_000

async function buildContentSnapshot(mode, lemmata) {
  const byLemma = {}
  const m = getMode(mode)
  if (!m) return { byLemma } // unbekannter Modus → leerer Snapshot (wie zuvor)
  // Datenquellen + Logger werden in die Modus-Funktion hereingereicht, damit
  // modes/<mode>.js OHNE wortprofil.db/belege.db isoliert testbar bleibt.
  const deps = { fetchLemma, fetchWortZwilling, fetchZeitenwende, buildLueckenfueller, logger }
  for (const l of lemmata) {
    byLemma[l.id] = await withTimeout(
      m.buildSnapshotEntry(l, deps),
      SNAPSHOT_BUILD_TIMEOUT_MS,
      `content-snapshot ${mode}/${l.id}`,
    )
  }
  // GF-4: Lueckenfueller-Lemmata, deren Runden-Generierung (belege.db) leer
  // blieb, sind unspielbar — jeder Submit liefert INVALID_INPUT. buildStudentView
  // ueberspringt sie zwar, aber das soll dem Lehrer VOR dem Start auffallen.
  // Darum laut loggen (Monitoring/Alert), statt es still mid-class zu entdecken.
  if (mode === 'lueckenfueller') {
    const unplayable = lemmata
      .filter((l) => !(Array.isArray(byLemma[l.id]?.rounds) && byLemma[l.id].rounds.length > 0))
      .map((l) => l.lemma || l.id)
    if (unplayable.length > 0) {
      logger.error(
        { mode, unplayable },
        'Lueckenfueller-Lemma(ta) ohne Runden — unspielbar, werden in der Schueler-Sicht uebersprungen',
      )
    }
  }
  return { byLemma }
}

// buildSafePrompt/buildStudentView (R1-Whitelist fuer die Schueler-Sicht)
// leben in ../classroom/store.js (Domaenenschicht) — Architektur-Review
// 2026-07-24: die sicherheitskritischste Funktion der App gehoert nicht in
// die Transport-Schicht und braucht einen isolierten Unit-Test.

// Wiederkehrende Statements einmalig vorbereiten statt pro Request neu
// kompilieren (better-sqlite3 kompiliert synchron im Hauptthread) — Code-Review H1.
const countActivePartsStmt = db.prepare(
  'SELECT COUNT(1) AS c FROM classroom_participant WHERE session_id = ? AND left_at IS NULL',
)
const countSubmittedPartsStmt = db.prepare(
  'SELECT COUNT(DISTINCT participant_id) AS c FROM classroom_submission WHERE session_id = ?',
)
const getAssignmentModeStmt = db.prepare(
  'SELECT mode FROM classroom_assignment WHERE id = ?',
)

// ── GET /api/v1/classroom/demo-content (public) ─────────────────
// Inhalte der login-freien Lehrer-Demo (Klassenraum-Vorschau).
// Bewusst ohne Auth — die Demo ist für nicht eingeloggte Lehrkräfte.
// Im Admin editierbar; bricht nie (Default-Fallback im Store).
router.get('/api/v1/classroom/demo-content', classroomReadLimiter, (_req, res) => {
  return res.json({ content: loadDemoContent() })
})

// ════════════════════════════════════════════════════════════════
// LEHRER-ENDPUNKTE
// ════════════════════════════════════════════════════════════════

// ── T-2.1 POST /api/v1/classroom/sessions ───────────────────────
// Lehrer legt neue Session im Status 'lobby' an.
router.post(
  '/api/v1/classroom/sessions',
  classroomWriteLimiter,
  requirePremium,
  validate(classroomCreateSessionSchema),
  (req, res) => {
    const { title, settings } = req.body
    const result = createSession({
      teacherUserId: req.user.id,
      title: title || null,
      settings: settings || {},
    })
    return respondStoreResult(res, result, () => {
      logger.info({ sessionId: result.session.id, teacherId: req.user.id }, 'classroom session created')
      trackSessionCreated(result.session.id, req.user.id)
      // TODO (T-3.x): keine Broadcast nötig beim Anlegen
      return res.status(201).json({
        id:     result.session.id,
        code:   result.session.code,
        status: result.session.status,
        title:  result.session.title,
      })
    })
  },
)

// ── W4 POST /api/v1/classroom/sessions/:id/duplicate ────────────
// „Mit neuer Klasse wiederholen": klont Titel + Assignment-Bloecke in eine
// frische Lobby-Session mit neuem Join-Code (ohne Teilnehmer/Abgaben).
// requireCapability prueft session:manage auf der QUELL-Session (:id).
router.post(
  '/api/v1/classroom/sessions/:id/duplicate',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomDuplicateSessionSchema),
  (req, res) => {
    const sourceId      = req.params.id
    const teacherUserId = req.classroom.subject.id
    const { title }     = req.body
    const result = duplicateSession({ sessionId: sourceId, teacherUserId, title: title || null })
    return respondStoreResult(res, result, () => {
      logger.info({ sourceId, newId: result.session.id, teacherId: teacherUserId }, 'classroom session duplicated (route)')
      trackSessionCreated(result.session.id, teacherUserId)
      return res.status(201).json({
        id:     result.session.id,
        code:   result.session.code,
        status: result.session.status,
        title:  result.session.title,
      })
    })
  },
)

// ── T-2.3 GET /api/v1/classroom/lemmata ────────────────────────
// Picker-Endpoint fuer die Teacher-UI (Suche + Modus-Filter).
// Nur oeffentliche Felder — KEIN notiz, runden, rundenInfo.
//
// Modus-Filter (F2b): zeigt pro Modus nur Lemmata, die dafuer Spieldaten haben.
//   wortzwilling / zeitenwende → gespeichertes runden.<modus>-Feld vorhanden
//   lueckenfueller             → lueckenfueller.rounds vorhanden
//   kollokationen              → KEIN Filter: durch F2a live aus wortprofil.db
//                                generierbar, also jedes kuratierte Lemma spielbar
function lemmaModeFilter(mode) {
  // Kein Modus-Filter mehr: Zeitenwende/Lückenfüller/Kollokationen werden alle
  // live aus Korpus/Belegen generiert (fetchZeitenwende / buildLueckenfueller /
  // fetchLemma). Jedes kuratierte Lemma ist also wählbar; ob es genug Eignung
  // hat, zeigt die Schüleransicht-Vorschau. (Früher beschränkte Zeitenwende auf
  // ein gespeichertes runden.zeitenwende-Feld → „Keine Treffer" für eigene
  // Lemmata, obwohl der Content live erzeugbar ist.) wortzwilling nutzt ohnehin
  // den Paar-Picker, nicht diesen Endpoint.
  void mode
  return ''
}

// Prepared-Statements je Modus cachen (better-sqlite3 mag stabile Statements).
const _lemmataStmtCache = new Map()
function lemmataStmts(mode) {
  const key = mode || '*'
  if (_lemmataStmtCache.has(key)) return _lemmataStmtCache.get(key)
  const where = `WHERE (:q IS NULL OR lemma LIKE :q OR definition LIKE :q)
    AND (:pos IS NULL OR pos = :pos) ${lemmaModeFilter(mode)}`
  const pair = {
    search: db.prepare(`SELECT id, lemma, pos, ipa, definition, definitionen FROM lemmata ${where} ORDER BY lemma LIMIT :limit`),
    count:  db.prepare(`SELECT COUNT(*) AS total FROM lemmata ${where}`),
  }
  _lemmataStmtCache.set(key, pair)
  return pair
}

router.get(
  '/api/v1/classroom/lemmata',
  requirePremium,
  validate(classroomLemmataQuerySchema, 'query'),
  (req, res) => {
    const { q, pos, limit, mode } = req.query
    const qParam = q ? `%${q}%` : null
    const posParam = pos || null
    const { search, count } = lemmataStmts(mode)

    const rows = search.all({ q: qParam, pos: posParam, limit })
    const { total } = count.get({ q: qParam, pos: posParam })

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
  },
)

// ── GET /api/v1/classroom/today-lemmata ─────────────────────────
// Schnellzugriff auf die heutige Tagesauswahl (Kalender) als waehlbare Lemmata.
// Nur Modi mit Lemma-ID-Tagesplanung: kollokationen (kalender.ids) +
// lueckenfueller (kalender.lueckenfueller_id). wortzwilling/zeitenwende haben
// eigene Tagestabellen ohne Lemma-ID → leere Liste (Frontend zeigt Hinweis).
function classroomTodayDatum() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
}

router.get(
  '/api/v1/classroom/today-lemmata',
  requirePremium,
  validate(classroomTodayLemmataQuerySchema, 'query'),
  (req, res) => {
    const mode  = req.query.mode || 'kollokationen'
    const datum = classroomTodayDatum()
    const { byId, byLemma } = getLemmataIndex()

    let ids = []
    if (mode === 'zeitenwende') {
      // Eigene Tagestabelle (kein Lemma-ID): heutiges Wort → Lemma-ID via
      // Namen-Lookup. Nur wenn es als kuratiertes Lemma existiert.
      const zw = loadZeitenwendeEntry(datum)
      const lem = zw?.lemma ? byLemma.get(zw.lemma) : null
      if (lem?.id) ids = [lem.id]
    } else {
      const entry = loadKalenderEntry(datum)
      if (entry) {
        if (mode === 'lueckenfueller') {
          const lfId = Array.isArray(entry) ? null : entry.lueckenfueller_id
          if (lfId) ids = [lfId]
        } else if (mode === 'kollokationen') {
          ids = Array.isArray(entry) ? entry : (entry.ids ?? [])
        }
      }
      // wortzwilling: nutzt den Paar-Picker (today-wortzwilling), nicht hier.
    }

    function firstDef(l) {
      if (l.definition) return l.definition
      const arr = l.definitionen
      return (Array.isArray(arr) && arr[0]) || ''
    }
    const items = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((l) => ({
        id:         l.id,
        lemma:      l.lemma,
        pos:        l.pos,
        ipa:        l.ipa || '',
        definition: firstDef(l),
      }))

    return res.json({ datum, mode, items })
  },
)

// ── GET /api/v1/classroom/today-wortzwilling ────────────────────
// Heutiges Wort-Zwilling-Paar (Schnellauswahl im Wort-Zwilling-Setup).
router.get(
  '/api/v1/classroom/today-wortzwilling',
  requirePremium,
  (req, res) => {
    const datum = classroomTodayDatum()
    const entry = loadWortZwillingEntry(datum)
    if (!entry || !entry.wortA || !entry.wortB) {
      return res.json({ datum, pair: null })
    }
    return res.json({
      datum,
      pair: { wortA: entry.wortA, wortB: entry.wortB, pos: entry.pos || 'Substantiv' },
    })
  },
)

// ── W2-T1 POST /api/v1/classroom/preview ────────────────────────
// Teacher-Preview: liefert exakt die Schueler-Sicht (currentLemma.prompt)
// fuer eine Modus+Lemma-Auswahl, OHNE Session/Assignment/Participant
// anzulegen. Gleiche Datenquelle wie der Echtbetrieb — wir bauen denselben
// content_snapshot (buildContentSnapshot) und filtern ihn mit derselben
// Whitelist (buildSafePrompt). Es wird NICHTS persistiert, NICHTS gescort.
//
// Body == classroomCreateAssignmentSchema ({ mode, lemmaIds }), damit Validierung
// und Limits (D3: max. 3 Lemmata) identisch zum echten Assignment sind.
router.post(
  '/api/v1/classroom/preview',
  requirePremium,
  validate(classroomCreateAssignmentSchema),
  async (req, res) => {
    const { mode, lemmaIds } = req.body

    const { lemmata, missing } = loadAssignmentLemmata(lemmaIds)
    if (missing.length > 0) {
      return res.status(404).json({ error: `Lemmata nicht gefunden: ${missing.join(', ')}` })
    }

    // Reihenfolge aus Request erhalten (wie beim echten Assignment)
    const orderedLemmata = lemmaIds.map(id => lemmata.find(l => l.id === id))
    const snapshot = await buildContentSnapshot(mode, orderedLemmata)

    // Pro Lemma die gewhitelistete Schueler-Sicht. Fuer Lueckenfueller
    // bleibt das volle (sichere) rounds-Array erhalten — der Client steppt
    // in der Vorschau lokal durch die Runden (analog buildStudentView).
    const previewLemmata = orderedLemmata.map((l) => {
      const snap = snapshot.byLemma?.[l.id] ?? {}
      return {
        id:         l.id,
        lemma:      l.lemma,
        ipa:        l.ipa,
        definition: l.definition || (l.definitionen?.[0] ?? ''),
        prompt:     buildSafePrompt(mode, snap),
      }
    })

    return res.json({ mode, lemmata: previewLemmata })
  },
)

// ── T-2.10 GET /api/v1/classroom/sessions ───────────────────────
// Liste eigener Sessions des Lehrers.
router.get(
  '/api/v1/classroom/sessions',
  requirePremium,
  validate(classroomListSessionsQuerySchema, 'query'),
  (req, res) => {
    const { limit } = req.query
    const sessions = listTeacherSessions({ teacherUserId: req.user.id, limit })
    return res.json({ sessions })
  },
)

// ── T-2.2 POST /api/v1/classroom/sessions/:id/assignments ───────
// Modus + Lemmata festlegen, content_snapshot einfrieren.
// Nur bei status='lobby' (store erzwingt das).
router.post(
  '/api/v1/classroom/sessions/:id/assignments',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomCreateAssignmentSchema),
  async (req, res) => {
    const { mode, lemmaIds } = req.body
    const sessionId   = req.params.id
    const teacherUserId = req.classroom.subject.id

    // Lemmata laden (echte aus DB, wz:-Paare synthetisch), Snapshot einfrieren
    const { lemmata, missing } = loadAssignmentLemmata(lemmaIds)
    if (missing.length > 0) {
      return res.status(404).json({ error: `Lemmata nicht gefunden: ${missing.join(', ')}` })
    }

    // Reihenfolge aus Request erhalten
    const orderedLemmata = lemmaIds.map(id => lemmata.find(l => l.id === id))
    let contentSnapshot
    try {
      contentSnapshot = await buildContentSnapshot(mode, orderedLemmata)
    } catch (err) {
      logger.error({ err, sessionId, mode }, 'content_snapshot Aufbau fehlgeschlagen/timeout')
      return res.status(503).json({ error: 'Inhalte konnten gerade nicht geladen werden. Bitte erneut versuchen.' })
    }

    const result = addAssignment({
      sessionId,
      teacherUserId,
      mode,
      lemmaIds,
      contentSnapshot,
    })
    return respondStoreResult(res, result, () => {
      logger.info({ sessionId, mode, lemmaCount: lemmaIds.length }, 'classroom assignment added')
      return res.status(201).json({
        id:         result.assignment.id,
        mode:       result.assignment.mode,
        lemmaCount: result.assignment.lemmaIds.length,
      })
    })
  },
)

// ── W2-T2 POST /api/v1/classroom/sessions/:id/assignments/bulk ──
// Mehrere (Modus + Lemmata)-Bloecke in Reihenfolge anlegen. content_snapshot
// wird pro Block beim Anlegen eingefroren — gleiche Bauweise wie das
// Einzel-Assignment, nur in einer atomaren Operation.
router.post(
  '/api/v1/classroom/sessions/:id/assignments/bulk',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomCreateAssignmentsSchema),
  async (req, res) => {
    const { blocks } = req.body
    const sessionId    = req.params.id
    const teacherUserId = req.classroom.subject.id

    // Pro Block Snapshot bauen; dafuer alle referenzierten Lemmata laden.
    const builtBlocks = []
    for (const block of blocks) {
      const { lemmata, missing } = loadAssignmentLemmata(block.lemmaIds)
      if (missing.length > 0) {
        return res.status(404).json({ error: `Lemmata nicht gefunden: ${missing.join(', ')}` })
      }
      const orderedLemmata = block.lemmaIds.map(id => lemmata.find(l => l.id === id))
      let contentSnapshot
      try {
        contentSnapshot = await buildContentSnapshot(block.mode, orderedLemmata)
      } catch (err) {
        logger.error({ err, sessionId, mode: block.mode }, 'content_snapshot Aufbau fehlgeschlagen/timeout (bulk)')
        return res.status(503).json({ error: 'Inhalte konnten gerade nicht geladen werden. Bitte erneut versuchen.' })
      }
      builtBlocks.push({
        mode:           block.mode,
        lemmaIds:       block.lemmaIds,
        contentSnapshot,
      })
    }

    const result = addAssignments({ sessionId, teacherUserId, blocks: builtBlocks })
    return respondStoreResult(res, result, () => {
      logger.info({ sessionId, count: result.assignments.length }, 'classroom assignments (bulk) added')
      return res.status(201).json({
        assignments: result.assignments.map(a => ({
          id:         a.id,
          mode:       a.mode,
          lemmaCount: a.lemmaIds.length,
          position:   a.position,
        })),
      })
    })
  },
)

// ── DELETE /api/v1/classroom/sessions/:id/assignments/:aid ──────
// Nur bei status='lobby'. (Nicht in T-2.x nummeriert, aber im API-Vertrag)
router.delete(
  '/api/v1/classroom/sessions/:id/assignments/:aid',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomAssignmentIdParamsSchema, 'params'),
  (req, res) => {
    const result = removeAssignment({
      sessionId:    req.params.id,
      assignmentId: req.params.aid,
      teacherUserId: req.classroom.subject.id,
    })
    return respondStoreResult(res, result, () => res.status(204).end())
  },
)

// ── T-2.4 POST /api/v1/classroom/sessions/:id/start ────────────
router.post(
  '/api/v1/classroom/sessions/:id/start',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomStartSessionSchema),
  (req, res) => {
    const sessionId    = req.params.id
    const teacherUserId = req.classroom.subject.id
    const result = startSession({ sessionId, teacherUserId, allowLateJoin: req.body.allowLateJoin })
    return respondStoreResult(res, result, () => {
      logger.info({ sessionId }, 'classroom session started')
      const participantCount = countActivePartsStmt.get(sessionId)?.c ?? 0
      trackSessionStarted(sessionId, teacherUserId, Number(participantCount))
      // Broadcast an Schueler- und Teacher-Room (Plan §6: session:started).
      // Mode wird aus dem (einzigen, D2) Assignment gezogen, falls vorhanden.
      const assignments = listAssignments(sessionId)
      notifySessionStarted(sessionId, {
        sessionId,
        startedAt: result.session.startedAt,
        assignment: assignments[0] ? { mode: assignments[0].mode } : null,
      })
      return res.json({
        status:    result.session.status,
        startedAt: result.session.startedAt,
      })
    })
  },
)

// ── T-2.4 POST /api/v1/classroom/sessions/:id/finish ───────────
router.post(
  '/api/v1/classroom/sessions/:id/finish',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomFinishSessionSchema),
  (req, res) => {
    try {
      const sessionId    = req.params.id
      const teacherUserId = req.classroom.subject.id
      const { reason }   = req.body
      const result = finishSession({ sessionId, teacherUserId, reason })
      if (result.error) return respondStoreError(res, result.error)
      logger.info({ sessionId, reason }, 'classroom session finished')
      // Telemetrie: durationMs aus started_at
      const durationMs = result.session.startedAt
        ? result.session.finishedAt - result.session.startedAt
        : null
      // Completion-Rate: Schüler mit mind. 1 Submission / alle Teilnehmer
      const totalParts = countActivePartsStmt.get(sessionId)?.c ?? 0
      const submittedParts = countSubmittedPartsStmt.get(sessionId)?.c ?? 0
      const completionRate = totalParts > 0 ? submittedParts / totalParts : 0
      trackSessionFinished(sessionId, teacherUserId, { durationMs, completionRate, reason: reason || 'manual' })
      notifySessionFinished(sessionId, {
        sessionId,
        finishedAt: result.session.finishedAt,
        reason: reason || 'manual',
      })
      return res.json({
        status:     result.session.status,
        finishedAt: result.session.finishedAt,
      })
    } catch (err) {
      logger.error({ err }, 'classroom finishSession crashed')
      return serverError(res, err)
    }
  },
)

// ── DELETE /api/v1/classroom/sessions/:id ───────────────────────
// Lehrer loescht eine eigene Session (Liste sauber halten). ON DELETE CASCADE
// raeumt Teilnehmer/Submissions/Scores/Capabilities/Telemetrie mit ab.
router.delete(
  '/api/v1/classroom/sessions/:id',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  (req, res) => {
    try {
      const result = deleteSession({
        sessionId:     req.params.id,
        teacherUserId: req.classroom.subject.id,
      })
      if (result.error) return respondStoreError(res, result.error)
      logger.info({ sessionId: req.params.id }, 'classroom session deleted')
      return res.status(204).end()
    } catch (err) {
      logger.error({ err }, 'classroom deleteSession crashed')
      return serverError(res, err)
    }
  },
)

// ── W2-T3 POST /api/v1/classroom/sessions/:id/pause ────────────
router.post(
  '/api/v1/classroom/sessions/:id/pause',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomPauseSessionSchema),
  (req, res) => {
    try {
      const sessionId     = req.params.id
      const teacherUserId = req.classroom.subject.id
      const result = pauseSession({ sessionId, teacherUserId })
      if (result.error) return respondStoreError(res, result.error)
      trackSessionPaused(sessionId, teacherUserId)
      notifySessionPaused(sessionId, {
        sessionId,
        pausedAt: result.session.pausedAt,
      })
      return res.json({
        status:   result.session.status,
        pausedAt: result.session.pausedAt,
      })
    } catch (err) {
      logger.error({ err }, 'classroom pauseSession crashed')
      return serverError(res, err)
    }
  },
)

// ── W2-T3 POST /api/v1/classroom/sessions/:id/resume ───────────
router.post(
  '/api/v1/classroom/sessions/:id/resume',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomResumeSessionSchema),
  (req, res) => {
    try {
      const sessionId     = req.params.id
      const teacherUserId = req.classroom.subject.id
      const result = resumeSession({ sessionId, teacherUserId })
      if (result.error) return respondStoreError(res, result.error)
      trackSessionResumed(sessionId, teacherUserId)
      notifySessionResumed(sessionId, {
        sessionId,
        resumedAt: result.session.lastActivityAt,
      })
      return res.json({
        status: result.session.status,
      })
    } catch (err) {
      logger.error({ err }, 'classroom resumeSession crashed')
      return serverError(res, err)
    }
  },
)

// ── W2-T2 POST /api/v1/classroom/sessions/:id/next-assignment ──
// Schliesst das aktuelle Assignment ab und aktiviert das naechste.
// Nach dem letzten Block → Session beendet (gleiche Semantik wie /finish).
// Server-autoritativ (D13), nur Besitzer (requireCapability session:manage),
// im Pause-Zustand verboten (store gibt SESSION_PAUSED zurueck).
router.post(
  '/api/v1/classroom/sessions/:id/next-assignment',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  validate(classroomNextAssignmentSchema),
  (req, res) => {
    try {
      const sessionId    = req.params.id
      const teacherUserId = req.classroom.subject.id
      const result = nextAssignment({ sessionId, teacherUserId })
      if (result.error) return respondStoreError(res, result.error)

      if (result.done) {
        // Letzter Block durchgespielt → Session ist beendet. Broadcast wie /finish.
        logger.info({ sessionId }, 'classroom next-assignment → session finished (last block)')
        const durationMs = result.session.startedAt
          ? result.session.finishedAt - result.session.startedAt
          : null
        const totalParts = countActivePartsStmt.get(sessionId)?.c ?? 0
        const submittedParts = countSubmittedPartsStmt.get(sessionId)?.c ?? 0
        const completionRate = totalParts > 0 ? submittedParts / totalParts : 0
        trackSessionFinished(sessionId, teacherUserId, { durationMs, completionRate, reason: 'completed' })
        notifySessionFinished(sessionId, {
          sessionId,
          finishedAt: result.session.finishedAt,
          reason: 'completed',
        })
        return res.json({ status: 'finished', done: true, finishedAt: result.session.finishedAt })
      }

      // Wechsel: Schueler-Kiosk holt die neue (gewhitelistete) Sicht per
      // /me/view nach — wir senden bewusst KEINEN content_snapshot (R1).
      logger.info(
        { sessionId, index: result.index, total: result.total, mode: result.assignment.mode },
        'classroom advanced to next assignment',
      )
      trackAssignmentChanged(sessionId, teacherUserId, {
        fromIndex: result.index - 1,
        toIndex:   result.index,
        mode:      result.assignment.mode,
      })
      notifyAssignmentChanged(sessionId, {
        sessionId,
        assignmentId: result.assignment.id,
        mode:         result.assignment.mode,
        index:        result.index,
        total:        result.total,
      })
      return res.json({
        status:     result.session.status,
        done:       false,
        index:      result.index,
        total:      result.total,
        assignment: {
          id:         result.assignment.id,
          mode:       result.assignment.mode,
          lemmaCount: result.assignment.lemmaIds.length,
        },
      })
    } catch (err) {
      logger.error({ err }, 'classroom nextAssignment crashed')
      return serverError(res, err)
    }
  },
)

// ── T-2.9 GET /api/v1/classroom/sessions/:id/dashboard ─────────
// Aggregierte Trefferquote pro Lemma + Abgaben-Count (D7).
// KEIN Live-Leaderboard, KEINE Einzelantworten.
router.get(
  '/api/v1/classroom/sessions/:id/dashboard',
  classroomReadLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  (req, res) => {
    try {
      const result = getDashboard({
        sessionId:    req.params.id,
        teacherUserId: req.classroom.subject.id,
      })
      if (result.error) return respondStoreError(res, result.error)
      return res.json(result)
    } catch (err) {
      logger.error({ err }, 'classroom getDashboard crashed')
      return serverError(res, err)
    }
  },
)

// ── W2-T4 GET /api/v1/classroom/sessions/:id/results ────────────
// Pseudonymisierte Nachbereitung pro Modus/Lemma: Trefferquote, Ø-Score,
// haeufigster Distraktor + Top-3 auffaelligste Fragen. KEINE Klarnamen-
// Zuordnung zu einzelnen Antworten (D7 gilt auch nach Session-Ende).
// Nur fuer beendete Sessions (store gibt sonst SESSION_NOT_ENDED zurueck).
router.get(
  '/api/v1/classroom/sessions/:id/results',
  classroomReadLimiter,
  requireCapability('session:manage'),
  validate(classroomSessionIdParamsSchema, 'params'),
  (req, res) => {
    try {
      const result = getSessionResults({
        sessionId:    req.params.id,
        teacherUserId: req.classroom.subject.id,
      })
      if (result.error) return respondStoreError(res, result.error)
      return res.json(result)
    } catch (err) {
      logger.error({ err }, 'classroom getSessionResults crashed')
      return serverError(res, err)
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
  validate(classroomJoinSchema),
  (req, res) => {
    try {
      const { code, displayName } = req.body
      // Brute-Force-Guard pro Code + globaler Backstop — Details und
      // DoS-Begruendung in classroom/join-guard.js (S-M1, 2026-06-11).
      if (isJoinBlocked(code)) {
        trackJoinFailed(code, 'guard_blocked')
        return res.status(429).json({ error: 'Zu viele Beitrittsversuche. Bitte kurz warten.' })
      }
      trackJoinAttempted(code)
      const result = joinByCode({ code, displayName: displayName || null })
      if (result.error) {
        const reason = result.error === 'INVALID_CODE'    ? 'invalid_code'
          : result.error === 'SESSION_FULL'              ? 'session_full'
          : result.error === 'INVALID_STATE'             ? 'session_not_running'
          : 'unknown'
        // Nur ungültige Codes zählen — SESSION_FULL/INVALID_STATE belegen
        // einen gültigen Code und sind kein Rate-Signal.
        if (result.error === 'INVALID_CODE') recordJoinFailure(code)
        trackJoinFailed(code, reason)
        // Stabilen Fehler-Code mitgeben, damit der Kiosk (NameState) eine
        // schuelerfreundliche Meldung waehlen kann statt der technischen.
        return respondStoreError(res, result.error, { withCode: true })
      }
      logger.info(
        { sessionId: result.session.id, participantId: result.participant.id },
        'classroom participant joined',
      )
      trackJoinSucceeded(result.session.id, result.participant.id)
      notifyStudentJoined(result.session.id, {
        participantId: result.participant.id,
        displayName:   (displayName || '').trim().slice(0, 40) || null,
        joinedAt:      Date.now(),
      })
      return res.status(201).json({
        participantId: result.participant.id,
        token:         result.participant.token,
        sessionId:     result.session.id,
        sessionStatus: result.session.status,
      })
    } catch (err) {
      logger.error({ err }, 'classroom join crashed')
      return serverError(res, err)
    }
  },
)

// ── T-2.6 GET /api/v1/classroom/me/view ────────────────────────
// Schueler-Sicht auf aktuelle Aufgabe.
// WHITELIST-Serialisierung — R1 ist hier der kritischste Punkt.
// buildStudentView() ist die einzige Stelle, die Antwortdaten haelt.
router.get(
  '/api/v1/classroom/me/view',
  classroomReadLimiter,
  requireParticipantAuth,
  (req, res) => {
    try {
      const { participant, sessionId } = req.classroom
      const session = getSessionById(sessionId)
      if (!session) return res.status(404).json({ error: 'Session nicht gefunden' })

      // Session-Status pruefen — Schueler koennen Retro-View sehen (D5)
      // auch wenn die Session beendet ist (read-only).
      // W2-T2: Es zaehlt das AKTUELL aktive Assignment (current_assignment_index),
      // nicht mehr stur das erste. Bei einem Modus-Wechsel liefert /me/view
      // damit automatisch den neuen Block (Whitelist-gefiltert, R1).
      // Hot-Path (Schueler-Polling, 10 s-Intervall): nur das AKTIVE Assignment
      // laden, nicht alle bis zu 5 inkl. content_snapshot. total per COUNT.
      const total = countAssignments(sessionId)
      const index = total > 0
        ? Math.min(Math.max(0, session.currentAssignmentIndex), total - 1)
        : 0
      const assignment = total > 0 ? getAssignmentAtIndex(sessionId, index) : null
      if (!assignment) {
        return res.json({
          sessionId,
          sessionStatus: session.status,
          assignment:    null,
          currentLemma:  null,
          progress:      { submittedCount: 0, totalLemmata: 0, done: false },
        })
      }

      const view = buildStudentView(participant, session, assignment, { index, total })
      return res.json(view)
    } catch (err) {
      logger.error({ err }, 'classroom me/view crashed')
      return serverError(res, err)
    }
  },
)

// ── Schritt 4 (C1) GET /api/v1/classroom/me/reveal ─────────────
// Item-genaue Aufloesung der EIGENEN Abgabe — NUR nach Freigabe (D5/R1).
// Vor der Freigabe liefert der Store { revealed: false } ohne Loesung.
router.get(
  '/api/v1/classroom/me/reveal',
  classroomReadLimiter,
  requireParticipantAuth,
  (req, res) => {
    try {
      const { participant, sessionId } = req.classroom
      const result = getParticipantReveal({ sessionId, participantId: participant.id })
      if (result.error) return respondStoreError(res, result.error)
      return res.json(result)
    } catch (err) {
      logger.error({ err }, 'classroom me/reveal crashed')
      return serverError(res, err)
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
  validate(classroomSubmitSchema),
  (req, res) => {
    try {
      const { participant, sessionId } = req.classroom
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
      // Stabilen Code mitgeben, damit der Kiosk einen Modus-Wechsel/Pause
      // ruhig kommunizieren kann statt der technischen Meldung.
      if (result.error) return respondStoreError(res, result.error, { withCode: true })

      const scoredAt = Date.now()
      // Telemetrie: nur mode + correct, kein participantId/lemmaId (D7 / Pseudonymisierung)
      const submissionAssignment = (() => {
        try {
          return getAssignmentModeStmt.get(assignmentId)
        } catch { return null }
      })()
      trackSubmissionReceived(sessionId, {
        mode:    submissionAssignment?.mode ?? 'unknown',
        correct: result.correct,
      })
      notifySubmissionReceived(sessionId, {
        participantId: participant.id,
        assignmentId,
        lemmaId,
        score:    result.score,
        maxScore: result.maxScore,
        correct:  result.correct,
        scoredAt,
      })
      // Fortschrittssignal an die Teacher-Live-Ansicht.
      // currentIndex liefern wir bewusst nicht — D7 verbietet Live-Einzelantworten
      // an die Beamer-Ansicht; der status reicht fuer den Dot.
      notifyParticipantProgress(sessionId, {
        participantId: participant.id,
        status: 'submitted',
        lemmaId,
      })
      // Push naechste Sicht an den Schueler, damit er ohne Polling
      // direkt das naechste Lemma sieht.
      notifyStudentViewUpdated(participant.id, { reason: 'submission' })
      // D5: Dem Schueler wird der Score NICHT mit der Submit-Antwort verraten
      // (auch nicht „nur im State") — er kommt erst nach Freigabe via /me/reveal.
      // Nur die Annahme bestaetigen.
      return res.json({ accepted: true })
    } catch (err) {
      logger.error({ err }, 'classroom submit crashed')
      return serverError(res, err)
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
      const { participant, sessionId } = req.classroom
      heartbeatParticipant(participant.id)

      const session = getSessionById(sessionId)
      notifyStudentHeartbeat(sessionId, {
        participantId: participant.id,
        connected:     true,
        lastSeenAt:    Date.now(),
      })
      return res.json({ ok: true, status: session?.status || 'unknown' })
    } catch (err) {
      logger.error({ err }, 'classroom heartbeat crashed')
      return serverError(res, err)
    }
  },
)

// ── T-2.10 POST /api/v1/classroom/me/leave ─────────────────────
router.post(
  '/api/v1/classroom/me/leave',
  classroomWriteLimiter,
  requireParticipantAuth,
  (req, res) => {
    try {
      const { participant, sessionId } = req.classroom
      leaveParticipant(participant.id)
      notifyStudentLeft(sessionId, {
        participantId: participant.id,
        reason:        'self',
        at:            Date.now(),
      })
      return res.status(204).end()
    } catch (err) {
      logger.error({ err }, 'classroom leave crashed')
      return serverError(res, err)
    }
  },
)

// ── POST /api/v1/classroom/sessions/:id/participants/:pid/kick ──
// Lehrkraft entfernt einen Teilnehmer (Fake-Name/Beleidigung). Server-
// autoritativ (nur Besitzer, requireCapability). Der Schueler wird sofort
// rausgeworfen (view:updated → /me/view 403 → zurueck zum Beitritt); das
// Lehrer-Dashboard aktualisiert via student:left.
router.post(
  '/api/v1/classroom/sessions/:id/participants/:pid/kick',
  classroomWriteLimiter,
  requireCapability('session:manage'),
  validate(classroomParticipantKickParamsSchema, 'params'),
  (req, res) => {
    try {
      const sessionId     = req.params.id
      const participantId  = req.params.pid
      const teacherUserId = req.classroom.subject.id
      const result = kickParticipant({ sessionId, participantId, teacherUserId })
      if (result.error) return respondStoreError(res, result.error)
      // Schueler sofort zwingen, die Sicht neu zu holen → 403 → ausgeloggt.
      notifyStudentViewUpdated(participantId, { reason: 'kicked' })
      // Lehrer-Dashboard/Lobby aktualisieren.
      notifyStudentLeft(sessionId, { participantId, reason: 'kicked', at: Date.now() })
      logger.info({ sessionId, participantId, teacherUserId }, 'classroom participant kicked')
      return res.json({ ok: true })
    } catch (err) {
      logger.error({ err }, 'classroom kick crashed')
      return serverError(res, err)
    }
  },
)

export default router
