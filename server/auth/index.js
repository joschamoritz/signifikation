import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import db from '../db.js'
import logger from '../logger.js'
import { initAppleClientSecret } from './apple-client-secret.js'
import { ALLOWED_ORIGINS, CAPACITOR_ORIGINS } from '../config/origins.js'
import { isMailConfigured, sendPasswordResetMail, sendWelcomeMail } from '../mailer.js'

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
const APPLE_CLIENT_SECRET_STATIC = process.env.BETTER_AUTH_APPLE_CLIENT_SECRET?.trim()
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_IDENTIFIER?.trim() || 'de.signifikation.app'

// Apple verlangt ein dynamisch signiertes JWT (max. 6 Monate gültig) als clientSecret.
// Wir generieren es beim Server-Start aus dem .p8-Privatekey, sofern Team-ID, Key-ID
// und Key-Pfad gesetzt sind. Fällt back auf das statische Secret aus der Env-Variable,
// falls jemand das JWT manuell erzeugt hat (z. B. in lokalen Test-Setups).
let appleClientSecret = null
try {
  appleClientSecret = await initAppleClientSecret()
} catch (err) {
  logger.error({ err }, 'Apple Client Secret konnte nicht erzeugt werden – Apple-Login deaktiviert')
}
if (!appleClientSecret && APPLE_CLIENT_SECRET_STATIC) {
  appleClientSecret = APPLE_CLIENT_SECRET_STATIC
  logger.warn('Apple-Login verwendet statisches BETTER_AUTH_APPLE_CLIENT_SECRET – dieses muss vor Ablauf manuell rotiert werden')
}
const socialProviders = {}
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  }
}

if (APPLE_CLIENT_ID && appleClientSecret) {
  socialProviders.apple = {
    clientId: APPLE_CLIENT_ID,
    clientSecret: appleClientSecret,
    // Erlaubt sowohl Web-Tokens (Services-ID als aud) als auch Native-iOS-Tokens
    // (Bundle-ID als aud), die wir später vom Capacitor-Plugin entgegennehmen.
    appBundleIdentifier: APPLE_BUNDLE_ID,
    audience: [APPLE_CLIENT_ID, APPLE_BUNDLE_ID],
  }
}

// Guideline 4.8: Wer einen Drittanbieter-Login anbietet, muss "Mit Apple
// anmelden" als gleichwertige Option danebenstellen. Beide Provider haengen
// hier an getrennten Env-Bedingungen — faellt Apple aus (abgelaufenes .p8,
// falsche Team-ID), wuerde der Server bisher still weiterlaufen und die App
// nur noch Google anbieten. Das ist eine Ablehnung, die erst im laufenden
// Betrieb auftritt. Deshalb in Produktion lieber gar nicht starten.
if (IS_PROD && socialProviders.google && !socialProviders.apple) {
  throw new Error(
    'Google-Login ist aktiv, Sign in with Apple aber nicht (Guideline 4.8). '
    + 'Apple-Konfiguration pruefen (BETTER_AUTH_APPLE_CLIENT_ID, APPLE_TEAM_ID, '
    + 'APPLE_KEY_ID, .p8-Key) oder Google-Login deaktivieren.'
  )
}

// 'email' ist der Regelweg (Nodemailer/Gmail, derselbe Transport wie die
// Bestellbestätigung). 'webhook' bleibt als Ausweichweg bestehen, 'log' ist
// reines Dev-Werkzeug und in Produktion verboten.
const PASSWORD_RESET_DELIVERY = (process.env.PASSWORD_RESET_DELIVERY || (IS_PROD ? 'email' : 'log')).trim().toLowerCase()
const PASSWORD_RESET_WEBHOOK_URL = process.env.PASSWORD_RESET_WEBHOOK_URL?.trim()

if (IS_PROD && PASSWORD_RESET_DELIVERY === 'log') {
  throw new Error('PASSWORD_RESET_DELIVERY=log ist in Produktion nicht erlaubt – Reset-URLs dürfen nicht geloggt werden')
}

