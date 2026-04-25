/**
 * Tests für Auth-Middleware (Vitest, `npm test`).
 */

import { timingSafeEqual } from 'crypto'
import { describe, test, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ermöglicht Referenzierung der Mocks in vi.mock-Factory
const { mockDbGet } = vi.hoisted(() => ({ mockDbGet: vi.fn() }))

vi.mock('../db.js', () => ({
  default: {
    prepare: vi.fn(() => ({ get: mockDbGet, run: vi.fn() })),
  },
}))

import { csrfProtect, csrfProtectUpload, requireAuth } from './auth.js'

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
    beforeEach(() => {
      vi.clearAllMocks()
    })

    test('kein Cookie → 401', async () => {
      const req  = mockReq({ cookies: {} })
      const res  = mockRes()
      const next = vi.fn()
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    test('Token nicht in DB → 401', async () => {
      mockDbGet.mockReturnValueOnce(null)
      const req  = mockReq({ cookies: { 'better-auth.session_token': 'unbekanntes-token' } })
      const res  = mockRes()
      const next = vi.fn()
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    test('gültige Session, kein Profil → 403', async () => {
      mockDbGet
        .mockReturnValueOnce({ id: 'sess-1', userId: 'user-1' })
        .mockReturnValueOnce(null)
      const req  = mockReq({ cookies: { 'better-auth.session_token': 'valid-token' } })
      const res  = mockRes()
      const next = vi.fn()
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })

    test('gültige Session, role=user → 403', async () => {
      mockDbGet
        .mockReturnValueOnce({ id: 'sess-1', userId: 'user-1' })
        .mockReturnValueOnce({ role: 'user' })
      const req  = mockReq({ cookies: { 'better-auth.session_token': 'valid-token' } })
      const res  = mockRes()
      const next = vi.fn()
      await requireAuth(req, res, next)
      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })

    test('gültige Session, Admin-Profil → next()', async () => {
      mockDbGet
        .mockReturnValueOnce({ id: 'sess-1', userId: 'user-1' })
        .mockReturnValueOnce({ role: 'admin' })
      const req  = mockReq({ cookies: { 'better-auth.session_token': 'valid-token' } })
      const res  = mockRes()
      const next = vi.fn()
      await requireAuth(req, res, next)
      expect(next).toHaveBeenCalledOnce()
      expect(res.status).not.toHaveBeenCalled()
    })

    test('req.session.userId gesetzt (betterAuth-Route) → direkte Role-Prüfung', async () => {
      mockDbGet.mockReturnValueOnce({ role: 'admin' })
      const req  = mockReq({ session: { id: 'sess-1', userId: 'user-1' }, cookies: {} })
      const res  = mockRes()
      const next = vi.fn()
      await requireAuth(req, res, next)
      expect(next).toHaveBeenCalledOnce()
    })
  })
})
