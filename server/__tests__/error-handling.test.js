// Fehlerkategorisierung (Review 2026-06-11, B-H3):
// Kategorien duerfen NUR aus Typ/err.code abgeleitet werden — das fruehere
// Message-Sniffing stufte interne Bugs mit "invalid" in der Message als
// 400/VALIDATION_ERROR ein (Client-Fehler, Warn-Log, im Monitoring unsichtbar).
import { describe, expect, it, vi } from 'vitest'
import { AppError, categorizeError, ErrorCategory, sendErrorResponse } from '../error-handling.js'

describe('categorizeError', () => {
  it('Regression: "invalid state" in der Message bleibt INTERNAL_ERROR (500)', () => {
    const err = new Error('invalid state: assignment already frozen')
    expect(categorizeError(err)).toBe('INTERNAL_ERROR')
    expect(ErrorCategory[categorizeError(err)].status).toBe(500)
  })

  it('Message-Woerter wie "database"/"file" triggern keine Kategorie mehr', () => {
    expect(categorizeError(new Error('could not open file'))).toBe('INTERNAL_ERROR')
    expect(categorizeError(new Error('database thing happened'))).toBe('INTERNAL_ERROR')
  })

  it('SQLITE_*-Codes → DATABASE_ERROR', () => {
    const err = new Error('UNIQUE constraint failed')
    err.code = 'SQLITE_CONSTRAINT_UNIQUE'
    expect(categorizeError(err)).toBe('DATABASE_ERROR')
  })

  it('Dateisystem-Codes → FILE_IO_ERROR', () => {
    for (const code of ['ENOENT', 'EACCES', 'EPERM']) {
      const err = new Error('fs op failed')
      err.code = code
      expect(categorizeError(err)).toBe('FILE_IO_ERROR')
    }
  })

  it('AppError-Kategorie wird respektiert (z.B. CORS → FORBIDDEN/403)', () => {
    const err = new AppError('FORBIDDEN', 'CORS: Unerlaubte Origin evil.example')
    expect(categorizeError(err)).toBe('FORBIDDEN')
    expect(err.status).toBe(403)
  })
})

describe('sendErrorResponse: Fehler des Body-Parsers', () => {
  const antwort = () => {
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) }
    return res
  }
  const fehler = (type, message = 'Unexpected token k in JSON at position 1: {kaputt') => Object.assign(new SyntaxError(message), { type, status: 400 })

  it.each([
    ['entity.parse.failed', 400, 'Ungültiges JSON'],
    ['entity.too.large', 413, 'Anfrage zu groß'],
    ['encoding.unsupported', 415, 'Nicht unterstützte Kodierung'],
    ['charset.unsupported', 415, 'Nicht unterstützter Zeichensatz'],
    ['request.aborted', 400, 'Anfrage abgebrochen'],
  ])('%s → %i ohne Details', (type, status, text) => {
    const res = antwort()
    // auch für angemeldete Admins und außerhalb von production: nie die Parse-Meldung
    sendErrorResponse(res, fehler(type), { authenticated: true })
    expect(res.status).toHaveBeenCalledWith(status)
    const body = res.json.mock.calls[0][0]
    expect(body.error).toBe(text)
    expect(body).not.toHaveProperty('details')
    expect(JSON.stringify(body)).not.toContain('kaputt')
  })

  it('andere Fehler bleiben 500', () => {
    const res = antwort()
    sendErrorResponse(res, new Error('boom'), {})
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
