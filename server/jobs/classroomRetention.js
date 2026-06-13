/**
 * server/jobs/classroomRetention.js
 *
 * E1 / D9 (W4): Zweistufiges Aufraeumen beendeter Klassenraum-Sessions.
 *   Stufe A — 48 h nach finished_at: display_name anonymisieren
 *             (einziger potenzielle Klarname Minderjaehriger).
 *   Stufe B — 30 Tage nach finished_at: ganze Session hart loeschen
 *             (CASCADE raeumt Participants/Submissions/Scores/… mit).
 *
 * Warum ein periodischer Sweep statt setTimeout pro Session (analog
 * classroomAutoEnd.js):
 *   - Neustart-fest: gerechnet wird gegen den persistierten finished_at,
 *     nicht gegen einen In-Memory-Timer. Vor einem Neustart faellige
 *     Sessions werden beim naechsten Lauf nachgeholt.
 *   - Idempotent: Stufe A ueberschreibt nur noch nicht anonymisierte Namen;
 *     Stufe B loescht nur ueberfaellige Sessions. Mehrfach-Laeufe schaden nie.
 *
 * Datenschutz-Hintergrund: classroom_telemetry bleibt unberuehrt — bereits
 * pseudonym (kein display_name) und Traeger der §14-Metriken.
 */

import logger from '../logger.js'
import {
  runClassroomRetention,
  DEFAULT_NAME_ANONYMIZE_MS,
  DEFAULT_HARD_DELETE_MS,
  DEFAULT_LOBBY_ABANDON_MS,
} from '../classroom/store.js'

// Einmal pro Tag reicht — die Fenster sind 48 h / 30 Tage / 7 Tage, nicht minutengenau.
const DEFAULT_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

export function startClassroomRetention(options = {}) {
  const intervalMs        = options.intervalMs        ?? DEFAULT_SWEEP_INTERVAL_MS
  const anonymizeAfterMs  = options.anonymizeAfterMs  ?? DEFAULT_NAME_ANONYMIZE_MS
  const hardDeleteAfterMs = options.hardDeleteAfterMs ?? DEFAULT_HARD_DELETE_MS
  const lobbyAbandonMs    = options.lobbyAbandonMs    ?? DEFAULT_LOBBY_ABANDON_MS

  const run = () => {
    try {
      runClassroomRetention({ anonymizeAfterMs, hardDeleteAfterMs, lobbyAbandonMs })
    } catch (err) {
      logger.warn({ err }, 'classroom Retention-Sweep fehlgeschlagen')
    }
  }

  run() // direkt beim Start: holt vor einem Neustart faellig gewordene Sessions nach
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startClassroomRetention
