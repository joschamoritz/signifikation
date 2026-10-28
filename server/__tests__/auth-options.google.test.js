// /api/v1/account/auth-options: Google an native Apps nur mit ?nativeGoogle=1.
// Schutz für die iOS-App 1.6.0 aus dem Store, die Google sonst als
// Web-Redirect im WebView anböte (blockt Google). Web bekommt Google immer.
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const WEB_ID = '123-web.apps.googleusercontent.com'

describe('auth-options mit konfiguriertem Google-Login', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    vi.stubEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', WEB_ID)
    vi.stubEnv('BETTER_AUTH_GOOGLE_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('BETTER_AUTH_GOOGLE_IOS_CLIENT_ID', '123-ios.apps.googleusercontent.com')
    vi.resetModules()
    const { default: accountRouter } = await import('../routes/account.js')
    const app = express()
    app.use(express.json())
    app.use('/', accountRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    vi.resetModules()
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  const get = (query, origin) => fetch(`${baseUrl}/api/v1/account/auth-options${query}`, {
    headers: origin ? { origin } : {},
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

  it('Web: Google an, mit Web-Client-ID', async () => {
    const { body } = await get('', 'https://signifikation.de')
    expect(body.googleEnabled).toBe(true)
    expect(body.googleClientId).toBe(WEB_ID)
  })

  it('iOS-App ohne Parameter (1.6.0): Google aus', async () => {
    const { body } = await get('', 'capacitor://localhost')
    expect(body.googleEnabled).toBe(false)
    expect(body.googleClientId).toBeNull()
  })

  it('Android-App mit nativeGoogle=1: Google an', async () => {
    const { body } = await get('?nativeGoogle=1', 'https://localhost')
    expect(body.googleEnabled).toBe(true)
    expect(body.googleClientId).toBe(WEB_ID)
  })

  it('Android-App ohne Parameter: Google aus', async () => {
    const { body } = await get('', 'https://localhost')
    expect(body.googleEnabled).toBe(false)
  })

  it('lehnt unbekannte Werte für nativeGoogle ab', async () => {
    const { status } = await get('?nativeGoogle=ja', 'https://localhost')
    expect(status).toBe(400)
  })
})
