// Frontend-Sentry-Initialisierung (Web + Capacitor WKWebView).
// Wird in src/main.jsx vor dem React-Render geladen.
//
// Aktivierung: VITE_SENTRY_DSN in .env setzen. Ohne DSN ist die SDK
// vollständig deaktiviert und produziert keine Netzwerk-Calls.
import * as Sentry from '@sentry/react'

let initialized = false

export function initSentry() {
  if (initialized) return
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return // Sentry aus -> kein Setup, kein Overhead

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    // Niedrige Trace-Rate, weil wir kein dauerhaftes APM brauchen.
    // Für Performance-Analysen punktuell hochsetzen.
    tracesSampleRate: 0.05,
    // Replays werden manuell durch beforeSend gefiltert – hier nur die SDK
    // bereitstellen, falls später aktiviert.
    integrations: [Sentry.browserTracingIntegration()],
    // Persönliche Daten nicht senden.
    sendDefaultPii: false,
    beforeSend(event) {
      // Bekannte Noise-Events ausfiltern.
      const msg = event.message || event.exception?.values?.[0]?.value || ''
      if (/ResizeObserver loop|Non-Error promise rejection captured/i.test(msg)) {
        return null
      }
      return event
    },
  })
  initialized = true
}

// Re-Export für punktuelle Verwendung (z. B. captureException in einem Hook).
export { Sentry }
