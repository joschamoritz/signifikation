import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const serverDir = dirname(fileURLToPath(import.meta.url))
const defaultEnvPath = resolve(serverDir, '../.env')
const configuredEnvPath = process.env.DOTENV_CONFIG_PATH
  ? resolve(process.env.DOTENV_CONFIG_PATH)
  : defaultEnvPath

export const ENV_CANDIDATE_PATHS = configuredEnvPath === defaultEnvPath
  ? [configuredEnvPath]
  : [configuredEnvPath, defaultEnvPath]

export const ENV_PATH = ENV_CANDIDATE_PATHS.find((envPath) => existsSync(envPath)) ?? configuredEnvPath

// Im test-Modus (NODE_ENV=test, gesetzt von playwright.config.js) sollen
// Shell-Variablen (PORT, APP_DB) Vorrang haben, damit playwright den Port
// explizit setzen kann ohne dass .env ihn ueberschreibt.
//
// NODE_ENV von außen (PM2: ecosystem.config.cjs) überschreibt die .env nie: Eine
// Dev-.env auf dem Server schaltete sonst still alle Produktionsschalter ab
// (Dev-Login per Header, Testkäufe, Bindung an 127.0.0.1). Widersprechen sich
// beide, bricht der Start ab – der Deploy rollt dann zurück (Security-Audit run-1).
const nodeEnvVonAussen = process.env.NODE_ENV
dotenv.config({ path: ENV_PATH, override: nodeEnvVonAussen !== 'test' })
if (nodeEnvVonAussen && process.env.NODE_ENV !== nodeEnvVonAussen) {
  const ausDatei = process.env.NODE_ENV
  process.env.NODE_ENV = nodeEnvVonAussen
  throw new Error(`NODE_ENV=${ausDatei} in ${ENV_PATH} widerspricht NODE_ENV=${nodeEnvVonAussen} aus der Umgebung – Start abgebrochen`)
}
