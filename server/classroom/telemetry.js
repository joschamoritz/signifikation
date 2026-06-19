/**
 * server/classroom/telemetry.js
 *
 * Telemetrie-Events fuer den Klassenraum (T-6.5, W2-T6).
 * Speichert Metriken in classroom_telemetry (getrennt von
 * audit_log – der ist fuer Admin-Aktionen).
 *
 * Verwendung:
 *   import { trackEvent, getAdminStats } from './telemetry.js'
 *   trackEvent('classroom_session_created', { sessionId, teacherId, payload: { mode } })
 *
 * Fehler beim Schreiben werden geloggt aber nie geworfen – Telemetrie darf
 * den Request-Pfad nicht blockieren.
 *
 * Erfolgsmetriken (§14):
 *   - Aktivierungsrate:  sessions mit classroom_session_started UND participantCount >= 3
 *                        relativ zu eingeladenen Lehrern
 *   - Completion-Rate:   (Schüler mit classroom_session_finished-Teilnahme)
 *                        / (Schüler mit classroom_join_succeeded)
 *   - Wiederholungsabsicht: codiert aus Interview (T-6.7), KEIN automatisches Signal
 *
 * Events (W2-T6-Erweiterung):
 *   classroom_session_created, classroom_session_started, classroom_session_finished
 *   classroom_session_paused, classroom_session_resumed
 *   classroom_assignment_changed
 *   classroom_join_attempted, classroom_join_succeeded, classroom_join_failed
 *   classroom_participant_reconnected, classroom_participant_dropped
 *   classroom_submission_received
 *   classroom_session_abandoned
 *
 * Keine personenbezogenen Klarnamen – participantId ist pseudonym.
 */

import db from '../db.js'
import logger from '../logger.js'

// ── Prepared Statements ──────────────────────────────────────────

