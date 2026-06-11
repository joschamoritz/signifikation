/**
 * Laufzeit-Metriken: Event-Loop-Lag per setImmediate-Sampling.
 * Wird beim ersten Import gestartet; der Timer ist unref'd und blockiert kein Shutdown.
 */

const MAX_SAMPLES = 60 // 60 Sekunden rollierendes Fenster
const _samples = []

function takeSample() {
  const start = process.hrtime.bigint()
  setImmediate(() => {
    const lagMs = Number(process.hrtime.bigint() - start) / 1e6
    _samples.push(lagMs)
    if (_samples.length > MAX_SAMPLES) _samples.shift()
  })
}

const _timer = setInterval(takeSample, 1000)
_timer.unref()

/** Durchschnittlicher Event-Loop-Lag der letzten 60 Sekunden in ms (1 Dezimalstelle). */
export function getEventLoopLagMs() {
  if (_samples.length === 0) return null
  const avg = _samples.reduce((a, b) => a + b, 0) / _samples.length
  return Math.round(avg * 10) / 10
}

/** Letzter gemessener Event-Loop-Lag in ms. */
export function getEventLoopLagLastMs() {
  if (_samples.length === 0) return null
  return Math.round(_samples[_samples.length - 1] * 10) / 10
}

// ── 5xx-Zaehler (rollierendes Fenster) ────────────────────────────
// Gefuettert vom Request-Log-Middleware in index.js; ausgewertet vom
// Alerting (Schwelle pro 5-Minuten-Fenster).

const _errs5xx = []
const MAX_5XX_SAMPLES = 1000

export function track5xx() {
  _errs5xx.push(Date.now())
  if (_errs5xx.length > MAX_5XX_SAMPLES) _errs5xx.shift()
}

/** Anzahl 5xx-Antworten im Fenster (Default: letzte 5 Minuten). */
export function count5xx(windowMs = 5 * 60_000) {
  const cutoff = Date.now() - windowMs
  while (_errs5xx.length > 0 && _errs5xx[0] < cutoff) _errs5xx.shift()
  return _errs5xx.length
}
