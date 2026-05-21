import fs from 'node:fs'
import path from 'node:path'
import { SignJWT, importPKCS8 } from 'jose'
import logger from '../logger.js'

const APPLE_AUDIENCE = 'https://appleid.apple.com'

// Apple erlaubt max. 6 Monate (15777000 s). Wir bleiben mit 180 Tagen knapp drunter.
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 180

function readPrivateKeyPem({ keyPath, keyInline }) {
  if (keyInline && keyInline.trim()) {
    return keyInline.replace(/\\n/g, '\n').trim()
  }
  if (!keyPath) {
    throw new Error('Apple-Private-Key fehlt: weder APPLE_PRIVATE_KEY_PATH noch APPLE_PRIVATE_KEY gesetzt')
  }
  const absolute = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath)
  if (!fs.existsSync(absolute)) {
    throw new Error(`Apple-Private-Key nicht gefunden: ${absolute}`)
  }
  return fs.readFileSync(absolute, 'utf8').trim()
}

export async function buildAppleClientSecret({
  teamId,
  keyId,
  clientId,
  privateKeyPath,
  privateKeyInline,
  now = Math.floor(Date.now() / 1000),
  lifetimeSeconds = TOKEN_LIFETIME_SECONDS,
}) {
  if (!teamId) throw new Error('Apple Team ID fehlt (APPLE_TEAM_ID)')
  if (!keyId) throw new Error('Apple Key ID fehlt (APPLE_KEY_ID)')
  if (!clientId) throw new Error('Apple Client ID fehlt (BETTER_AUTH_APPLE_CLIENT_ID)')

  const pem = readPrivateKeyPem({ keyPath: privateKeyPath, keyInline: privateKeyInline })
  if (!pem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Apple-Private-Key ist kein gültiger PKCS#8-PEM (-----BEGIN PRIVATE KEY----- erwartet)')
  }

  const privateKey = await importPKCS8(pem, 'ES256')
  const expiresAt = now + lifetimeSeconds

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setAudience(APPLE_AUDIENCE)
    .setSubject(clientId)
    .sign(privateKey)

  return { jwt, expiresAt }
}

export async function initAppleClientSecret(env = process.env) {
  const teamId = env.APPLE_TEAM_ID?.trim()
  const keyId = env.APPLE_KEY_ID?.trim()
  const clientId = env.BETTER_AUTH_APPLE_CLIENT_ID?.trim()
  const privateKeyPath = env.APPLE_PRIVATE_KEY_PATH?.trim()
  const privateKeyInline = env.APPLE_PRIVATE_KEY?.trim()

  if (!teamId || !keyId || !clientId || (!privateKeyPath && !privateKeyInline)) {
    return null
  }

  const { jwt, expiresAt } = await buildAppleClientSecret({
    teamId,
    keyId,
    clientId,
    privateKeyPath,
    privateKeyInline,
  })

  const expiresInDays = Math.round((expiresAt * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
  logger.info(
    { expiresAt: new Date(expiresAt * 1000).toISOString(), expiresInDays, keyId },
    'Apple Client Secret JWT erzeugt'
  )

  return jwt
}
