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
dotenv.config({ path: ENV_PATH, override: process.env.NODE_ENV !== 'test' })
