// Fehlerkategorisierung (Review 2026-06-11, B-H3):
// Kategorien duerfen NUR aus Typ/err.code abgeleitet werden — das fruehere
// Message-Sniffing stufte interne Bugs mit "invalid" in der Message als
// 400/VALIDATION_ERROR ein (Client-Fehler, Warn-Log, im Monitoring unsichtbar).
import { describe, expect, it } from 'vitest'
import { AppError, categorizeError, ErrorCategory } from '../error-handling.js'

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