const stmts = {
  insert: db.prepare(`
    INSERT INTO classroom_telemetry (ts, event, session_id, teacher_id, payload_json)
    VALUES (@ts, @event, @sessionId, @teacherId, @payloadJson)
  `),
  // Aggregate: Aktivierungsrate – Sessions mit Start UND >= minParticipants
  activationRate: db.prepare(`
    SELECT
      COUNT(DISTINCT t_created.session_id) AS sessions_created,
      COUNT(DISTINCT t_started.session_id) AS sessions_started,
      CAST(COUNT(DISTINCT t_started.session_id) AS REAL)
        / MAX(COUNT(DISTINCT t_created.session_id), 1) AS activation_rate
    FROM classroom_telemetry t_created
    LEFT JOIN classroom_telemetry t_started
      ON  t_started.session_id  = t_created.session_id
      AND t_started.event       = 'classroom_session_started'
      AND CAST(json_extract(t_started.payload_json, '$.participantCount') AS INTEGER) >= @minParticipants
    WHERE t_created.event = 'classroom_session_created'
      AND t_created.ts    >= @since
  `),
  // Aggregate: Completion-Rate – Joins vs. Sessions die finished wurden
  completionRate: db.prepare(`
    SELECT
      COUNT(CASE WHEN event = 'classroom_join_succeeded' THEN 1 END)  AS total_joins,
      COUNT(CASE WHEN event = 'classroom_session_finished' THEN 1 END) AS finished_events,
      CAST(COUNT(CASE WHEN event = 'classroom_session_finished' THEN 1 END) AS REAL)
        / MAX(COUNT(CASE WHEN event = 'classroom_join_succeeded' THEN 1 END), 1) AS completion_rate
    FROM classroom_telemetry
    WHERE event IN ('classroom_join_succeeded', 'classroom_session_finished')
      AND ts >= @since
  `),
  // Rohe Event-Liste fuer Debugging
  recentEvents: db.prepare(`
    SELECT id, ts, event, session_id, teacher_id, payload_json
    FROM classroom_telemetry
    WHERE ts >= @since
    ORDER BY ts DESC
    LIMIT @limit
  `),

  // ── Admin-Dashboard-Queries (W2-T6) ─────────────────────────────

  // Sessions pro Tag (direkt aus classroom_session, zuverlaessiger als Events)
  sessionsPerDay: db.prepare(`
    SELECT
      date(created_at / 1000, 'unixepoch') AS day,
      COUNT(*) AS count
    FROM classroom_session
    WHERE created_at >= @since AND created_at <= @until
    GROUP BY day
    ORDER BY day
  `),

  // Status-Breakdown
  statusBreakdown: db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM classroom_session
    WHERE created_at >= @since AND created_at <= @until
    GROUP BY status
  `),

  // Sessions pro Lehrer (pseudonym: nur teacher_user_id + Anzahl, kein Klarname)
  sessionsPerTeacher: db.prepare(`
    SELECT teacher_user_id AS teacherId, COUNT(*) AS n
    FROM classroom_session
    WHERE created_at >= @since AND created_at <= @until
    GROUP BY teacher_user_id
  `),

  // Beliebteste Modi (aus classroom_assignment)
  modePopularity: db.prepare(`
    SELECT a.mode, COUNT(*) AS count
    FROM classroom_assignment a
    JOIN classroom_session s ON s.id = a.session_id
    WHERE s.created_at >= @since AND s.created_at <= @until
    GROUP BY a.mode
    ORDER BY count DESC
  `),

  // Ø-Teilnehmer pro Session (nur Sessions die gestartet wurden)
  avgParticipants: db.prepare(`
    SELECT
      AVG(participant_count) AS avg_participants,
      SUM(participant_count) AS total_joins
    FROM (
      SELECT session_id, COUNT(*) AS participant_count
      FROM classroom_participant p
      JOIN classroom_session s ON s.id = p.session_id
      WHERE s.created_at >= @since AND s.created_at <= @until
      GROUP BY session_id
    )
  `),

  // Auto-End-Quote: reason aus classroom_session_finished-Events
  finishReasons: db.prepare(`
    SELECT
      json_extract(payload_json, '$.reason') AS reason,
      COUNT(*) AS count
    FROM classroom_telemetry
    WHERE event = 'classroom_session_finished'
      AND ts >= @since AND ts <= @until
    GROUP BY reason
  `),

  // Reconnect-Quote: Reconnects vs. Joins
  reconnectStats: db.prepare(`
    SELECT
      COUNT(CASE WHEN event = 'classroom_participant_reconnected' THEN 1 END) AS reconnects,
      COUNT(CASE WHEN event = 'classroom_participant_dropped'    THEN 1 END) AS dropped,
      COUNT(CASE WHEN event = 'classroom_join_succeeded'         THEN 1 END) AS total_joins
    FROM classroom_telemetry
    WHERE event IN ('classroom_participant_reconnected', 'classroom_participant_dropped', 'classroom_join_succeeded')
      AND ts >= @since AND ts <= @until
  `),

  // Submissions: Anzahl und Korrektheit
  submissionStats: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN json_extract(payload_json, '$.correct') = 1 THEN 1 ELSE 0 END) AS correct_count
    FROM classroom_telemetry
    WHERE event = 'classroom_submission_received'
      AND ts >= @since AND ts <= @until
  `),
}

// ── Kern-Funktion ────────────────────────────────────────────────

/**
 * Schreibt ein Telemetrie-Event in classroom_telemetry.
 * Niemals werfend — Fehler werden nur geloggt.
 *
 * @param {string} event       – Event-Name (z. B. 'classroom_session_created')
 * @param {object} [opts]
 * @param {string} [opts.sessionId]
 * @param {string} [opts.teacherId]
 * @param {object} [opts.payload] – Event-spezifische Daten
 */
export function trackEvent(event, { sessionId = null, teacherId = null, payload = {} } = {}) {
  try {
    stmts.insert.run({
      ts:          Date.now(),
      event,
      sessionId:   sessionId ?? null,
      teacherId:   teacherId ?? null,
      payloadJson: JSON.stringify(payload),
    })
  } catch (err) {
    logger.error({ err, event, sessionId }, 'classroom telemetry write failed')
  }
}

