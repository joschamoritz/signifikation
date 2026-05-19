/**
 * Alerting – prüft alle 60s Systemmetriken gegen Schwellwerte.
 * Bei Überschreitung wird ein POST an ALERT_WEBHOOK_URL gesendet.
 * Pro Alert-Typ gilt ein 30-Minuten-Cooldown.
 *
 * Schwellwerte:
 *   EVENT_LOOP_LAG_THRESHOLD_MS  – Event-Loop-Lag avg (Standard: 100 ms)
 *   QUEUE_STALL_THRESHOLD_MS     – ältester offener Export-Job (Standard: 10 min)
 */
import db from './db.js'
import logger from './logger.js'
import { getEventLoopLagMs } from './metrics.js'

const WEBHOOK_URL          = (process.env.ALERT_WEBHOOK_URL || '').trim()
const CHECK_INTERVAL_MS    = 60_000
const COOLDOWN_MS          = 30 * 60_000
const LAG_THRESHOLD_MS     = Number(process.env.EVENT_LOOP_LAG_THRESHOLD_MS  || 100)
const STALL_THRESHOLD_MS   = Number(process.env.QUEUE_STALL_THRESHOLD_MS     || 10 * 60_000)

const lastAlertAt = new Map()

const oldestPendingStmt = db.prepare(`
  SELECT MIN(created_at) AS oldest
  FROM classroom_exports
  WHERE status IN ('queued', 'running')
`)

const newFailuresSinceStmt = db.prepare(`
  SELECT COUNT(*) AS n
  FROM classroom_exports
  WHERE status = 'failed'
    AND finished_at >= ?
`)

function canAlert(type) {
  const last = lastAlertAt.get(type) ?? 0
  return Date.now() - last >= COOLDOWN_MS
}

function markAlerted(type) {
  lastAlertAt.set(type, Date.now())
}

async function sendAlert(type, message) {
  if (!WEBHOOK_URL) {
    logger.warn({ type, message }, 'Alert ausgelöst – kein ALERT_WEBHOOK_URL konfiguriert')
    return
  }
  try {
    const body = JSON.stringify({
      type,
      message,
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
    })
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    logger.info({ type }, 'Alert gesendet')
  } catch (err) {
    logger.error({ err, type }, 'Alert-Webhook fehlgeschlagen')
  }
}

function check(lastCheckAt) {
  try {
    const lagMs = getEventLoopLagMs()
    if (lagMs !== null && lagMs > LAG_THRESHOLD_MS && canAlert('event_loop_lag')) {
      markAlerted('event_loop_lag')
      sendAlert('event_loop_lag', `Event-Loop-Lag kritisch: ${lagMs} ms (Schwelle: ${LAG_THRESHOLD_MS} ms)`)
    }
  } catch (err) {
    logger.warn({ err }, 'Alerting: Event-Loop-Check fehlgeschlagen')
  }

  try {
    const oldest = oldestPendingStmt.get()?.oldest ?? null
    const ageMs = oldest ? Date.now() - oldest : null
    if (ageMs !== null && ageMs > STALL_THRESHOLD_MS && canAlert('queue_stalled')) {
      markAlerted('queue_stalled')
      const ageMin = Math.round(ageMs / 60_000)
      sendAlert('queue_stalled', `Export-Queue hängt: ältester Job ${ageMin} min alt (Schwelle: ${Math.round(STALL_THRESHOLD_MS / 60_000)} min)`)
    }
  } catch (err) {
    logger.warn({ err }, 'Alerting: Queue-Stall-Check fehlgeschlagen')
  }

  try {
    const failures = newFailuresSinceStmt.get(lastCheckAt)?.n ?? 0
    if (failures > 0 && canAlert('export_failures')) {
      markAlerted('export_failures')
      sendAlert('export_failures', `${failures} neue Export-Fehler in den letzten 60 Sekunden`)
    }
  } catch (err) {
    logger.warn({ err }, 'Alerting: Export-Fehler-Check fehlgeschlagen')
  }
}

export function startAlerting() {
  if (!WEBHOOK_URL) {
    logger.info('Alerting deaktiviert – ALERT_WEBHOOK_URL nicht gesetzt')
    return
  }
  let lastCheckAt = Date.now()
  const timer = setInterval(() => {
    const now = Date.now()
    check(lastCheckAt)
    lastCheckAt = now
  }, CHECK_INTERVAL_MS)
  timer.unref()
  logger.info({ lagThresholdMs: LAG_THRESHOLD_MS, stallThresholdMs: STALL_THRESHOLD_MS }, 'Alerting gestartet')
}
