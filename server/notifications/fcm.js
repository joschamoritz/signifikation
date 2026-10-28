/**
 * fcm.js – Android-Push über Firebase Cloud Messaging (HTTP-v1-API)
 *
 * Bewusst ohne firebase-admin: Wir brauchen nur „eine Nachricht an ein Token
 * senden“. Das OAuth-Zugriffstoken holen wir selbst per Dienstkonto-JWT
 * (jose ist ohnehin Abhängigkeit) und cachen es bis kurz vor Ablauf.
 *
 * Konfiguration: FCM_SERVICE_ACCOUNT_PATH zeigt auf die Dienstkonto-JSON aus
 * der Firebase-Konsole (Projekteinstellungen › Dienstkonten). Fehlt sie oder
 * ist sie unlesbar, bleibt Android-Push aus – der Modul-Load darf NIE werfen
 * (Boot-Abbruch, siehe push-sender.test.js).
 */
import { readFileSync } from 'node:fs'
import { SignJWT, importPKCS8 } from 'jose'

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
// Kanal-ID wie in src/hooks/usePushNotifications.js (createChannel)
export const ANDROID_CHANNEL_ID = 'erinnerungen'

/** Liest und prüft die Dienstkonto-JSON; liefert null statt zu werfen. */
export function loadServiceAccount(path, log) {
  if (!path) return null
  try {
    const sa = JSON.parse(readFileSync(path, 'utf8'))
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      log?.error('FCM-Dienstkonto unvollständig (project_id, client_email, private_key)')
      return null
    }
    return sa
  } catch (err) {
    log?.error({ err: err.message }, 'FCM-Dienstkonto nicht lesbar – Android-Push deaktiviert')
    return null
  }
}

/** FCM-Nachricht im HTTP-v1-Format. url landet in data für den Klick-Handler. */
export function buildMessage(token, payload) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: String(payload.url) } : {},
      android: {
        ttl: '3600s',
        notification: { channel_id: ANDROID_CHANNEL_ID },
      },
    },
  }
}

/**
 * Token, das FCM nicht mehr kennt (App deinstalliert, Token erneuert) →
 * Subscription löschen. Nur bei eindeutigem UNREGISTERED: ein allgemeines
 * INVALID_ARGUMENT kann auch an unserer Nachricht liegen und darf nicht alle
 * Android-Geräte auf einmal löschen.
 */
export function isUnregistered(status, body) {
  const details = body?.error?.details || []
  const code = details.find((d) => d?.errorCode)?.errorCode
  return code === 'UNREGISTERED' || (status === 404 && body?.error?.status === 'NOT_FOUND')
}

/**
 * Erzeugt einen Sender. fetchImpl und now sind für Tests austauschbar.
 * Rückgabe: { enabled, send(token, payload) → { ok, unregistered, status } }
 */
export function createFcmSender(sa, { fetchImpl = fetch, now = () => Date.now(), timeoutMs = 10_000 } = {}) {
  if (!sa) return { enabled: false, send: async () => ({ ok: false, unregistered: false, status: 0 }) }

  const tokenUri = sa.token_uri || DEFAULT_TOKEN_URI
  const sendUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  let keyPromise = null
  let cached = null // { token, expiresAt }

  async function accessToken() {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token
    keyPromise ||= importPKCS8(sa.private_key, 'RS256')
    const key = await keyPromise
    const iat = Math.floor(now() / 1000)
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(tokenUri)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key)
    const res = await fetchImpl(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`FCM-OAuth fehlgeschlagen: HTTP ${res.status}`)
    const json = await res.json()
    cached = { token: json.access_token, expiresAt: now() + (json.expires_in || 3600) * 1000 }
    return cached.token
  }

  async function send(token, payload) {
    const res = await fetchImpl(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify(buildMessage(token, payload)),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok) return { ok: true, unregistered: false, status: res.status }
    // Abgelaufenes Zugriffstoken: beim nächsten Versand neu holen
    if (res.status === 401) cached = null
    const body = await res.json().catch(() => null)
    return { ok: false, unregistered: isUnregistered(res.status, body), status: res.status }
  }

  return { enabled: true, send }
}