// ── Convenience-Exports (je Event ein benannter Wrapper) ─────────

/** Lehrer legt eine neue Session an. */
export function trackSessionCreated(sessionId, teacherId) {
  trackEvent('classroom_session_created', { sessionId, teacherId, payload: {} })
}

/** Join-Versuch (vor DB-Lookup). Wird immer gerufen, egal ob er klappt. */
// Der Join-Code wird bewusst NICHT persistiert (Security N1): er ist zwar ein
// öffentlicher Beamer-Identifier, würde aber das Session-Ende dauerhaft
// überleben (Retention rührt Telemetrie nicht an) — für die Metriken unnötig.
export function trackJoinAttempted(_code) {
  trackEvent('classroom_join_attempted', {})
}

/** Join hat geklappt — Participant ist angelegt. */
export function trackJoinSucceeded(sessionId, participantId) {
  trackEvent('classroom_join_succeeded', { sessionId, payload: { participantId } })
}

/**
 * Join ist fehlgeschlagen.
 * @param {'invalid_code'|'session_full'|'session_not_running'|'rate_limited'|'unknown'} reason
 */
export function trackJoinFailed(_code, reason) {
  trackEvent('classroom_join_failed', { payload: { reason } })
}

/** Lehrer startet die Session (locked_at gesetzt). */
export function trackSessionStarted(sessionId, teacherId, participantCount) {
  trackEvent('classroom_session_started', { sessionId, teacherId, payload: { participantCount } })
}

/**
 * Lehrer beendet die Session manuell oder System-Auto-End.
 * @param {number} durationMs     – Zeit von started_at bis jetzt
 * @param {number} completionRate – Anteil Schüler mit letzter Submission (0–1)
 * @param {string} reason         – 'manual' | 'completed' | 'auto' | 'aborted'
 */
export function trackSessionFinished(sessionId, teacherId, { durationMs, completionRate, reason } = {}) {
  trackEvent('classroom_session_finished', {
    sessionId,
    teacherId,
    payload: { durationMs, completionRate, reason: reason ?? 'manual' },
  })
}

/** Session pausiert (W2-T3). */
export function trackSessionPaused(sessionId, teacherId) {
  trackEvent('classroom_session_paused', { sessionId, teacherId, payload: {} })
}

/** Session wieder aufgenommen (W2-T3). */
export function trackSessionResumed(sessionId, teacherId) {
  trackEvent('classroom_session_resumed', { sessionId, teacherId, payload: {} })
}

/**
 * Modus-Wechsel innerhalb einer laufenden Session (W2-T2).
 * @param {number} fromIndex – bisheriger Assignment-Index
 * @param {number} toIndex   – neuer Assignment-Index
 * @param {string} mode      – Modus des neuen Assignments
 */
export function trackAssignmentChanged(sessionId, teacherId, { fromIndex, toIndex, mode } = {}) {
  trackEvent('classroom_assignment_changed', {
    sessionId,
    teacherId,
    payload: { fromIndex, toIndex, mode },
  })
}

/**
 * Schüler hat sich innerhalb des Reconnect-Windows (5 Min, D6) neu verbunden.
 * participantId ist pseudonymisiert (kein displayName).
 */
export function trackParticipantReconnected(sessionId, participantId) {
  trackEvent('classroom_participant_reconnected', {
    sessionId,
    payload: { participantId },
  })
}

/**
 * Reconnect-Window ist abgelaufen – Schüler endgültig entfernt.
 * participantId ist pseudonymisiert (kein displayName).
 */
export function trackParticipantDropped(sessionId, participantId) {
  trackEvent('classroom_participant_dropped', {
    sessionId,
    payload: { participantId },
  })
}

/**
 * Submission eingegangen (W2-T6). Nur mode und correct – kein participantId,
 * kein lemmaId (vermeidet personenbezogene Verkettbarkeit).
 * @param {string} mode    – Spielmodus
 * @param {boolean} correct – ob die Antwort korrekt war
 */
