import { beforeEach, describe, expect, it } from 'vitest'
import {
  isJoinBlocked,
  recordJoinFailure,
  resetJoinGuard,
  pruneJoinGuard,
  JOIN_GUARD_WINDOW_MS,
  JOIN_GUARD_MAX_FAILURES_PER_CODE,
  JOIN_GUARD_MAX_FAILURES_GLOBAL,
} from '../classroom/join-guard.js'
import { generateJoinCode, isValidJoinCodeFormat, JOIN_CODE_WORDS } from '../classroom/join-codes.js'

describe('join-guard (pro Code + globaler Backstop)', () => {
  beforeEach(() => resetJoinGuard())

  it('blockiert anfangs nicht', () => {
    expect(isJoinBlocked('apfel-birne')).toBe(false)
  })

  it('blockiert einen Code nach MAX_FAILURES_PER_CODE Fehlversuchen', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE - 1; i++) recordJoinFailure('apfel-birne', now)
    expect(isJoinBlocked('apfel-birne', now)).toBe(false)
    recordJoinFailure('apfel-birne', now)
    expect(isJoinBlocked('apfel-birne', now)).toBe(true)
  })

  it('DoS-Fix (S-M1): Angriff auf Code X blockiert Code Y NICHT', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE * 2; i++) {
      recordJoinFailure('boese-attacke', now)
    }
    expect(isJoinBlocked('boese-attacke', now)).toBe(true)
    expect(isJoinBlocked('echte-klasse', now)).toBe(false)
  })

  it('Code-Vergleich ist case-/whitespace-insensitiv', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE; i++) recordJoinFailure('  APFEL-Birne ', now)
    expect(isJoinBlocked('apfel-birne', now)).toBe(true)
  })

  it('gibt nach Ablauf des Fensters wieder frei', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE; i++) recordJoinFailure('apfel-birne', now)
    expect(isJoinBlocked('apfel-birne', now)).toBe(true)
    expect(isJoinBlocked('apfel-birne', now + JOIN_GUARD_WINDOW_MS + 1)).toBe(false)
  })

  it('globaler Backstop blockiert breite Enumeration ueber viele Codes', () => {
    const now = 1_000_000
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_GLOBAL; i++) {
      recordJoinFailure(`enum-code-${i}`, now)
    }
    // Auch ein nie probierter Code ist jetzt blockiert (Backstop)
    expect(isJoinBlocked('unbeteiligter-code', now)).toBe(true)
    expect(isJoinBlocked('unbeteiligter-code', now + JOIN_GUARD_WINDOW_MS + 1)).toBe(false)
  })

  it('pruneJoinGuard raeumt abgelaufene Code-Eintraege ab', () => {
    const now = 1_000_000
    recordJoinFailure('alter-code', now)
    pruneJoinGuard(now + JOIN_GUARD_WINDOW_MS + 1)
    expect(isJoinBlocked('alter-code', now + JOIN_GUARD_WINDOW_MS + 1)).toBe(false)
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
