// Remote-Debug-Logger: postet Startfehler an /api/v1/debug/log, damit sie im
// Server-Log sichtbar werden. Als eigene Datei statt Inline-Skript, weil die CSP
// im Web (`script-src 'self'`) Inline-Skripte blockiert — bis 1.6.0 lief der
// Logger deshalb nur in der App.
//
// Nur warn/error — info-Heartbeats bei jedem Start aller Nutzer wären
// Log-Rauschen und Extra-Requests im Startpfad. Opt-in für info via
// localStorage sigDebug=1.
/* global window, localStorage, location, navigator, fetch */
(function () {
  var API = window.location.protocol === 'capacitor:'
    ? 'https://signifikation.de/api/v1/debug/log'
    : '/api/v1/debug/log'
  var posted = 0
  var MAX = 20
  var optIn = false
  try { optIn = localStorage.getItem('sigDebug') === '1' } catch { /* blockiert */ }
  window.__sigDebugPost = function (level, source, message, stack) {
    if (level === 'info' && !optIn) return
    if (posted >= MAX) return
    posted++
    try {
      var body = JSON.stringify({
        level: level,
        source: String(source || 'unknown').slice(0, 200),
        message: String(message || '').slice(0, 2000),
        stack: stack ? String(stack).slice(0, 4000) : undefined,
        // Ohne Query und Hash: dort kann das Reset-Token stehen (Security-Audit run-1)
        url: String(location.origin + location.pathname).slice(0, 500),
        ua: String(navigator.userAgent || '').slice(0, 300),
        ts: Date.now(),
      })
      fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'signifikation-app',
        },
        body: body,
        keepalive: true,
      }).catch(function () {})
    } catch { /* Diagnose darf nie selbst werfen */ }
  }
  window.addEventListener('error', function (e) {
    var t = e.target
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK' || t.tagName === 'IMG')) {
      window.__sigDebugPost('error', 'asset-load', 'Asset failed to load: ' + (t.src || t.href || '?'), null)
      return
    }
    window.__sigDebugPost('error', 'window.error',
      (e.message || 'unknown') + (e.filename ? ' @ ' + e.filename + ':' + (e.lineno || '?') : ''),
      e.error && e.error.stack)
  }, true)
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason
    var msg = (r && r.message) || String(r || 'unknown')
    window.__sigDebugPost('error', 'unhandledrejection', msg, r && r.stack)
  })
  window.__sigDebugPost('info', 'bootstrap', 'index.html loaded, protocol=' + window.location.protocol)
})()
