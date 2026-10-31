// Paritaets- und Prod-Verhalten der Origin-Konfiguration.
//
// Hintergrund (Review 2026-06-11, B-H2): auth/index.js hatte eine eigene,
// gedriftete Kopie der Origin-Liste. Diese Tests verhindern eine erneute
// Drift und sichern die Prod-Invarianten von config/origins.js ab.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ALLOWED_ORIGINS, CAPACITOR_ORIGINS, isAllowedOrigin } from '../config/origins.js'
import { trustedOrigins } from '../auth/index.js'

describe('Origin-Paritaet better-auth ↔ config/origins.js', () => {
  it('trustedOrigins entspricht exakt ALLOWED_ORIGINS ∪ CAPACITOR_ORIGINS', () => {
    const expected = new Set([...ALLOWED_ORIGINS, ...CAPACITOR_ORIGINS])
    expect(new Set(trustedOrigins)).toEqual(expected)
  })

  it('isAllowedOrigin akzeptiert alle trustedOrigins', () => {
    for (const origin of trustedOrigins) {
      expect(isAllowedOrigin(origin)).toBe(true)
    }
  })
})

describe('config/origins.js in Production', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function loadProdOrigins() {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOWED_ORIGINS', '')
    vi.resetModules()
    return await import('../config/origins.js')
  }

  it('http://localhost ist in Prod NICHT erlaubt (SameSite=None-Cookie-Schutz)', async () => {
    const prod = await loadProdOrigins()
    expect(prod.CAPACITOR_ORIGINS).not.toContain('http://localhost')
    expect(prod.isAllowedOrigin('http://localhost')).toBe(false)
  })

  it('Capacitor-Origins (iOS + Android) sind in Prod erlaubt', async () => {
    const prod = await loadProdOrigins()
    expect(prod.isAllowedOrigin('capacitor://localhost')).toBe(true)
    expect(prod.isAllowedOrigin('https://localhost')).toBe(true)
  })

  it('Default-Web-Origin in Prod ist signifikation.de', async () => {
    const prod = await loadProdOrigins()
    expect(prod.ALLOWED_ORIGINS).toEqual(['https://signifikation.de'])
  })
})

describe('CORS-Ausnahme für Apples Web-Login-Callback', () => {
  // Wie server/index.js in Produktion: fremde Origin → AppError(FORBIDDEN) → 403
  async function starte() {
    const { default: express } = await import('express')
    const { default: cors } = await import('cors')
    const { corsAusserAppleCallback, isAllowedOrigin } = await import('../config/origins.js')
    const { AppError, errorHandler } = await import('../error-handling.js')
    const app = express()
    app.use(corsAusserAppleCallback(cors({
      origin: (origin, cb) => (isAllowedOrigin(origin) ? cb(null, true) : cb(new AppError('FORBIDDEN', 'CORS'))),
      credentials: true,
    })))
    app.all('/{*pfad}', (_req, res) => res.send('ok'))
    app.use(errorHandler)
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
    return { server, url: `http://127.0.0.1:${server.address().port}` }
  }

  it('lässt nur Apples Formular-POST an den Callback durch, ohne CORS-Header', async () => {
    const { server, url } = await starte()
    try {
      const anfrage = (pfad, origin, method = 'POST') => fetch(url + pfad, {
        method, headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? 'state=x&code=y' : undefined,
      })
      const apple = await anfrage('/api/v1/auth/callback/apple', 'https://appleid.apple.com')
      expect(apple.status).toBe(200)
      expect(apple.headers.get('access-control-allow-origin')).toBeNull()
      expect((await anfrage('/api/v1/auth/callback/google', 'https://appleid.apple.com')).status).toBe(403)
      expect((await anfrage('/api/v1/auth/callback/apple', 'https://appleid.apple.com', 'GET')).status).toBe(403)
      expect((await anfrage('/api/v1/auth/callback/apple', 'https://boese.example')).status).toBe(403)
    } finally {
      server.close()
    }
  })
})

describe('better-auth vertraut appleid.apple.com nur bei aktivem Apple-Login', () => {
  // Der Apple-Callback kommt per form_post mit Origin appleid.apple.com; mit Cookies prüft better-auth sie.
  // Im Test (NODE_ENV=test) überspringt better-auth diese Prüfung, deshalb wird die Liste geprüft.
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('mit Apple-Login: appleid.apple.com in trustedOrigins, CORS bleibt streng', async () => {
    vi.stubEnv('BETTER_AUTH_APPLE_CLIENT_ID', 'de.signifikation.web')
    vi.stubEnv('BETTER_AUTH_APPLE_CLIENT_SECRET', 'platzhalter')
    vi.resetModules()
    const { trustedOrigins: mitApple } = await import('../auth/index.js')
    const { APPLE_ORIGIN, isAllowedOrigin: erlaubt } = await import('../config/origins.js')
    expect(mitApple).toContain(APPLE_ORIGIN)
    expect(erlaubt(APPLE_ORIGIN)).toBe(false)
  })

  it('ohne Apple-Login bleibt appleid.apple.com draußen', async () => {
    vi.stubEnv('BETTER_AUTH_APPLE_CLIENT_ID', '')
    vi.stubEnv('BETTER_AUTH_APPLE_CLIENT_SECRET', '')
    vi.resetModules()
    const { trustedOrigins: ohneApple } = await import('../auth/index.js')
    expect(ohneApple).not.toContain('https://appleid.apple.com')
  })
})