export function trackSubmissionReceived(sessionId, { mode, correct } = {}) {
  trackEvent('classroom_submission_received', {
    sessionId,
    payload: { mode, correct: correct ? 1 : 0 },
  })
}

/**
 * Session wurde als abandoned markiert (z. B. Auto-End nach Inaktivität).
 * @param {number} lastActivityAgo – Ms seit letzter Aktivität
 */
export function trackSessionAbandoned(sessionId, teacherId, lastActivityAgo) {
  trackEvent('classroom_session_abandoned', {
    sessionId,
    teacherId,
    payload: { lastActivityAgo },
  })
}

// ── Aggregate-Queries (§14-Metriken) ────────────────────────────

/**
 * Gibt die §14-Erfolgsmetriken fuer einen Zeitraum zurueck.
 *
 * @param {object} [opts]
 * @param {number} [opts.since]           – Unix-Ms (default: 30 Tage)
 * @param {number} [opts.minParticipants] – Min. Teilnehmer fuer "echten" Start (default: 3)
 * @returns {{ activationRate, completionRate, sessionsCreated, sessionsStarted, totalJoins }}
 */
export function getMetrics({ since, minParticipants = 3 } = {}) {
  const sinceMs = since ?? Date.now() - 30 * 24 * 60 * 60 * 1000

  try {
    const act  = stmts.activationRate.get({ since: sinceMs, minParticipants })
    const comp = stmts.completionRate.get({ since: sinceMs })

    return {
      sessionsCreated:  act?.sessions_created  ?? 0,
      sessionsStarted:  act?.sessions_started  ?? 0,
      activationRate:   act?.activation_rate   ?? 0,
      totalJoins:       comp?.total_joins      ?? 0,
      completionRate:   comp?.completion_rate  ?? 0,
    }
  } catch (err) {
    logger.error({ err }, 'classroom telemetry getMetrics failed')
    return { sessionsCreated: 0, sessionsStarted: 0, activationRate: 0, totalJoins: 0, completionRate: 0 }
  }
}

/**
 * Lehrer-Aktivitaet im Zeitraum (Daten-Instrumentierung).
 * Pseudonym: liefert nur Zahlen/Verteilungen, keine teacher_user_id-Liste,
 * keine Klarnamen oder E-Mails.
 *
 * @param {object} [opts]
 * @param {number} [opts.days]   – Zeitraum in Tagen (default: 30)
 * @param {number} [opts.since]  – Unix-Ms explizit (ueberschreibt days)
 * @param {number} [opts.until]  – Unix-Ms (default: jetzt)
 * @returns {{ period, uniqueTeachers, totalSessions, avgSessionsPerTeacher, histogram }}
 */
export function getTeacherStats({ days = 30, since, until } = {}) {
  const untilMs = until ?? Date.now()
  const sinceMs = since ?? untilMs - days * 24 * 60 * 60 * 1000

  try {
    const rows = stmts.sessionsPerTeacher.all({ since: sinceMs, until: untilMs })

    // Sessions-pro-Lehrer-Histogramm: 1-5 / 6-20 / 20+
    const histogram = { '1-5': 0, '6-20': 0, '20+': 0 }
    let totalSessions = 0
    for (const r of rows) {
      const n = Number(r.n) || 0
      totalSessions += n
      if (n <= 5) histogram['1-5'] += 1
      else if (n <= 20) histogram['6-20'] += 1
      else histogram['20+'] += 1
    }

    const uniqueTeachers = rows.length
    const avgSessionsPerTeacher = uniqueTeachers > 0
      ? Math.round((totalSessions / uniqueTeachers) * 10) / 10
      : null

    return {
      period: { days, sinceMs, untilMs },
      uniqueTeachers,
      totalSessions,
      avgSessionsPerTeacher,
      histogram,
    }
  } catch (err) {
    logger.error({ err }, 'classroom telemetry getTeacherStats failed')
    return null
  }
}

/**
 * Rohe Event-Liste der letzten N Events (fuer Admin-Panel / Debugging).
 * @param {object} [opts]
 * @param {number} [opts.since]  – Unix-Ms
 * @param {number} [opts.limit]  – default 100
 */
