/**
 * server/classroom/telemetry.js
 *
 * Telemetrie-Events fuer den Klassenraum (T-6.5, W2-T6).
 * Speichert Metriken in classroom_telemetry (getrennt von
 * audit_log – der ist fuer Admin-Aktionen).
 *
 * Verwendung:
 *   import { trackEvent, getKlassenraumAuswertung } from './telemetry.js'
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
import { berlinTag, plusTage, tageVonBis, berlinMitternachtMs } from '../date-utils.js'

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
  // Rolle einer Lehrkraft (für die Markierung "admin" am Ereignis; die Kennung selbst wird nach 30 Tagen gelöscht)
  teacherRole: db.prepare(`SELECT role FROM user_profiles WHERE user_id = ?`),
  // Rohe Event-Liste fuer Debugging
  recentEvents: db.prepare(`
    SELECT id, ts, event, session_id, teacher_id, payload_json
    FROM classroom_telemetry
    WHERE ts >= @since
    ORDER BY ts DESC
    LIMIT @limit
  `),

  // ── Auswertung › Klassenraum (Schritt 8) ────────────────────────
  // Gezählt wird aus der Telemetrie (24 Monate): Sie bleibt, wenn die Sitzung selbst 30 Tage nach dem Ende
  // gelöscht wird. @admin ist eine JSON-Liste der Sitzungen von Admin-Konten; sie zählen nicht mit.

  // Sitzungen von Admin-Konten: Markierung am Ereignis (bleibt), Kennung am Ereignis (30 Tage) und die Sitzung selbst
  adminSitzungen: db.prepare(`
    SELECT session_id AS sid FROM classroom_telemetry
    WHERE event = 'classroom_session_created' AND session_id IS NOT NULL
      AND (json_extract(payload_json, '$.admin') = 1
           OR teacher_id IN (SELECT user_id FROM user_profiles WHERE role = 'admin'))
    UNION
    SELECT id AS sid FROM classroom_session
    WHERE teacher_user_id IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
  `),

  // Angelegte Sitzungen (ein Zeitpunkt je Sitzung)
  auswErstellt: db.prepare(`
    SELECT session_id AS sid, MIN(ts) AS ts
    FROM classroom_telemetry
    WHERE event = 'classroom_session_created' AND ts BETWEEN @since AND @until
      AND session_id NOT IN (SELECT value FROM json_each(@admin))
    GROUP BY session_id
  `),

  // Teilnehmer beim Start (erstes Start-Ereignis je Sitzung)
  auswGestartet: db.prepare(`
    SELECT session_id AS sid, CAST(json_extract(payload_json, '$.participantCount') AS INTEGER) AS n
    FROM classroom_telemetry
    WHERE event = 'classroom_session_started' AND ts BETWEEN @since AND @until
      AND session_id NOT IN (SELECT value FROM json_each(@admin))
    ORDER BY ts, id
  `),

  // Wie Sitzungen enden (erstes Ende-Ereignis je Sitzung)
  auswBeendet: db.prepare(`
    SELECT session_id AS sid, json_extract(payload_json, '$.reason') AS grund
    FROM classroom_telemetry
    WHERE event = 'classroom_session_finished' AND ts BETWEEN @since AND @until
      AND session_id NOT IN (SELECT value FROM json_each(@admin))
    ORDER BY ts, id
  `),

  // Verbindungen
  auswVerbindungen: db.prepare(`
    SELECT
      COUNT(CASE WHEN event = 'classroom_join_succeeded'         THEN 1 END) AS beitritte,
      COUNT(CASE WHEN event = 'classroom_participant_reconnected' THEN 1 END) AS wiederverbunden,
      COUNT(CASE WHEN event = 'classroom_participant_dropped'    THEN 1 END) AS verloren
    FROM classroom_telemetry
    WHERE event IN ('classroom_join_succeeded', 'classroom_participant_reconnected', 'classroom_participant_dropped')
      AND ts BETWEEN @since AND @until
      AND session_id NOT IN (SELECT value FROM json_each(@admin))
  `),

  // Antworten je Modus; Aufgaben = Aufgaben mit mindestens einer Antwort (ältere Ereignisse ohne Aufgabe: je Sitzung und Modus eine)
  auswAntworten: db.prepare(`
    SELECT
      json_extract(payload_json, '$.mode') AS modus,
      COUNT(*) AS antworten,
      SUM(CASE WHEN json_extract(payload_json, '$.correct') = 1 THEN 1 ELSE 0 END) AS richtig,
      COUNT(DISTINCT session_id || ':' || COALESCE(json_extract(payload_json, '$.assignmentId'), json_extract(payload_json, '$.mode'))) AS aufgaben
    FROM classroom_telemetry
    WHERE event = 'classroom_submission_received' AND ts BETWEEN @since AND @until
      AND session_id NOT IN (SELECT value FROM json_each(@admin))
    GROUP BY modus
  `),

  // Noch offene Sitzungen (Warteraum oder läuft; "pausiert" ist ein Merkmal von "läuft")
  auswOffen: db.prepare(`
    SELECT COUNT(*) AS n
    FROM classroom_session
    WHERE status IN ('lobby', 'running') AND created_at BETWEEN @since AND @until
      AND id NOT IN (SELECT value FROM json_each(@admin))
  `),

  // Sitzungen je Lehrkraft (nur Zahlen; die Kennung verlässt diese Datei nicht)
  auswLehrkraefte: db.prepare(`
    SELECT COUNT(*) AS n
    FROM classroom_session
    WHERE created_at BETWEEN @since AND @until
      AND id NOT IN (SELECT value FROM json_each(@admin))
    GROUP BY teacher_user_id
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

/**
 * Lehrer legt eine neue Session an.
 * Gehört die Lehrkraft einem Admin-Konto, steht das als `admin: 1` am Ereignis. Die Kennung (teacher_id) wird nach
 * 30 Tagen gelöscht; die Auswertung nimmt Admin-Sitzungen auch danach noch aus den Zahlen.
 */
