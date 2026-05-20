// Backend-Sentry-Initialisierung. Muss VOR allen anderen Imports geladen werden,
// damit die SDK Node-Hooks (process, http) instrumentieren kann.
//
// Aktivierung: SENTRY_DSN in .env. Ohne DSN ist die SDK ein No-Op.
import * as Sentry from '@sentry/node'

const dsn = process.env.SENTRY_DSN?.trim()

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.DEPLOY_SHA || process.env.npm_package_version,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
    beforeSend(event) {
      // Helmet-Header-Validation-Fehler etc. raus.
      const msg = event.message || event.exception?.values?.[0]?.value || ''
      if (/Request aborted|ECONNRESET|EPIPE/i.test(msg)) {
        return null
      }
      return event
    },
  })
}

export { Sentry }
export const sentryEnabled = Boolean(dsn)
