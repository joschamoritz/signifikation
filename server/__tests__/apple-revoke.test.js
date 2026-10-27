/**
 * Sign in with Apple widerrufen (server/auth/apple-revoke.js, Guideline 5.1.1(v)):
 * Code-Tausch beim nativen Login, Einsammeln vor der Löschung, Widerruf danach.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { generateKeyPair, exportPKCS8 } from 'jose'
import db from '../db.js'
import { storeAppleRefreshToken, collectAppleTokens, revokeAppleTokens } from '../auth/apple-revoke.js'
import { deleteUser } from '../routes/admin-users-data.js'

const ENV_KEYS = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_PRIVATE_KEY_PATH', 'BETTER_AUTH_APPLE_CLIENT_ID', 'APPLE_BUNDLE_IDENTIFIER']
const envBackup = {}
const angelegt = []

beforeAll(async () => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k]
  const { privateKey } = await generateKeyPair('ES256', { extractable: true })
  process.env.APPLE_TEAM_ID = 'TEAM123456'
  process.env.APPLE_KEY_ID = 'KEY1234567'
  process.env.APPLE_PRIVATE_KEY = await exportPKCS8(privateKey)
  delete process.env.APPLE_PRIVATE_KEY_PATH
  process.env.BETTER_AUTH_APPLE_CLIENT_ID = 'de.signifikation.app.web'
  delete process.env.APPLE_BUNDLE_IDENTIFIER
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k]
    else process.env[k] = envBackup[k]
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const id of angelegt) db.prepare('DELETE FROM user WHERE id = ?').run(id)
  angelegt.length = 0
})

function konto({ appleSub = null, webRefresh = null } = {}) {
  const id = `apple-test-${Math.random().toString(16).slice(2, 10)}`
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, 'Apple Test', ?, 1, NULL, ?, ?)`)
    .run(id, `${id}@apple.test`, now, now)
  if (appleSub) {
    db.prepare(`INSERT INTO account (id, userId, accountId, providerId, refreshToken, createdAt, updatedAt) VALUES (?, ?, ?, 'apple', ?, ?, ?)`)
      .run(`acc-${id}`, id, appleSub, webRefresh, now, now)
  }
  angelegt.push(id)
  return id
}

const idToken = (sub) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const form = (call) => Object.fromEntries(new URLSearchParams(call[1].body))
const gespeichert = (id) => db.prepare('SELECT refresh_token AS token, client_id AS clientId FROM apple_token WHERE user_id = ?').get(id)

describe('storeAppleRefreshToken', () => {
  it('tauscht den Code mit der Bundle-ID und speichert das Refresh-Token', async () => {
    const id = konto({ appleSub: 'sub-1' })
    const fetchImpl = vi.fn(async () => jsonResponse({ refresh_token: 'r-1', id_token: idToken('sub-1') }))

    await expect(storeAppleRefreshToken(id, 'code-abc', { fetchImpl })).resolves.toBe('stored')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/token')
    expect(form(fetchImpl.mock.calls[0])).toMatchObject({ client_id: 'de.signifikation.app', code: 'code-abc', grant_type: 'authorization_code' })
    expect(gespeichert(id)).toEqual({ token: 'r-1', clientId: 'de.signifikation.app' })
  })

  it('verwirft und widerruft ein Token, das zu einem anderen Apple-Konto gehört', async () => {
    const id = konto({ appleSub: 'sub-1' })
    const fetchImpl = vi.fn(async (url) => (url.endsWith('/token')
      ? jsonResponse({ refresh_token: 'fremd', id_token: idToken('sub-ANDERS') })
      : new Response('', { status: 200 })))

    await expect(storeAppleRefreshToken(id, 'code-abc', { fetchImpl })).resolves.toBe('mismatch')
    expect(gespeichert(id)).toBeUndefined()
    expect(fetchImpl.mock.calls[1][0]).toBe('https://appleid.apple.com/auth/revoke')
    expect(form(fetchImpl.mock.calls[1])).toMatchObject({ token: 'fremd', token_type_hint: 'refresh_token' })
  })

  it('fragt Apple gar nicht erst, wenn das Konto kein Apple-Login hat', async () => {
    const id = konto()
    const fetchImpl = vi.fn()
    await expect(storeAppleRefreshToken(id, 'code-abc', { fetchImpl })).resolves.toBe('no-apple-account')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('wirft bei einer Apple-Fehlerantwort und speichert nichts', async () => {
    const id = konto({ appleSub: 'sub-1' })
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400))
    await expect(storeAppleRefreshToken(id, 'code-abc', { fetchImpl })).rejects.toThrow(/400/)
    expect(gespeichert(id)).toBeUndefined()
  })
})

describe('Widerruf bei Kontolöschung', () => {
  it('sammelt natives und Web-Token mit der jeweils passenden Kennung ein', async () => {
    const id = konto({ appleSub: 'sub-1', webRefresh: 'web-r' })
    await storeAppleRefreshToken(id, 'code-abc', {
      fetchImpl: async () => jsonResponse({ refresh_token: 'nativ-r', id_token: idToken('sub-1') }),
    })
    expect(collectAppleTokens(id)).toEqual([
      { token: 'nativ-r', hint: 'refresh_token', clientId: 'de.signifikation.app' },
      { token: 'web-r', hint: 'refresh_token', clientId: 'de.signifikation.app.web' },
    ])
  })

  it('deleteUser löscht das Konto und widerruft danach bei Apple', async () => {
    const id = konto({ appleSub: 'sub-1', webRefresh: 'web-r' })
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    deleteUser(id)
    expect(db.prepare('SELECT 1 FROM user WHERE id = ?').get(id)).toBeUndefined()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/revoke')
    expect(form(fetchMock.mock.calls[0])).toMatchObject({ client_id: 'de.signifikation.app.web', token: 'web-r' })
  })

  it('ohne Apple-Login wird Apple bei der Löschung nicht kontaktiert', () => {
    const id = konto()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    deleteUser(id)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('revokeAppleTokens wirft nie und zählt Fehlschläge', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 400 }))
    const r = await revokeAppleTokens([{ token: 't', hint: 'refresh_token', clientId: 'de.signifikation.app' }], { fetchImpl })
    expect(r).toEqual({ revoked: 0, failed: 1 })
  })
})