export function trackSessionCreated(sessionId, teacherId) {
  let admin = false
  try {
    admin = !!teacherId && stmts.teacherRole.get(String(teacherId))?.role === 'admin'
  } catch (err) {
    logger.warn({ err }, 'classroom telemetry: Rolle der Lehrkraft nicht lesbar')
  }
  trackEvent('classroom_session_created', { sessionId, teacherId, payload: admin ? { admin: 1 } : {} })
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
 * @param {string} reason         – 'manual' | 'completed' | 'auto' (Auto-Ende nach Inaktivität, schreibt der Job)
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
 * Submission eingegangen (W2-T6). Nur mode, correct und die Aufgabe (assignmentId) – kein participantId,
 * kein lemmaId (vermeidet personenbezogene Verkettbarkeit). Die Aufgabe braucht die Auswertung, um
 * "Aufgaben" je Modus zu zählen, auch nachdem die Sitzung gelöscht ist.
 * @param {string} mode    – Spielmodus
 * @param {boolean} correct – ob die Antwort korrekt war
 * @param {string} [assignmentId] – Aufgabe innerhalb der Sitzung
 */
export function trackSubmissionReceived(sessionId, { mode, correct, assignmentId } = {}) {
  trackEvent('classroom_submission_received', {
    sessionId,
    payload: { mode, correct: correct ? 1 : 0, ...(assignmentId ? { assignmentId: String(assignmentId) } : {}) },
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

// ── Auswertung › Klassenraum (Schritt 8) ─────────────────────────

/** Lehrkraft-Zahlen gibt es nur so weit zurück, wie die Sitzungen selbst gespeichert werden (30 Tage nach dem Ende gelöscht). */
export const LEHRKRAEFTE_MAX_TAGE = 30
/** Verteilung der Lehrkräfte erst ab so vielen Personen – darunter ließe sich eine einzelne Lehrkraft ablesen. */
export const LEHRKRAEFTE_MIN_GRUPPE = 5

const SPIELMODI_KLASSENRAUM = ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']

/**
 * Auswertung für Auswertung › Klassenraum: Zeitraum = `days` Berliner Kalendertage inklusive heute.
 * Sitzungen, Beendigungen, Teilnehmer, Verbindungen und Antworten kommen aus der Telemetrie (24 Monate);
 * "noch offen" und die Lehrkräfte (nur bis 30 Tage) aus der Tabelle classroom_session. Sitzungen von Admin-Konten
 * zählen nicht mit. Die Antwort enthält nur Summen: keine Sitzungs-, Lehrkraft- oder Teilnehmer-Kennungen.
 *
 * @param {object} [opts]
 * @param {number} [opts.days] – Zeitraum in Tagen (default: 30)
 * @returns {object|null} null bei Datenbankfehlern (geloggt)
 */
export function getKlassenraumAuswertung({ days = 30 } = {}) {
  try {
    const bis = berlinTag()
    const von = plusTage(bis, -(days - 1))
    const admin = JSON.stringify(stmts.adminSitzungen.all().map((r) => r.sid))
    const params = { since: berlinMitternachtMs(von), until: Date.now(), admin }

    // Sitzungen pro Berliner Tag (jeder Tag des Zeitraums)
    const nachTag = new Map(tageVonBis(von, bis).map((datum) => [datum, { datum, sitzungen: 0, teil: datum === bis }]))
    let sitzungen = 0
    const angelegt = new Set()
    for (const r of stmts.auswErstellt.all(params)) {
      const tag = nachTag.get(berlinTag(Number(r.ts)))
      if (!tag) continue
      tag.sitzungen += 1
      sitzungen += 1
      angelegt.add(r.sid)
    }

    // Ø Teilnehmer je gestartete Sitzung (erste Start-Meldung je Sitzung)
    const gestartet = new Map()
    for (const r of stmts.auswGestartet.all(params)) if (!gestartet.has(r.sid)) gestartet.set(r.sid, Number(r.n) || 0)
    const schnitt = gestartet.size
      ? Math.round(([...gestartet.values()].reduce((a, b) => a + b, 0) / gestartet.size) * 10) / 10
      : null

    // Wie Sitzungen enden; unbekannte Gründe gelten als "Lehrkraft beendet" (gleiche Regel wie beim Annehmen).
    // Nur Sitzungen, die im Zeitraum angelegt wurden (dieselbe Menge wie "Sitzungen"): Eine früher angelegte, im
    // Zeitraum beendete Sitzung würde sonst mehr Enden als Sitzungen ergeben.
    const ende = { alleGespielt: 0, lehrkraft: 0, automatisch: 0, offen: 0 }
    const beendet = new Set()
    for (const r of stmts.auswBeendet.all(params)) {
      if (!angelegt.has(r.sid) || beendet.has(r.sid)) continue
      beendet.add(r.sid)
      if (r.grund === 'completed') ende.alleGespielt += 1
      else if (r.grund === 'auto') ende.automatisch += 1
      else ende.lehrkraft += 1
    }
    ende.offen = Number(stmts.auswOffen.get(params)?.n ?? 0)

    const verb = stmts.auswVerbindungen.get(params) || {}

    // Antworten gesamt und je Modus (Reihenfolge wie im Admin; unbekannte Modi zählen nur in der Summe)
    const zeilen = stmts.auswAntworten.all(params)
    let antwortenGesamt = 0
    let richtigGesamt = 0
    for (const r of zeilen) {
      antwortenGesamt += Number(r.antworten || 0)
      richtigGesamt += Number(r.richtig || 0)
    }
    const nachModus = SPIELMODI_KLASSENRAUM
      .map((modus) => {
        const r = zeilen.find((x) => x.modus === modus)
        return r ? { modus, aufgaben: Number(r.aufgaben || 0), antworten: Number(r.antworten || 0), richtig: Number(r.richtig || 0) } : null
      })
      .filter(Boolean)

    // Lehrkräfte: nur für kurze Zeiträume; Gruppen erst ab 5 Personen
    let lehrkraefte = { verfuegbar: false }
    if (days <= LEHRKRAEFTE_MAX_TAGE) {
      const proLehrkraft = stmts.auswLehrkraefte.all(params).map((r) => Number(r.n) || 0)
      lehrkraefte = { verfuegbar: true, anzahl: proLehrkraft.length }
      if (proLehrkraft.length >= LEHRKRAEFTE_MIN_GRUPPE) {
        lehrkraefte.gruppen = {
          '1-5': proLehrkraft.filter((n) => n <= 5).length,
          '6-20': proLehrkraft.filter((n) => n > 5 && n <= 20).length,
          '21+': proLehrkraft.filter((n) => n > 20).length,
        }
      }
    }

    return {
      zeitraum: { days, von, bis, stand: new Date().toISOString() },
      sitzungen: { gesamt: sitzungen, tage: [...nachTag.values()], ende },
      teilnehmer: {
        schnitt,
        beitritte: Number(verb.beitritte || 0),
        wiederverbunden: Number(verb.wiederverbunden || 0),
        verloren: Number(verb.verloren || 0),
      },
      antworten: { gesamt: antwortenGesamt, richtig: richtigGesamt },
      nachModus,
      lehrkraefte,
    }
  } catch (err) {
    logger.error({ err }, 'classroom telemetry getKlassenraumAuswertung failed')
    return null
  }
}
