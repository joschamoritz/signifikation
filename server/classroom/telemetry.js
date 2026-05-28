/**
 * server/classroom/telemetry.js
 *
 * Telemetrie-Events fuer den Klassenraum (T-6.5).
 * Speichert Metriken in classroom_telemetry (getrennt von
 * audit_log – der ist fuer Admin-Aktionen).
 *
 * Verwendung:
 *   import { trackEvent, aggregateMetrics } from './telemetry.js'
 *   trackEvent('cr2_session_created', { sessionId, teacherId, payload: { mode } })
 *
 * Fehler beim Schreiben werden geloggt aber nie geworfen – Telemetrie darf
 * den Request-Pfad nicht blockieren.
 *
 * Erfolgsmetriken (§14):
 *   - Aktivierungsrate:  sessions mit cr2_session_started UND participantCount >= 3
 *                        relativ zu eingeladenen Lehrern
 *   - Completion-Rate:   (Schüler mit cr2_session_finished-Teilnahme)
 *                        / (Schüler mit cr2_join_succeeded)
 *   - Wiederholungsabsicht: codiert aus Interview (T-6.7), KEIN automatisches Signal
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
      AND t_started.event       = 'cr2_session_started'
      AND CAST(json_extract(t_started.payload_json, '$.participantCount') AS INTEGER) >= @minParticipants
    WHERE t_created.event = 'cr2_session_created'
      AND t_created.ts    >= @since
  `),
  // Aggregate: Completion-Rate – Joins vs. Sessions die finished wurden
  completionRate: db.prepare(`
    SELECT
      COUNT(CASE WHEN event = 'cr2_join_succeeded' THEN 1 END)  AS total_joins,
      COUNT(CASE WHEN event = 'cr2_session_finished' THEN 1 END) AS finished_events,
      CAST(COUNT(CASE WHEN event = 'cr2_session_finished' THEN 1 END) AS REAL)
        / MAX(COUNT(CASE WHEN event = 'cr2_join_succeeded' THEN 1 END), 1) AS completion_rate
    FROM classroom_telemetry
    WHERE event IN ('cr2_join_succeeded', 'cr2_session_finished')
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
}

// ── Kern-Funktion ────────────────────────────────────────────────

/**
 * Schreibt ein Telemetrie-Event in classroom_telemetry.
 * Niemals werfend — Fehler werden nur geloggt.
 *
 * @param {string} event       – Event-Name (z. B. 'cr2_session_created')
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
    logger.error({ err, event, sessionId }, 'cr2 telemetry write failed')
  }
}

// ── Convenience-Exports (je Event ein benannter Wrapper) ─────────

/** Lehrer legt eine neue Session an. */
export function trackSessionCreated(sessionId, teacherId, { mode } = {}) {
  trackEvent('cr2_session_created', { sessionId, teacherId, payload: { mode } })
}

/** Join-Versuch (vor DB-Lookup). Wird immer gerufen, egal ob er klappt. */
export function trackJoinAttempted(code) {
  trackEvent('cr2_join_attempted', { payload: { code } })
}

/** Join hat geklappt — Participant ist angelegt. */
export function trackJoinSucceeded(sessionId, participantId) {
  trackEvent('cr2_join_succeeded', { sessionId, payload: { participantId } })
}

/**
 * Join ist fehlgeschlagen.
 * @param {'invalid_code'|'session_full'|'session_not_running'|'rate_limited'|'unknown'} reason
 */
export function trackJoinFailed(code, reason) {
  trackEvent('cr2_join_failed', { payload: { code, reason } })
}

/** Lehrer startet die Session (locked_at gesetzt). */
export function trackSessionStarted(sessionId, teacherId, participantCount) {
  trackEvent('cr2_session_started', { sessionId, teacherId, payload: { participantCount } })
}

/**
 * Lehrer beendet die Session manuell oder System-Auto-End.
 * @param {number} durationMs  – Zeit von started_at bis jetzt
 * @param {number} completionRate – Anteil Schüler mit letzter Submission (0–1)
 */
export function trackSessionFinished(sessionId, teacherId, { durationMs, completionRate } = {}) {
  trackEvent('cr2_session_finished', {
    sessionId,
    teacherId,
    payload: { durationMs, completionRate },
  })
}

/**
 * Session wurde als abandoned markiert (z. B. Auto-End nach Inaktivität).
 * @param {number} lastActivityAgo – Ms seit letzter Aktivität
 */
export function trackSessionAbandoned(sessionId, teacherId, lastActivityAgo) {
  trackEvent('cr2_session_abandoned', {
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
    logger.error({ err }, 'cr2 telemetry getMetrics failed')
    return { sessionsCreated: 0, sessionsStarted: 0, activationRate: 0, totalJoins: 0, completionRate: 0 }
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
    logger.error({ err }, 'cr2 telemetry getRecentEvents failed')
    return []
  }
}
