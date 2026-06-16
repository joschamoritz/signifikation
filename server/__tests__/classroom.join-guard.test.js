import { beforeEach, describe, expect, it, vi } from 'vitest'

// reportAlert mocken — Alert-Feuern beobachten, ohne echte Webhooks/Cooldowns.
vi.mock('../alerting.js', () => ({ reportAlert: vi.fn() }))
import { reportAlert } from '../alerting.js'

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

// ── Alert-Feuern + Sicherheits-Invarianten ─────────────────────────────────
// Ergaenzt die obige funktionale Abdeckung um die Verhaltensweisen, die in
// 08bc092 noch nicht abgesichert waren: reportAlert-Feuern, Pruefreihenfolge,
// der dokumentierte Block-DoS-Schutz und der globale Wachstums-Cap.
describe('join-guard – Alerts + Anti-DoS-Invarianten', () => {
  const now = 1_000_000

  beforeEach(() => {
    resetJoinGuard()
    vi.mocked(reportAlert).mockClear()
  })

  it('feuert KEINEN Alert unterhalb der Schwellen', () => {
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE - 1; i++) recordJoinFailure('apfel-birne', now)
    expect(isJoinBlocked('apfel-birne', now)).toBe(false)
    expect(reportAlert).not.toHaveBeenCalled()
  })

  it('feuert den Code-Alert bei Aktivierung der per-Code-Schwelle', () => {
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE; i++) recordJoinFailure('apfel-birne', now)
    expect(isJoinBlocked('apfel-birne', now)).toBe(true)
    expect(reportAlert).toHaveBeenCalledWith('join_guard_code', expect.any(String))
  })

  it('feuert den globalen Alert bei Aktivierung der Backstop-Schwelle', () => {
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_GLOBAL; i++) recordJoinFailure(`enum-${i}`, now)
    expect(isJoinBlocked('unbeteiligt', now)).toBe(true)
    expect(reportAlert).toHaveBeenCalledWith('join_guard_global', expect.any(String))
  })

  it('prueft die globale Schwelle VOR der per-Code-Schwelle (nur globaler Alert)', () => {
    // Globale Schwelle reissen, ohne dass der geprüfte Code per-Code-Treffer hat.
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_GLOBAL; i++) recordJoinFailure(`enum-${i}`, now)
    isJoinBlocked('frischer-code', now)
    expect(reportAlert).toHaveBeenCalledWith('join_guard_global', expect.any(String))
    expect(reportAlert).not.toHaveBeenCalledWith('join_guard_code', expect.any(String))
  })

  it('Block-DoS-Schutz: blockierte Versuche verlaengern das Fenster NICHT', () => {
    // 10 Fehlversuche bei `now` → blockiert; das Fenster ist an `now` verankert.
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_PER_CODE; i++) recordJoinFailure('apfel-birne', now)
    // Weitere Versuche mitten im Fenster: der per-Code-Cap verhindert das
    // Aufzeichnen → das Fenster wird NICHT auf den spaeteren Zeitpunkt verschoben.
    const mid = now + JOIN_GUARD_WINDOW_MS / 2
    for (let i = 0; i < 50; i++) recordJoinFailure('apfel-birne', mid)
    // Genau WINDOW_MS nach `now` (nicht nach `mid`) ist der Code wieder frei.
    expect(isJoinBlocked('apfel-birne', now + JOIN_GUARD_WINDOW_MS)).toBe(false)
  })

  it('globaler Zaehler waechst nicht unbegrenzt (Cap → kein Speicherleck/Fenster-Drift)', () => {
    // Weit ueber die Schwelle hinaus auf distinct Codes. Beobachtbar: nach
    // Fensterablauf ist alles verfallen — kein „Ueberhang", der laenger blockt.
    for (let i = 0; i < JOIN_GUARD_MAX_FAILURES_GLOBAL + 200; i++) recordJoinFailure(`flood-${i}`, now)
    expect(isJoinBlocked('frisch', now)).toBe(true)
    expect(isJoinBlocked('frisch', now + JOIN_GUARD_WINDOW_MS)).toBe(false)
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
