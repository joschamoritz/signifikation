/**
 * Tests für Auth-Middleware (Vitest, `npm test`).
 */

import { timingSafeEqual } from 'crypto'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSession, csrfProtect, csrfProtectUpload, requireAuth } from './auth.js'

// ── Hilfsfunktion: minimales req/res/next-Mock ────────────────
function mockReq(overrides = {}) {
  return { method: 'GET', headers: {}, cookies: {}, body: {}, ip: '127.0.0.1', ...overrides }
}
function mockRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json   = vi.fn(() => res)
  return res
}

describe('Auth-Middleware', () => {
  // ── createSession ────────────────────────────────────────────
  describe('createSession', () => {
    test('erstellt Token mit korrektem Format (3 Teile)', () => {
      const session = createSession()
      expect(session.token).toBeDefined()
      expect(session.expiresAt).toBeDefined()
      expect(typeof session.token).toBe('string')
      expect(session.token.split('.').length).toBe(3)
    })

    test('Token ist eindeutig', () => {
      const s1 = createSession()
      const s2 = createSession()
      expect(s1.token).not.toBe(s2.token)
    })

    test('expiresAt liegt in der Zukunft (8h+)', () => {
      const session = createSession()
      const ttl = session.expiresAt - Date.now()
      const eightHours = 8 * 60 * 60 * 1000
      expect(ttl).toBeGreaterThan(eightHours - 1000)
      expect(ttl).toBeLessThan(eightHours + 1000)
    })
  })

  // ── Timing-Safety ────────────────────────────────────────────
  describe('Constant-Time-Comparison', () => {
    test('timingSafeEqual vergleicht Inhalt constant-time (gleiche Länge)', () => {
      const a = Buffer.from('secret123')
      const b = Buffer.from('secret123')
      const c = Buffer.from('wrong1234')
      expect(timingSafeEqual(a, b)).toBe(true)
      expect(timingSafeEqual(a, c)).toBe(false)
    })

    test('Längen-Mismatch wirft Fehler', () => {
      expect(() => timingSafeEqual(Buffer.from('abc'), Buffer.from('abcd'))).toThrow()
    })
  })

  // ── csrfProtect ──────────────────────────────────────────────
  describe('csrfProtect', () => {
    test('GET-Requests werden durchgelassen', () => {
      const req  = mockReq({ method: 'GET' })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtect(req, res, next)
      expect(next).toHaveBeenCalledOnce()
      expect(res.status).not.toHaveBeenCalled()
    })

    test('POST mit application/json wird durchgelassen', () => {
      const req  = mockReq({ method: 'POST', headers: { 'content-type': 'application/json' } })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtect(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })

    test('POST ohne application/json → 403', () => {
      const req  = mockReq({ method: 'POST', headers: { 'content-type': 'multipart/form-data' } })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtect(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }))
      expect(next).not.toHaveBeenCalled()
    })

    test('DELETE ohne application/json → 403', () => {
      const req  = mockReq({ method: 'DELETE', headers: { 'content-type': 'text/plain' } })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtect(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    test('POST ohne Content-Type → 403', () => {
      const req  = mockReq({ method: 'POST', headers: {} })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtect(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  // ── csrfProtectUpload ────────────────────────────────────────
  describe('csrfProtectUpload', () => {
    test('POST mit application/octet-stream wird durchgelassen', () => {
      const req  = mockReq({ method: 'POST', headers: { 'content-type': 'application/octet-stream' } })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtectUpload(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })

    test('POST mit application/json wird durchgelassen', () => {
      const req  = mockReq({ method: 'POST', headers: { 'content-type': 'application/json' } })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtectUpload(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })

    test('POST mit multipart/form-data → 403', () => {
      const req  = mockReq({ method: 'POST', headers: { 'content-type': 'multipart/form-data' } })
      const res  = mockRes()
      const next = vi.fn()
      csrfProtectUpload(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  // ── requireAuth ──────────────────────────────────────────────
  describe('requireAuth', () => {
    test('gültiger Cookie → next()', () => {
      const { token } = createSession()
      const req  = mockReq({ cookies: { admin_token: token } })
      const res  = mockRes()
      const next = vi.fn()
      requireAuth(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })

    test('gültiger X-Admin-Token-Header → next() (Legacy-Fallback)', () => {
      const { token } = createSession()
      const req  = mockReq({ cookies: {}, headers: { 'x-admin-token': token } })
      const res  = mockRes()
      const next = vi.fn()
      requireAuth(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })

    test('kein Token → 401', () => {
      const req  = mockReq({ cookies: {} })
      const res  = mockRes()
      const next = vi.fn()
      requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    test('ungültiger Token (manipuliertes HMAC) → 401', () => {
      const { token } = createSession()
      const parts = token.split('.')
      const tampered = `${parts[0]}.${parts[1]}.deadbeefdeadbeef`
      const req  = mockReq({ cookies: { admin_token: tampered } })
      const res  = mockRes()
      const next = vi.fn()
      requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
    })

    test('falsches Token-Format (zu wenig Teile) → 401', () => {
      const req  = mockReq({ cookies: { admin_token: 'nur-ein-teil' } })
      const res  = mockRes()
      const next = vi.fn()
      requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
    })

    test('abgelaufener Token → 401', () => {
      const { token } = createSession()
      const [uuid, , hmac] = token.split('.')
      // Timestamp in der Vergangenheit
      const expired = `${uuid}.${Date.now() - 1000}.${hmac}`
      const req  = mockReq({ cookies: { admin_token: expired } })
      const res  = mockRes()
      const next = vi.fn()
      requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
    })
  })
})
