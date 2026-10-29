// Android-Push über FCM (server/notifications/fcm.js): OAuth per Dienstkonto-JWT,
// Token-Cache, Nachrichtenformat und das Löschkriterium UNREGISTERED.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { exportPKCS8, generateKeyPair, decodeJwt, decodeProtectedHeader } from 'jose'
import { buildMessage, createFcmSender, isUnregistered, loadServiceAccount, ANDROID_CHANNEL_ID } from '../notifications/fcm.js'

let sa

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  sa = {
    project_id: 'test-projekt',
    client_email: 'fcm@test-projekt.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    private_key_id: 'kid-123',
    token_uri: 'https://oauth2.googleapis.com/token',
  }
})

function fakeFetch(sendResponses) {
  const calls = []
  const queue = [...sendResponses]
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, init })
    if (url === sa.token_uri) {
      return new Response(JSON.stringify({ access_token: `at-${calls.length}`, expires_in: 3600 }), { status: 200 })
    }
    const next = queue.shift() ?? { status: 200, body: { name: 'projects/x/messages/1' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  })
  return { impl, calls }
}

describe('buildMessage', () => {
  it('setzt Token, Titel, Text, Kanal und url als data', () => {
    const m = buildMessage('tok', { title: 'T', body: 'B', url: '/' }).message
    expect(m.token).toBe('tok')
    expect(m.notification).toEqual({ title: 'T', body: 'B' })
    expect(m.data).toEqual({ url: '/' })
    expect(m.android.notification.channel_id).toBe(ANDROID_CHANNEL_ID)
  })
})

describe('isUnregistered', () => {
  it('erkennt UNREGISTERED in den Fehlerdetails', () => {
    const body = { error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } }
    expect(isUnregistered(404, body)).toBe(true)
  })

  it('erkennt Tokens eines anderen Firebase-Projekts (SENDER_ID_MISMATCH)', () => {
    const body = { error: { status: 'PERMISSION_DENIED', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } }
    expect(isUnregistered(403, body)).toBe(true)
  })

  it('löscht NICHT bei allgemeinem INVALID_ARGUMENT (kann an der Nachricht liegen)', () => {
    const body = { error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'INVALID_ARGUMENT' }] } }
    expect(isUnregistered(400, body)).toBe(false)
    expect(isUnregistered(500, null)).toBe(false)
  })
})

describe('loadServiceAccount', () => {
  it('liefert null statt zu werfen, wenn die Datei fehlt', () => {
    const log = { error: vi.fn() }
    expect(loadServiceAccount('/gibt/es/nicht.json', log)).toBeNull()
    expect(log.error).toHaveBeenCalled()
    expect(loadServiceAccount(undefined, log)).toBeNull()
  })
})

describe('createFcmSender', () => {
  it('ist ohne Dienstkonto aus und sendet nichts', async () => {
    const s = createFcmSender(null)
    expect(s.enabled).toBe(false)
    expect((await s.send('tok', { title: 'T', body: 'B' })).ok).toBe(false)
  })

  it('holt das Zugriffstoken per JWT einmal und nutzt es für weitere Sendungen', async () => {
    const { impl, calls } = fakeFetch([])
    const s = createFcmSender(sa, { fetchImpl: impl })
    expect((await s.send('tok-1', { title: 'T', body: 'B' })).ok).toBe(true)
    expect((await s.send('tok-2', { title: 'T', body: 'B' })).ok).toBe(true)

    const oauth = calls.filter((c) => c.url === sa.token_uri)
    expect(oauth).toHaveLength(1)
    const assertion = new URLSearchParams(oauth[0].init.body).get('assertion')
    expect(decodeProtectedHeader(assertion)).toMatchObject({ alg: 'RS256', kid: 'kid-123' })
    expect(decodeJwt(assertion)).toMatchObject({
      iss: sa.client_email,
      aud: sa.token_uri,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })

    const send = calls.find((c) => c.url.includes('/messages:send'))
    expect(send.url).toBe('https://fcm.googleapis.com/v1/projects/test-projekt/messages:send')
    expect(send.init.headers.Authorization).toMatch(/^Bearer at-/)
  })

  it('holt nach 401 ein neues Zugriffstoken', async () => {
    const { impl, calls } = fakeFetch([{ status: 401, body: { error: { status: 'UNAUTHENTICATED' } } }])
    const s = createFcmSender(sa, { fetchImpl: impl })
    expect((await s.send('tok', { title: 'T', body: 'B' })).ok).toBe(false)
    expect((await s.send('tok', { title: 'T', body: 'B' })).ok).toBe(true)
    expect(calls.filter((c) => c.url === sa.token_uri)).toHaveLength(2)
  })

  it('meldet unregistered für ein abgemeldetes Gerät', async () => {
    const { impl } = fakeFetch([{ status: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }])
    const s = createFcmSender(sa, { fetchImpl: impl })
    expect(await s.send('tok', { title: 'T', body: 'B' })).toEqual({ ok: false, unregistered: true, status: 404 })
  })
})
