import { betterAuth } from 'better-auth'
import db from '../db.js'
import logger from '../logger.js'

const IS_PROD = process.env.NODE_ENV === 'production'
const APP_PORT = process.env.PORT || 3001
const DEFAULT_BASE_URL = IS_PROD ? 'https://signifikation.de' : `http://localhost:${APP_PORT}`

const DEFAULT_SESSION_EXPIRES_IN = 60 * 60 * 24 * 30
const DEFAULT_SESSION_UPDATE_AGE = 60 * 60 * 12

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

const SESSION_EXPIRES_IN = readPositiveInt(process.env.AUTH_SESSION_EXPIRES_IN, DEFAULT_SESSION_EXPIRES_IN)
const SESSION_UPDATE_AGE = readPositiveInt(process.env.AUTH_SESSION_UPDATE_AGE, DEFAULT_SESSION_UPDATE_AGE)

const GOOGLE_CLIENT_ID = process.env.BETTER_AUTH_GOOGLE_CLIENT_ID?.trim()
const GOOGLE_CLIENT_SECRET = process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET?.trim()
const APPLE_CLIENT_ID = process.env.BETTER_AUTH_APPLE_CLIENT_ID?.trim()
const APPLE_CLIENT_SECRET = process.env.BETTER_AUTH_APPLE_CLIENT_SECRET?.trim()

const socialProviders = {}
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  }
}

if (APPLE_CLIENT_ID && APPLE_CLIENT_SECRET) {
  socialProviders.apple = {
    clientId: APPLE_CLIENT_ID,
    clientSecret: APPLE_CLIENT_SECRET,
  }
}

const PASSWORD_RESET_DELIVERY = (process.env.PASSWORD_RESET_DELIVERY || (IS_PROD ? 'disabled' : 'log')).trim().toLowerCase()
const PASSWORD_RESET_WEBHOOK_URL = process.env.PASSWORD_RESET_WEBHOOK_URL?.trim()
const PASSWORD_RESET_ENABLED = PASSWORD_RESET_DELIVERY === 'log'
  || (PASSWORD_RESET_DELIVERY === 'webhook' && !!PASSWORD_RESET_WEBHOOK_URL)

async function sendPasswordReset({ user, url }) {
  if (PASSWORD_RESET_DELIVERY === 'webhook' && PASSWORD_RESET_WEBHOOK_URL) {
    const response = await fetch(PASSWORD_RESET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'password_reset',
        email: user.email,
        userId: user.id,
        resetUrl: url,
      }),
    })
    if (!response.ok) {
      throw new Error(`Password-Reset-Webhook fehlgeschlagen (${response.status})`)
    }
    return
  }

  if (PASSWORD_RESET_DELIVERY === 'log') {
    logger.info({ email: user.email, resetUrl: url }, 'Password-Reset-Link (log)')
    return
  }

  logger.warn({ email: user.email }, 'Password-Reset angefragt, aber kein Versand konfiguriert')
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean)
  : IS_PROD
    ? ['https://signifikation.de']
    : ['http://localhost:5173', 'http://localhost:3001']

const CAPACITOR_ORIGINS = ['capacitor://localhost', 'http://localhost']

const trustedOrigins = Array.from(new Set([
  ...ALLOWED_ORIGINS,
  ...CAPACITOR_ORIGINS,
]))

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET

if (IS_PROD && !AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET ist nicht gesetzt')
}

if (!IS_PROD && !AUTH_SECRET) {
  logger.warn('BETTER_AUTH_SECRET nicht gesetzt – Dev-Fallback von Better Auth aktiv')
}

if (PASSWORD_RESET_DELIVERY === 'webhook' && !PASSWORD_RESET_WEBHOOK_URL) {
  logger.warn('PASSWORD_RESET_DELIVERY=webhook, aber PASSWORD_RESET_WEBHOOK_URL fehlt')
}

if (IS_PROD && PASSWORD_RESET_DELIVERY === 'log') {
  logger.warn('PASSWORD_RESET_DELIVERY=log ist fuer Produktion nicht empfohlen')
}

export const authFeatureFlags = {
  googleEnabled: !!socialProviders.google,
  appleEnabled: !!socialProviders.apple,
  passwordResetEnabled: PASSWORD_RESET_ENABLED,
}

export const auth = betterAuth({
  appName: 'Signifikation',
  baseURL: process.env.BETTER_AUTH_URL || DEFAULT_BASE_URL,
  basePath: '/api/v1/auth',
  trustedOrigins,
  secret: AUTH_SECRET,
  advanced: {
    useSecureCookies: IS_PROD,
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: IS_PROD,
      httpOnly: true,
      path: '/',
    },
  },
  database: db,
  session: {
    expiresIn: SESSION_EXPIRES_IN,
    updateAge: SESSION_UPDATE_AGE,
  },
  socialProviders,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    ...(PASSWORD_RESET_ENABLED ? { sendResetPassword: sendPasswordReset } : {}),
  },
})
