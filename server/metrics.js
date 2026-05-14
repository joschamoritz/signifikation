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
