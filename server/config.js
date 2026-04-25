// Startet den Server nur wenn alle Pflicht-Variablen gesetzt sind.
// Muss der ERSTE import in server/index.js sein (nach dotenv/config).

const IS_PROD = process.env.NODE_ENV === 'production'

const REQUIRED_IN_PROD = [
  'BETTER_AUTH_SECRET',
  'CLASSROOM_JOIN_SECRET',
]

const missing = REQUIRED_IN_PROD.filter((key) => !process.env[key]?.trim())

if (missing.length > 0) {
  const list = missing.join(', ')
  if (IS_PROD) {
    console.error(`[startup] Fehlende Pflicht-Variablen: ${list}`)
    console.error('[startup] Server wird nicht gestartet.')
    process.exit(1)
  } else {
    console.warn(`[startup] Fehlende Variablen (Dev-Fallbacks aktiv): ${list}`)
  }
}
