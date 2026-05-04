// Startet den Server nur wenn alle Pflicht-Variablen gesetzt sind.
// Muss der ERSTE import in server/index.js sein (nach dotenv/config).

import logger from './logger.js'

const IS_PROD = process.env.NODE_ENV === 'production'

const REQUIRED_IN_PROD = [
  'BETTER_AUTH_SECRET',
  'CLASSROOM_JOIN_SECRET',
  'MOLLIE_API_KEY',
]

const PLACEHOLDER_VALUES = new Set([
  'bitte-32-zeichen-plus-zufaellig-setzen',
  'bitte-starkes-secret-setzen',
  'test_...',
])

function isPlaceholderValue(value) {
  const trimmed = value?.trim()
  if (!trimmed) return false
  if (PLACEHOLDER_VALUES.has(trimmed)) return true
  return /^bitte-/i.test(trimmed)
}

const missing = REQUIRED_IN_PROD.filter((key) => !process.env[key]?.trim())
const placeholders = REQUIRED_IN_PROD.filter((key) => isPlaceholderValue(process.env[key]))

if (missing.length > 0) {
  if (IS_PROD) {
    logger.error({ missing }, 'Startup: Fehlende Pflicht-Variablen')
    logger.error('Startup: Server wird nicht gestartet')
    process.exit(1)
  } else {
    logger.warn({ missing }, 'Startup: Fehlende Variablen, Dev-Fallbacks aktiv')
  }
}

if (placeholders.length > 0) {
  if (IS_PROD) {
    logger.error({ placeholders }, 'Startup: Platzhalterwerte fuer Pflicht-Variablen erkannt')
    logger.error('Startup: Server wird nicht gestartet')
    process.exit(1)
  } else {
    logger.warn({ placeholders }, 'Startup: Platzhalterwerte erkannt')
  }
}
