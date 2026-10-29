/**
 * dienstkonto.js – OAuth-Zugriffstoken für Google-APIs per Dienstkonto-JWT
 *
 * Gemeinsam genutzt von FCM (notifications/fcm.js) und der Play-Kaufprüfung
 * (playKauf.js). Bewusst ohne googleapis/google-auth-library: jose ist ohnehin
 * Abhängigkeit, und mehr als „JWT signieren, gegen Token tauschen, cachen“
 * brauchen wir nicht.
 */
import { readFileSync } from 'node:fs'
import { SignJWT, importPKCS8 } from 'jose'

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'

/**
 * Liest und prüft eine Dienstkonto-JSON; liefert null statt zu werfen (der
 * Modul-Load der Aufrufer darf nie den Boot abbrechen).
 * @param {string|undefined} path
 * @param {{ error: Function }} [log]
 * @param {string} [zweck]  für die Logzeile, z. B. 'FCM' oder 'Play-Kaufprüfung'
 */
export function loadServiceAccount(path, log, zweck = 'Google') {
  if (!path) return null
  try {
    const sa = JSON.parse(readFileSync(path, 'utf8'))
    if (!sa.project_id || !sa.client_email || !sa.private_key) {
      log?.error(`${zweck}-Dienstkonto unvollständig (project_id, client_email, private_key)`)
      return null
    }
    return sa
  } catch (err) {
    log?.error({ err: err.message }, `${zweck}-Dienstkonto nicht lesbar – deaktiviert`)
    return null
  }
}

/**
 * Zugriffstoken-Quelle für einen Scope. Das Token wird bis kurz vor Ablauf
 * gecacht; `invalidate()` erzwingt nach einem 401 ein neues.
 * @returns {{ get: () => Promise<string>, invalidate: () => void }}
 */
export function createAccessTokenSource(sa, { scope, fetchImpl = fetch, now = () => Date.now(), timeoutMs = 10_000, zweck = 'Google' }) {
  const tokenUri = sa.token_uri || DEFAULT_TOKEN_URI
  let keyPromise = null
  let cached = null // { token, expiresAt }

  async function get() {
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token
    keyPromise ||= importPKCS8(sa.private_key, 'RS256')
    const key = await keyPromise
    const iat = Math.floor(now() / 1000)
    const assertion = await new SignJWT({ scope })
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
    if (!res.ok) throw new Error(`${zweck}-OAuth fehlgeschlagen: HTTP ${res.status}`)
    const json = await res.json()
    cached = { token: json.access_token, expiresAt: now() + (json.expires_in || 3600) * 1000 }
    return cached.token
  }

  return { get, invalidate: () => { cached = null } }
}
