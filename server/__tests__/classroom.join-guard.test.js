import { beforeEach, describe, expect, it } from 'vitest'
import {
  isJoinBlocked,
  recordJoinFailure,
  resetJoinGuard,
  JOIN_GUARD_WINDOW_MS,
  JOIN_GUARD_MAX_FAILURES,
} from '../classroom/join-guard.js'
import { generateJoinCode, isValidJoinCodeFormat, JOIN_CODE_WORDS } from '../classroom/join-codes.js'

describe('join-guard (globaler Brute-Force-Schutz)', () => {
  beforeEach(() => resetJoinGuard())

  it('blockiert anfangs nicht', () => {
    expect(isJoinBlocked()).toBe(false)
  })

  it('blockiert nach MAX_FAILURES Fehlversuchen im Fenster', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES - 1; i++) recordJoinFailure(now)
    expect(isJoinBlocked(now)).toBe(false)
    recordJoinFailure(now)
    expect(isJoinBlocked(now)).toBe(true)
  })

  it('gibt nach Ablauf des Fensters wieder frei', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES; i++) recordJoinFailure(now)
    expect(isJoinBlocked(now)).toBe(true)
    expect(isJoinBlocked(now + JOIN_GUARD_WINDOW_MS + 1)).toBe(false)
  })

  it('zaehlt nur Fehlversuche innerhalb des Fensters', () => {
    const now = 1_000_000
    // Hälfte alt, Hälfte neu — alte fallen raus, kein Block
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES / 2; i++) recordJoinFailure(now)
    const later = now + JOIN_GUARD_WINDOW_MS + 1
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES / 2; i++) recordJoinFailure(later)
    expect(isJoinBlocked(later)).toBe(false)
  })
})

describe('JOIN_CODE_WORDS (Wortliste)', () => {
  it('hat genug Woerter fuer ausreichende Entropie (>= 200)', () => {
    expect(JOIN_CODE_WORDS.length).toBeGreaterThanOrEqual(200)
  })

  it('enthaelt nur Kleinbuchstaben a-z (keine Umlaute/Sonderzeichen)', () => {
    for (const w of JOIN_CODE_WORDS) {
      expect(w, `Wort "${w}" verletzt das Format`).toMatch(/^[a-z]+$/)
    }
  })

  it('enthaelt keine Duplikate', () => {
    expect(new Set(JOIN_CODE_WORDS).size).toBe(JOIN_CODE_WORDS.length)
  })

  it('jedes Wort kann mindestens ein laengen-gueltiges Paar bilden (keine toten Woerter)', () => {
    for (const w of JOIN_CODE_WORDS) {
      const hasPartner = JOIN_CODE_WORDS.some(
        p => p !== w && isValidJoinCodeFormat(`${w}-${p}`),
      )
      expect(hasPartner, `Wort "${w}" kann nie in einem gueltigen Code auftauchen`).toBe(true)
    }
  })
})

describe('generateJoinCode (Krypto-Default)', () => {
  it('liefert ohne injizierten randomFn gueltige Codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode()
      expect(isValidJoinCodeFormat(code)).toBe(true)
    }
  })
})
