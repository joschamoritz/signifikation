/**
 * server/jobs/classroomRetention.js
 *
 * E1 / D9 (W4): Zweistufiges Aufraeumen beendeter Klassenraum-Sessions.
 *   Stufe A — 24 h nach finished_at: display_name anonymisieren
 *             (einziger potenzielle Klarname Minderjaehriger). Die Frist steht
 *             in store.js (DEFAULT_NAME_ANONYMIZE_MS); dieser Kommentar nannte
 *             faelschlich 48 h und hat darueber auch die Datenschutzerklaerung
 *             in die Irre gefuehrt.
 *   Stufe B — 30 Tage nach finished_at: ganze Session hart loeschen
 *             (CASCADE raeumt Participants/Submissions/Scores/… mit).
 *   Stufe D — 30 Tage: teacher_id in classroom_telemetry auf NULL.
 *
 * Warum ein periodischer Sweep statt setTimeout pro Session (analog
 * classroomAutoEnd.js):
 *   - Neustart-fest: gerechnet wird gegen den persistierten finished_at,
 *     nicht gegen einen In-Memory-Timer. Vor einem Neustart faellige
 *     Sessions werden beim naechsten Lauf nachgeholt.
 *   - Idempotent: Stufe A ueberschreibt nur noch nicht anonymisierte Namen;
 *     Stufe B loescht nur ueberfaellige Sessions. Mehrfach-Laeufe schaden nie.
 *
 * Datenschutz-Hintergrund: classroom_telemetry enthaelt keine participant_id,
 * also keinen Bezug zu einzelnen Schueler:innen. Ueber teacher_id bestand aber
 * ein direkter Personenbezug zur Lehrkraft ohne jede Loeschfrist — den raeumt
 * jetzt Stufe D ab. Die Events selbst bleiben als Traeger der §14-Metriken.
 */

import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import {
  runClassroomRetention,
  DEFAULT_NAME_ANONYMIZE_MS,
  DEFAULT_HARD_DELETE_MS,
  DEFAULT_LOBBY_ABANDON_MS,
  DEFAULT_TELEMETRY_ANONYMIZE_MS,
} from '../classroom/store.js'

// Einmal pro Tag reicht — die Fenster sind 24 h / 30 Tage / 7 Tage, nicht
// minutengenau. Wegen des Tagesintervalls kann die 24-h-Anonymisierung real bis
// zu 48 h nach Sitzungsende greifen; die Nutzertexte nennen deshalb
// „spaetestens zwei Tage“ als Obergrenze.
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

export function startClassroomRetention(options = {}) {
  const intervalMs        = options.intervalMs        ?? DEFAULT_SWEEP_INTERVAL_MS
  const anonymizeAfterMs  = options.anonymizeAfterMs  ?? DEFAULT_NAME_ANONYMIZE_MS
  const hardDeleteAfterMs = options.hardDeleteAfterMs ?? DEFAULT_HARD_DELETE_MS
  const lobbyAbandonMs    = options.lobbyAbandonMs    ?? DEFAULT_LOBBY_ABANDON_MS
  const telemetryAnonymizeAfterMs = options.telemetryAnonymizeAfterMs ?? DEFAULT_TELEMETRY_ANONYMIZE_MS

  const run = () => {
    try {
      runClassroomRetention({ anonymizeAfterMs, hardDeleteAfterMs, lobbyAbandonMs, telemetryAnonymizeAfterMs })
    } catch (err) {
      logger.warn({ err }, 'classroom Retention-Sweep fehlgeschlagen')
      // Bei Dauerfehler bliebe Klarname Minderjähriger über die 24h-Frist
      // hinaus stehen (DSGVO) — darum laut alerten statt nur loggen.
      reportAlert('classroom_retention_failed', `Klassenraum-Retention-Sweep fehlgeschlagen: ${err?.message || err}`)
    }
  }

  run() // direkt beim Start: holt vor einem Neustart faellig gewordene Sessions nach
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startClassroomRetention
