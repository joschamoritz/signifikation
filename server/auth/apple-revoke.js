/**
 * server/auth/apple-revoke.js
 *
 * Sign in with Apple widerrufen, wenn ein Konto gelöscht wird (Guideline
 * 5.1.1(v), Apple „Sign in with Apple REST API" › Revoke tokens).
 *
 *   - Nativer Login (iOS): Die App schickt nach der Anmeldung den
 *     authorizationCode an POST /api/v1/account/apple-token. Der Server tauscht
 *     ihn mit client_id = Bundle-ID gegen ein Refresh-Token (Tabelle apple_token).
 *   - Web-Login: better-auth tauscht den Code selbst und legt die Tokens in
 *     account.refreshToken/accessToken ab (client_id = Services-ID).
 *
 * Vor dem Löschen sammelt collectAppleTokens() alle Tokens ein (danach sind die
 * Zeilen per CASCADE weg), revokeAppleTokens() widerruft sie anschließend. Ein
 * gescheiterter Widerruf blockiert die Löschung nie, er wird nur protokolliert.
 */

import db from '../db.js'
import logger from '../logger.js'
import { buildAppleClientSecret } from './apple-client-secret.js'

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token'
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke'
const TIMEOUT_MS = 8000
// Das Client-Secret-JWT gilt 180 Tage; einen Tag Puffer, dann neu signieren
const SECRET_REFRESH_MARGIN_S = 24 * 60 * 60

export const appleBundleId = () => process.env.APPLE_BUNDLE_IDENTIFIER?.trim() || 'de.signifikation.app'
const appleServicesId = () => process.env.BETTER_AUTH_APPLE_CLIENT_ID?.trim() || null

const secretCache = new Map()

async function clientSecretFor(clientId, env = process.env) {
  const cached = secretCache.get(clientId)
  if (cached && cached.expiresAt - SECRET_REFRESH_MARGIN_S > Math.floor(Date.now() / 1000)) return cached.jwt
  const built = await buildAppleClientSecret({
    teamId: env.APPLE_TEAM_ID?.trim(),
    keyId: env.APPLE_KEY_ID?.trim(),
    clientId,
    privateKeyPath: env.APPLE_PRIVATE_KEY_PATH?.trim(),
    privateKeyInline: env.APPLE_PRIVATE_KEY?.trim(),
  })
  secretCache.set(clientId, built)
  return built.jwt
}

async function postForm(url, params, fetchImpl) {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

// Payload eines JWT ohne Signaturprüfung lesen. Nur für Antworten, die direkt
// per TLS von appleid.apple.com kommen – nie für Daten vom Client.
function jwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

const appleAccountIdStmt = db.prepare(`
  SELECT accountId FROM account WHERE userId = ? AND providerId = 'apple'
`)

const upsertAppleTokenStmt = db.prepare(`
  INSERT INTO apple_token (user_id, refresh_token, client_id, created_at, updated_at)
  VALUES (@userId, @refreshToken, @clientId, @now, @now)
  ON CONFLICT(user_id) DO UPDATE SET
    refresh_token = excluded.refresh_token,
    client_id     = excluded.client_id,
    updated_at    = excluded.updated_at
`)

/**
 * authorizationCode aus dem nativen Login gegen ein Refresh-Token tauschen und
 * speichern. Gehört das Token nicht zum Apple-Konto des Nutzers, wird es sofort
 * widerrufen und verworfen.
 * @returns {Promise<'stored'|'mismatch'|'no-apple-account'>}
 */
export async function storeAppleRefreshToken(userId, authorizationCode, { fetchImpl = fetch, now = Date.now() } = {}) {
  const accounts = appleAccountIdStmt.all(userId).map((a) => a.accountId)
  if (accounts.length === 0) return 'no-apple-account'

  const clientId = appleBundleId()
  const res = await postForm(APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: await clientSecretFor(clientId),
    code: authorizationCode,
    grant_type: 'authorization_code',
  }, fetchImpl)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apple-Token-Tausch fehlgeschlagen (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  if (!data?.refresh_token) throw new Error('Apple-Token-Tausch lieferte kein refresh_token')

  const sub = jwtPayload(data.id_token)?.sub
  if (!sub || !accounts.includes(sub)) {
    await revokeAppleTokens([{ token: data.refresh_token, hint: 'refresh_token', clientId }], { fetchImpl })
    return 'mismatch'
  }

  upsertAppleTokenStmt.run({ userId, refreshToken: data.refresh_token, clientId, now })
  return 'stored'
}

const nativeTokenStmt = db.prepare(`
  SELECT refresh_token AS token, client_id AS clientId FROM apple_token WHERE user_id = ?
`)
const webTokenStmt = db.prepare(`
  SELECT refreshToken, accessToken FROM account WHERE userId = ? AND providerId = 'apple'
`)

/**
 * Alle widerrufbaren Apple-Tokens eines Kontos. Muss VOR deleteUserTx laufen.
 * @returns {{ token: string, hint: 'refresh_token'|'access_token', clientId: string }[]}
 */
export function collectAppleTokens(userId) {
  const tokens = []
  const native = nativeTokenStmt.get(userId)
  if (native) tokens.push({ token: native.token, hint: 'refresh_token', clientId: native.clientId })
  const servicesId = appleServicesId()
  if (servicesId) {
    for (const row of webTokenStmt.all(userId)) {
      // Ein Refresh-Token widerruft auch die daraus erzeugten Access-Tokens
      if (row.refreshToken) tokens.push({ token: row.refreshToken, hint: 'refresh_token', clientId: servicesId })
      else if (row.accessToken) tokens.push({ token: row.accessToken, hint: 'access_token', clientId: servicesId })
    }
  }
  return tokens
}

/**
 * Tokens bei Apple widerrufen. Wirft nie; meldet je Token Erfolg oder Fehler.
 * @returns {Promise<{ revoked: number, failed: number }>}
 */
export async function revokeAppleTokens(tokens, { fetchImpl = fetch } = {}) {
  const result = { revoked: 0, failed: 0 }
  for (const { token, hint, clientId } of tokens) {
    try {
      const res = await postForm(APPLE_REVOKE_URL, {
        client_id: clientId,
        client_secret: await clientSecretFor(clientId),
        token,
        token_type_hint: hint,
      }, fetchImpl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      result.revoked += 1
    } catch (err) {
      result.failed += 1
      logger.warn({ err: err?.message, clientId, hint }, 'Sign in with Apple: Widerruf fehlgeschlagen')
    }
  }
  if (result.revoked) logger.info(result, 'Sign in with Apple: Tokens widerrufen')
  return result
}