export function getRecentEvents({ since, limit = 100 } = {}) {
  const sinceMs = since ?? Date.now() - 7 * 24 * 60 * 60 * 1000
  try {
    return stmts.recentEvents.all({ since: sinceMs, limit }).map(row => ({
      id:        row.id,
      ts:        row.ts,
      event:     row.event,
      sessionId: row.session_id,
      teacherId: row.teacher_id,
      payload:   JSON.parse(row.payload_json || '{}'),
    }))
  } catch (err) {
    logger.error({ err }, 'classroom telemetry getRecentEvents failed')
    return []
  }
}

/**
 * Admin-Dashboard-Aggregate (W2-T6).
 * Hybrid-Queries: direkte Tabellen (classroom_session, classroom_assignment,
 * classroom_participant) fuer stabile Zaehler + classroom_telemetry fuer
 * Event-spezifische Metriken (reconnect, auto-end, submission).
 *
 * @param {object} [opts]
 * @param {number} [opts.days]   – Zeitraum in Tagen (default: 30)
 * @param {number} [opts.since]  – Unix-Ms explizit (ueberschreibt days)
 * @param {number} [opts.until]  – Unix-Ms (default: jetzt)
 */
export function getAdminStats({ days = 30, since, until } = {}) {
  const untilMs = until ?? Date.now()
  const sinceMs = since ?? untilMs - days * 24 * 60 * 60 * 1000
  const params  = { since: sinceMs, until: untilMs }

  try {
    const perDay        = stmts.sessionsPerDay.all(params)
    const statusRows    = stmts.statusBreakdown.all(params)
    const modeRows      = stmts.modePopularity.all(params)
    const partRow       = stmts.avgParticipants.get(params)
    const reasonRows    = stmts.finishReasons.all(params)
    const reconnRow     = stmts.reconnectStats.get(params)
    const submitRow     = stmts.submissionStats.get(params)

    // Status-Breakdown als Objekt
    const byStatus = { lobby: 0, running: 0, paused: 0, finished: 0, aborted: 0 }
    for (const r of statusRows) {
      if (r.status in byStatus) byStatus[r.status] = Number(r.count)
    }
    const totalSessions = Object.values(byStatus).reduce((a, b) => a + b, 0)

    // Auto-End-Gruende
    const byReason = {}
    for (const r of reasonRows) {
      byReason[r.reason ?? 'unknown'] = Number(r.count)
    }

    // Teilnehmer-Statistik
    const totalJoins      = Number(partRow?.total_joins ?? 0)
    const avgParticipants = partRow?.avg_participants != null
      ? Math.round(partRow.avg_participants * 10) / 10
      : null

    // Reconnect-Quote
    const reconnects  = Number(reconnRow?.reconnects ?? 0)
    const dropped     = Number(reconnRow?.dropped    ?? 0)
    const joinEvents  = Number(reconnRow?.total_joins ?? 0)
    const reconnectRate = joinEvents > 0
      ? Math.round((reconnects / joinEvents) * 1000) / 1000
      : 0

    // Submission-Statistik
    const submitTotal   = Number(submitRow?.total        ?? 0)
    const submitCorrect = Number(submitRow?.correct_count ?? 0)
    const correctPct    = submitTotal > 0
      ? Math.round((submitCorrect / submitTotal) * 1000) / 1000
      : null

    return {
      period: {
        days,
        sinceMs,
        untilMs,
      },
      sessions: {
        total:    totalSessions,
        perDay:   perDay.map(r => ({ day: r.day, count: Number(r.count) })),
        byStatus,
        byReason,
      },
      participants: {
        totalJoins,
        avgPerSession: avgParticipants,
        reconnects,
        dropped,
        reconnectRate,
      },
      modes: modeRows.map(r => ({ mode: r.mode, count: Number(r.count) })),
      submissions: {
        total:      submitTotal,
        correct:    submitCorrect,
        correctPct,
      },
    }
  } catch (err) {
    logger.error({ err }, 'classroom telemetry getAdminStats failed')
    return null
  }
}
