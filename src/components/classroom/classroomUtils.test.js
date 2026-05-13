import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDateTime,
  formatElapsed,
  formatStagnation,
  getErrorMessage,
  humanizeJoinError,
  mapSessionState,
  sanitizeJoinCodeInput,
} from './classroomUtils'

// ── formatDateTime ─────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('gibt —  zurück wenn kein Wert übergeben', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('')).toBe('—')
  })

  it('formatiert ISO-Timestamp als lesbares DE-Datum', () => {
    const ts = new Date('2025-03-15T10:30:00Z').getTime()
    const result = formatDateTime(ts)
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{2}/)
  })

  it('gibt String-Fallback bei komplett ungültigem Wert', () => {
    const result = formatDateTime('kein-datum')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ── mapSessionState ────────────────────────────────────────────────

describe('mapSessionState', () => {
  it.each([
    ['running',  'Laufend'],
    ['lobby',    'Wartend'],
    ['finished', 'Beendet'],
    ['archived', 'Archiviert'],
    ['created',  'Vorbereitet'],
  ])('mappt %s → %s', (state, label) => {
    expect(mapSessionState(state)).toBe(label)
  })

  it('gibt übergebenen Wert zurück bei unbekanntem State', () => {
    expect(mapSessionState('unbekannt')).toBe('unbekannt')
  })

  it('gibt Unbekannt zurück bei leerem State', () => {
    expect(mapSessionState('')).toBe('Unbekannt')
    expect(mapSessionState(null)).toBe('Unbekannt')
    expect(mapSessionState(undefined)).toBe('Unbekannt')
  })
})

// ── formatElapsed ──────────────────────────────────────────────────

describe('formatElapsed', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gibt — zurück wenn kein startedAt', () => {
    expect(formatElapsed(null)).toBe('—')
    expect(formatElapsed(undefined)).toBe('—')
  })

  it('formatiert unter einer Stunde als MM:SS', () => {
    const startedAt = Date.now() - 5 * 60 * 1000 - 30 * 1000  // 5:30 ago
    expect(formatElapsed(startedAt)).toBe('05:30')
  })

  it('formatiert über eine Stunde als H:MM:SS', () => {
    const startedAt = Date.now() - 65 * 60 * 1000 - 7 * 1000  // 1:05:07 ago
    expect(formatElapsed(startedAt)).toBe('1:05:07')
  })

  it('gibt 00:00 für startedAt = jetzt', () => {
    expect(formatElapsed(Date.now())).toBe('00:00')
  })
})

// ── formatStagnation ───────────────────────────────────────────────

describe('formatStagnation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gibt null zurück wenn kein lastAt', () => {
    expect(formatStagnation(null)).toBeNull()
    expect(formatStagnation(undefined)).toBeNull()
  })

  it('gibt "gerade eben" für unter 1 Minute', () => {
    expect(formatStagnation(Date.now() - 30_000)).toBe('gerade eben')
  })

  it('gibt "vor 1 Minute" für genau 1 Minute', () => {
    expect(formatStagnation(Date.now() - 60_000)).toBe('vor 1 Minute')
  })

  it('gibt "vor N Minuten" für 2–59 Minuten', () => {
    expect(formatStagnation(Date.now() - 15 * 60_000)).toBe('vor 15 Minuten')
  })

  it('gibt "vor über einer Stunde" für ≥60 Minuten', () => {
    expect(formatStagnation(Date.now() - 61 * 60_000)).toBe('vor über einer Stunde')
  })
})

// ── getErrorMessage ────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('gibt Fallback zurück wenn payload null', () => {
    expect(getErrorMessage(null, 'Fehler')).toBe('Fehler')
  })

  it('gibt payload.error zurück wenn vorhanden', () => {
    expect(getErrorMessage({ error: 'Server nicht erreichbar' }, 'Fallback')).toBe('Server nicht erreichbar')
  })

  it('gibt Fallback zurück wenn payload.error leer ist', () => {
    expect(getErrorMessage({ error: '  ' }, 'Fallback')).toBe('Fallback')
    expect(getErrorMessage({ error: '' }, 'Fallback')).toBe('Fallback')
  })

  it('gibt Fallback zurück wenn payload.error kein String ist', () => {
    expect(getErrorMessage({ error: 42 }, 'Fallback')).toBe('Fallback')
  })
})

// ── sanitizeJoinCodeInput ──────────────────────────────────────────

describe('sanitizeJoinCodeInput', () => {
  it('entfernt Großbuchstaben', () => {
    expect(sanitizeJoinCodeInput('ABC-DEF')).toBe('abc-def')
  })

  it('entfernt Sonderzeichen außer Bindestrich', () => {
    expect(sanitizeJoinCodeInput('abc!@#def')).toBe('abcdef')
  })

  it('entfernt mehrfache Bindestriche', () => {
    expect(sanitizeJoinCodeInput('abc---def')).toBe('abc-def')
  })

  it('gibt leeren String zurück für null/undefined', () => {
    expect(sanitizeJoinCodeInput(null)).toBe('')
    expect(sanitizeJoinCodeInput(undefined)).toBe('')
  })

  it('lässt gültige Codes unverändert', () => {
    expect(sanitizeJoinCodeInput('abc-def')).toBe('abc-def')
  })
})

// ── humanizeJoinError ──────────────────────────────────────────────

describe('humanizeJoinError', () => {
  it('erklärt ungültigen/abgelaufenen Code', () => {
    const result = humanizeJoinError('Code ungueltig')
    expect(result).toContain('Zugangscode ungültig')
  })

  it('erklärt Rate-Limiting', () => {
    const result = humanizeJoinError('Zu viele Versuche')
    expect(result).toContain('5 Minuten')
  })

  it('gibt Originaltext zurück bei unbekanntem Fehler', () => {
    expect(humanizeJoinError('Interner Fehler')).toBe('Interner Fehler')
  })

  it('gibt Fallback zurück bei leerem Fehler', () => {
    expect(humanizeJoinError('')).toBe('Beitritt fehlgeschlagen.')
    expect(humanizeJoinError(null)).toBe('Beitritt fehlgeschlagen.')
  })
})