// Ohne konfigurierten Mailtransport waere 'email' eine Sackgasse: der Nutzer
// bekaeme "Link versendet" zu sehen und nie eine Mail. Dann lieber das Feature
// gar nicht anbieten – das Frontend blendet es ueber passwordResetEnabled aus.
const PASSWORD_RESET_ENABLED = PASSWORD_RESET_DELIVERY === 'log'
  || (PASSWORD_RESET_DELIVERY === 'webhook' && !!PASSWORD_RESET_WEBHOOK_URL)
  || (PASSWORD_RESET_DELIVERY === 'email' && isMailConfigured())


async function sendPasswordReset({ user, url }) {
  if (PASSWORD_RESET_DELIVERY === 'email') {
    await sendPasswordResetMail({ to: user.email, url })
    return
  }

  if (PASSWORD_RESET_DELIVERY === 'webhook' && PASSWORD_RESET_WEBHOOK_URL) {
    const response = await fetch(PASSWORD_RESET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
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


// Single Source fuer Origins: config/origins.js. Die fruehere lokale Kopie
// war gedriftet — http://localhost stand auch in Prod in den trustedOrigins
// (origins.js schliesst das mit Begruendung aus) und https://localhost
// (Capacitor-Android) fehlte, was Android-Sign-in brechen konnte.
// Exportiert fuer den Paritaetstest (origins.test.js).
export const trustedOrigins = Array.from(new Set([
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

if (PASSWORD_RESET_DELIVERY === 'email' && !isMailConfigured()) {
  logger.warn('PASSWORD_RESET_DELIVERY=email, aber GMAIL_USER/GMAIL_APP_PASSWORD fehlen – Passwort-Reset bleibt deaktiviert')
}


// Willkommensmail nach der Registrierung, mit optionalem Bestaetigungslink.
// requireEmailVerification bleibt bewusst aus: das Konto ist sofort nutzbar,
// die Bestaetigung nur ein Angebot. Wuerde der Login daran haengen, sperrte
// jede Zustellstoerung saemtliche Neuregistrierungen aus – inklusive der des
// App-Store-Reviewers.
const WELCOME_MAIL_ENABLED = isMailConfigured()

if (!WELCOME_MAIL_ENABLED) {
  logger.warn('GMAIL_USER/GMAIL_APP_PASSWORD fehlen – keine Willkommens- und Bestellbestaetigungsmails')
}

async function sendWelcomeWithVerification({ user, url }) {
  await sendWelcomeMail({ to: user.email, name: user.name, verificationUrl: url })
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
      // 'none' nötig für Capacitor-WKWebView: Requests kommen von capacitor://localhost
      // (cross-origin zu signifikation.de), SameSite=Lax blockiert den Cookie dabei.
      // CSRF-Schutz läuft weiterhin über csrfProtect-Middleware.
      sameSite: IS_PROD ? 'none' : 'lax',
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
  account: {
    // Wenn ein User sich erst per E-Mail registriert und dann mit Apple (oder Google)
    // mit derselben verifizierten E-Mail einloggt, verknüpft better-auth automatisch
    // beide Accounts unter derselben user-id. Bestandsentitlements (Premium etc.)
    // bleiben erhalten, da sie an user.id hängen.
    // Hinweis: Apple Private Relay (@privaterelay.appleid.com) matched nie eine echte
    // Mail – in dem Fall entsteht ein neuer Account, das ist gewollt.
    accountLinking: {
      enabled: true,
      trustedProviders: ['apple', 'google'],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    ...(PASSWORD_RESET_ENABLED ? { sendResetPassword: sendPasswordReset } : {}),
  },
  // sendOnSignUp greift auch bei requireEmailVerification: false – better-auth
  // legt die Session trotzdem sofort an (api/routes/sign-up.mjs). Social-Logins
  // laufen nicht hierdurch, deren Adresse gilt beim Provider als verifiziert.
  ...(WELCOME_MAIL_ENABLED ? {
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: sendWelcomeWithVerification,
    },
  } : {}),
  plugins: [bearer()],
})
