/**
 * server/jobs/classroomAutoEnd.js
 *
 * W2-T3 / D8: Beendet laufende Klassenraum-Sessions automatisch nach
 * 90 Min ohne Aktivitaet.
 *
 * Warum ein periodischer Sweep statt ein setTimeout pro Session:
 *   - Neustart-fest: Ein In-Memory-Timer ginge bei jedem Deploy/Crash
 *     verloren; eine vor dem Neustart inaktiv gewordene Session bliebe
 *     ewig 'running'. Der Sweep rechnet gegen den persistierten
 *     last_activity_at-Timestamp (Migration 0007) und holt solche
 *     Sessions beim naechsten Lauf nach.
 *   - Kein Timer-Drift, keine Timer-Leaks bei vielen Sessions.
 *   - autoEndStaleSessions() ist serverautoritativ und idempotent:
 *     beendet nur, was wirklich abgelaufen ist (atomar pro Session).
 *
 * Der Sweep laeuft einmal beim Boot und danach im Intervall. Pro
 * beendeter Session wird session:finished an Schueler- und Teacher-Room
 * gebroadcastet (reason: 'auto_timeout').
 */

import logger from '../logger.js'
import { autoEndStaleSessions, DEFAULT_AUTO_END_IDLE_MS } from '../classroom/store.js'
import { notifySessionFinished } from '../realtime/classroomSocket.js'

const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000 // alle 5 Min pruefen

export function startClassroomAutoEnd(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
  const maxIdleMs  = options.maxIdleMs  ?? DEFAULT_AUTO_END_IDLE_MS

  const run = () => {
    try {
      const { ended } = autoEndStaleSessions({ maxIdleMs })
      for (const session of ended) {
        notifySessionFinished(session.id, {
          sessionId:  session.id,
          finishedAt: session.finishedAt,
          reason:     'auto_timeout',
        })
      }
      if (ended.length > 0) {
        logger.info({ count: ended.length }, 'cr2 Auto-End: Sessions beendet')
      }
    } catch (err) {
      logger.warn({ err }, 'cr2 Auto-End-Sweep fehlgeschlagen')
    }
  }

  run() // direkt beim Start: holt Sessions nach, die vor einem Neustart abliefen
  const interval = setInterval(run, intervalMs)
  interval.unref()
  return interval
}

export default startClassroomAutoEnd
