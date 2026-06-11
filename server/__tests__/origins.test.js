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
