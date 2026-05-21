import { describe, it, expect, beforeAll } from 'vitest'
import { generateKeyPair, exportPKCS8, decodeJwt, decodeProtectedHeader } from 'jose'
import { buildAppleClientSecret, initAppleClientSecret } from './apple-client-secret.js'

let testPrivateKeyPem
beforeAll(async () => {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true })
  testPrivateKeyPem = await exportPKCS8(privateKey)
})

describe('buildAppleClientSecret', () => {
  const baseConfig = () => ({
    teamId: 'KFBZ9LYG9R',
    keyId: 'VF48PCVX9B',
    clientId: 'de.signifikation.app.web',
    privateKeyInline: testPrivateKeyPem,
  })

  it('erzeugt ein JWT mit korrekten Apple-Claims', async () => {
    const now = 1_700_000_000
    const { jwt, expiresAt } = await buildAppleClientSecret({ ...baseConfig(), now })

    const header = decodeProtectedHeader(jwt)
    expect(header.alg).toBe('ES256')
    expect(header.kid).toBe('VF48PCVX9B')

    const payload = decodeJwt(jwt)
    expect(payload.iss).toBe('KFBZ9LYG9R')
    expect(payload.sub).toBe('de.signifikation.app.web')
    expect(payload.aud).toBe('https://appleid.apple.com')
    expect(payload.iat).toBe(now)
    expect(payload.exp).toBe(expiresAt)
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60 * 60 * 24 * 180)
  })

  it('respektiert eine kürzere lifetimeSeconds-Option', async () => {
    const now = 1_700_000_000
    const { jwt } = await buildAppleClientSecret({
      ...baseConfig(),
      now,
      lifetimeSeconds: 3600,
    })
    const payload = decodeJwt(jwt)
    expect(payload.exp - payload.iat).toBe(3600)
  })

  it('wirft, wenn Team ID fehlt', async () => {
    await expect(buildAppleClientSecret({ ...baseConfig(), teamId: '' })).rejects.toThrow(/Team ID/)
  })

  it('wirft, wenn Key ID fehlt', async () => {
    await expect(buildAppleClientSecret({ ...baseConfig(), keyId: '' })).rejects.toThrow(/Key ID/)
  })

  it('wirft, wenn Client ID fehlt', async () => {
    await expect(buildAppleClientSecret({ ...baseConfig(), clientId: '' })).rejects.toThrow(/Client ID/)
  })

  it('wirft, wenn der Private Key kein PKCS#8-PEM ist', async () => {
    await expect(
      buildAppleClientSecret({ ...baseConfig(), privateKeyInline: 'kein-pem' })
    ).rejects.toThrow(/PKCS#8-PEM/)
  })

  it('akzeptiert \\n-escaped PEM-Inhalt (Single-Line Env-Variable)', async () => {
    const escaped = testPrivateKeyPem.replace(/\n/g, '\\n')
    const { jwt } = await buildAppleClientSecret({ ...baseConfig(), privateKeyInline: escaped })
    expect(decodeJwt(jwt).iss).toBe('KFBZ9LYG9R')
  })
})

describe('initAppleClientSecret', () => {
  it('gibt null zurück, wenn Konfiguration unvollständig ist', async () => {
    const result = await initAppleClientSecret({ APPLE_TEAM_ID: 'NUR_DAS' })
    expect(result).toBeNull()
  })

  it('erzeugt ein JWT, wenn alle Env-Variablen gesetzt sind', async () => {
    const jwt = await initAppleClientSecret({
      APPLE_TEAM_ID: 'KFBZ9LYG9R',
      APPLE_KEY_ID: 'VF48PCVX9B',
      BETTER_AUTH_APPLE_CLIENT_ID: 'de.signifikation.app.web',
      APPLE_PRIVATE_KEY: testPrivateKeyPem,
    })
    expect(jwt).toBeTruthy()
    const payload = decodeJwt(jwt)
    expect(payload.sub).toBe('de.signifikation.app.web')
  })
})
