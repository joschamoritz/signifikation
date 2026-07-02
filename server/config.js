// Startet den Server nur wenn alle Pflicht-Variablen gesetzt sind.
// Muss der ERSTE import in server/index.js sein (nach dotenv/config).

import { ENV_CANDIDATE_PATHS, ENV_PATH } from './env.js'
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

const OPTIONAL_GROUPS = [
  {
    label: 'VAPID',
    keys: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_MAILTO'],
  },
]

function isPlaceholderValue(value) {
  const trimmed = value?.trim()
  if (!trimmed) return false
  if (PLACEHOLDER_VALUES.has(trimmed)) return true
  return /^bitte-/i.test(trimmed)
}

const fallbackEnvPath = ENV_CANDIDATE_PATHS[0] !== ENV_PATH
  ? ENV_PATH
  : null

if (fallbackEnvPath) {
  logger.warn({ configuredPath: ENV_CANDIDATE_PATHS[0], fallbackPath: fallbackEnvPath }, 'Startup: Konfigurierte Env-Datei nicht gefunden, Fallback aktiv')
}

logger.info({ envPath: ENV_PATH }, 'Startup: Env-Datei geladen')

const missing = REQUIRED_IN_PROD.filter((key) => !process.env[key]?.trim())
const placeholders = REQUIRED_IN_PROD.filter((key) => isPlaceholderValue(process.env[key]))
const incompleteOptionalGroups = OPTIONAL_GROUPS
  .map(({ label, keys }) => ({
    label,
    present: keys.filter((key) => process.env[key]?.trim()),
    missing: keys.filter((key) => !process.env[key]?.trim()),
  }))
  .filter(({ present, missing }) => present.length > 0 && missing.length > 0)

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

for (const group of incompleteOptionalGroups) {
  logger.warn(group, 'Startup: Optionale Variablengruppe unvollständig konfiguriert')
}

// ALLOW_DEV_AUTH=1 in Produktion ist harmlos (middleware/userAuth.js prüft
// zusätzlich NODE_ENV !== 'production'), aber ein Zeichen für Config-Drift —
// jemand hat eine Dev-Umgebungsvariable in die Prod-.env übernommen. Defense-
// in-Depth: statt still zu bleiben, den Start verweigern, damit das auffällt.
if (IS_PROD && process.env.ALLOW_DEV_AUTH === '1') {
  logger.error('Startup: ALLOW_DEV_AUTH=1 in Produktion gesetzt — Config-Drift, Server wird nicht gestartet')
  process.exit(1)
}
