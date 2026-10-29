// Play-Developer-API-Client (server/playKauf.js): URLs, Scope, 401-Wiederholung, Fehlerarten.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { exportPKCS8, generateKeyPair, decodeJwt } from 'jose'
import { createPlayApi, PlayKaufUnbekannt } from '../playKauf.js'

let sa
const BASIS = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/de.signifikation.app/purchases/products'

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  sa = {
    project_id: 'signifikation',
    client_email: 'play-kauf@signifikation.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
    token_uri: 'https://oauth2.googleapis.com/token',
  }
})

function fakeFetch(antworten) {
  const calls = []
  const queue = [...antworten]
  const impl = vi.fn(async (url, init) => {
    calls.push({ url, init })
    if (url === sa.token_uri) return new Response(JSON.stringify({ access_token: `at-${calls.length}`, expires_in: 3600 }))
    const next = queue.shift() ?? { status: 200, body: {} }
    return new Response(next.status === 204 ? null : JSON.stringify(next.body ?? {}), { status: next.status })
  })
  return { impl, calls }
}

describe('createPlayApi', () => {
  it('ist ohne Dienstkonto aus', async () => {
    const api = createPlayApi(null)
    expect(api.enabled).toBe(false)
    await expect(api.holeKauf('p', 't')).rejects.toThrow(/nicht konfiguriert/)
  })

  it('liest den Kauf mit androidpublisher-Scope und bestätigt per POST', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { purchaseState: 0, orderId: 'GPA.1' } }, { status: 204 }])
    const api = createPlayApi(sa, { fetchImpl: impl })
    expect(await api.holeKauf('de.signifikation.gesamtausgabe.petit', 'tok.1')).toMatchObject({ orderId: 'GPA.1' })
    await api.bestaetige('de.signifikation.gesamtausgabe.petit', 'tok.1')

    const oauth = calls.filter((c) => c.url === sa.token_uri)
    expect(oauth).toHaveLength(1)
    expect(decodeJwt(new URLSearchParams(oauth[0].init.body).get('assertion')).scope)
      .toBe('https://www.googleapis.com/auth/androidpublisher')
    const api_ = calls.filter((c) => c.url !== sa.token_uri)
    expect(api_[0].url).toBe(`${BASIS}/de.signifikation.gesamtausgabe.petit/tokens/tok.1`)
    expect(api_[1].url).toBe(`${BASIS}/de.signifikation.gesamtausgabe.petit/tokens/tok.1:acknowledge`)
    expect(api_[1].init.method).toBe('POST')
    expect(api_[1].init.headers.Authorization).toMatch(/^Bearer at-/)
  })

  it('holt nach 401 einmal ein neues Zugriffstoken', async () => {
    const { impl, calls } = fakeFetch([{ status: 401 }, { status: 200, body: { purchaseState: 0 } }])
    const api = createPlayApi(sa, { fetchImpl: impl })
    expect(await api.holeKauf('p', 't')).toEqual({ purchaseState: 0 })
    expect(calls.filter((c) => c.url === sa.token_uri)).toHaveLength(2)
  })

  it('unterscheidet unbekannte Käufe (404/410/400) von Serverfehlern', async () => {
    for (const status of [400, 404, 410]) {
      const api = createPlayApi(sa, { fetchImpl: fakeFetch([{ status }]).impl })
      await expect(api.holeKauf('p', 't')).rejects.toBeInstanceOf(PlayKaufUnbekannt)
    }
    const api = createPlayApi(sa, { fetchImpl: fakeFetch([{ status: 403, body: { error: { status: 'PERMISSION_DENIED' } } }]).impl })
    const err = await api.holeKauf('p', 't').catch((e) => e)
    expect(err).not.toBeInstanceOf(PlayKaufUnbekannt)
    expect(err.message).toMatch(/403 PERMISSION_DENIED/)
  })
})
