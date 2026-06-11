/**
 * Alerting – prüft alle 60s Systemmetriken gegen Schwellwerte und bietet
 * mit reportAlert() eine API fuer ereignisbasierte Alerts (Backup-Fehler,
 * Push-Job-Fehler, …). Bei Überschreitung wird ein POST an
 * ALERT_WEBHOOK_URL gesendet. Pro Alert-Typ gilt ein 30-Minuten-Cooldown.
 *
 * Ohne ALERT_WEBHOOK_URL laeuft das Alerting im Log-only-Modus weiter
 * (frueher war es dann komplett deaktiviert — Schwellenverletzungen
 * blieben unsichtbar).
 *
 * Schwellwerte:
 *   EVENT_LOOP_LAG_THRESHOLD_MS  – Event-Loop-Lag avg (Standard: 100 ms)
 *   ERROR_5XX_THRESHOLD          – 5xx-Antworten pro 5 min (Standard: 10)
 */
import logger from './logger.js'
import { getEventLoopLagMs, count5xx } from './metrics.js'

const WEBHOOK_URL          = (process.env.ALERT_WEBHOOK_URL || '').trim()
const CHECK_INTERVAL_MS    = 60_000
const COOLDOWN_MS          = 30 * 60_000
const LAG_THRESHOLD_MS     = Number(process.env.EVENT_LOOP_LAG_THRESHOLD_MS  || 100)
const ERROR_5XX_THRESHOLD  = Number(process.env.ERROR_5XX_THRESHOLD || 10)

const lastAlertAt = new Map()

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

/**
 * Ereignisbasierter Alert (Backup fehlgeschlagen, Push-Job kaputt, …).
 * Respektiert den Cooldown pro Typ; fire-and-forget.
 */
export function reportAlert(type, message) {
  if (!canAlert(type)) return
  markAlerted(type)
  sendAlert(type, message).catch(() => {})
}

function check() {
  try {
    const lagMs = getEventLoopLagMs()
    if (lagMs !== null && lagMs > LAG_THRESHOLD_MS && canAlert('event_loop_lag')) {
      markAlerted('event_loop_lag')
      sendAlert('event_loop_lag', `Event-Loop-Lag kritisch: ${lagMs} ms (Schwelle: ${LAG_THRESHOLD_MS} ms)`)
    }

    const errCount = count5xx()
    if (errCount > ERROR_5XX_THRESHOLD && canAlert('error_5xx_rate')) {
      markAlerted('error_5xx_rate')
      sendAlert('error_5xx_rate', `${errCount} Server-Fehler (5xx) in 5 Minuten (Schwelle: ${ERROR_5XX_THRESHOLD})`)
    }
  } catch (err) {
    logger.warn({ err }, 'Alerting: Check fehlgeschlagen')
  }
}

export function startAlerting() {
  const timer = setInterval(check, CHECK_INTERVAL_MS)
  timer.unref()
  if (!WEBHOOK_URL) {
    logger.warn({ lagThresholdMs: LAG_THRESHOLD_MS }, 'Alerting im Log-only-Modus – ALERT_WEBHOOK_URL nicht gesetzt')
  } else {
    logger.info({ lagThresholdMs: LAG_THRESHOLD_MS, err5xxThreshold: ERROR_5XX_THRESHOLD }, 'Alerting gestartet')
  }
}
