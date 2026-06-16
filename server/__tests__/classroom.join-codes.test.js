/**
 * server/__tests__/classroom.join-codes.test.js
 *
 * Unit-Tests für server/classroom/join-codes.js:
 *   - normalizeJoinCode   (Normalisierung von Eingaben)
 *   - isValidJoinCodeFormat (Format-Validierung)
 *   - generateJoinCode    (Kodegenerierung inkl. Collision-Handling + Fallback)
 *
 * Die JOIN_CODE_WORDS-Wortliste und generateJoinCode werden im
 * join-guard-Test (classroom.join-guard.test.js) nur oberflächlich gestreift.
 * Hier testen wir die Funktionen vollständig isoliert.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeJoinCode,
  isValidJoinCodeFormat,
  generateJoinCode,
  JOIN_CODE_WORDS,
} from '../classroom/join-codes.js'

// ── JOIN_CODE_WORDS ───────────────────────────────────────────────────────────
describe('JOIN_CODE_WORDS (Wortliste)', () => {
  it('enthält mindestens 200 Wörter (Entropie-Anforderung)', () => {
    expect(JOIN_CODE_WORDS.length).toBeGreaterThanOrEqual(200)
  })

  it('enthält keine Duplikate', () => {
    expect(new Set(JOIN_CODE_WORDS).size).toBe(JOIN_CODE_WORDS.length)
  })

  it('enthält ausschließlich Kleinbuchstaben a-z (keine Umlaute, Ziffern, Sonderzeichen)', () => {
    for (const word of JOIN_CODE_WORDS) {
      expect(word, `"${word}" verletzt das Format`).toMatch(/^[a-z]+$/)
    }
  })

  it('kein Wort ist leer', () => {
    for (const word of JOIN_CODE_WORDS) {
      expect(word.length, `Leeres Wort in der Liste`).toBeGreaterThan(0)
    }
  })
})

// ── normalizeJoinCode ─────────────────────────────────────────────────────────
describe('normalizeJoinCode', () => {
  it('konvertiert zu Kleinbuchstaben', () => {
    expect(normalizeJoinCode('APFEL-BIRNE')).toBe('apfel-birne')
    expect(normalizeJoinCode('Apfel-Birne')).toBe('apfel-birne')
  })

  it('entfernt führende und nachfolgende Leerzeichen', () => {
    expect(normalizeJoinCode('  apfel-birne  ')).toBe('apfel-birne')
  })

  it('ersetzt innere Leerzeichen durch Bindestriche', () => {
    expect(normalizeJoinCode('apfel birne')).toBe('apfel-birne')
  })

  it('kollabiert mehrfache Bindestriche zu einem', () => {
    expect(normalizeJoinCode('apfel---birne')).toBe('apfel-birne')
  })

  it('kombiniert alle Transformationen', () => {
    expect(normalizeJoinCode('  APFEL  --  Birne  ')).toBe('apfel-birne')
  })

  it('gibt leeren String für null / undefined / leere Eingabe zurück', () => {
    expect(normalizeJoinCode(null)).toBe('')
    expect(normalizeJoinCode(undefined)).toBe('')
    expect(normalizeJoinCode('')).toBe('')
  })

  it('verändert einen bereits normierten Code nicht', () => {
    expect(normalizeJoinCode('apfel-birne')).toBe('apfel-birne')
  })
})

// ── isValidJoinCodeFormat ─────────────────────────────────────────────────────
describe('isValidJoinCodeFormat', () => {
  // Gültige Codes: <wort1>-<wort2>, Gesamtlänge 10–20, nur a-z und Bindestrich
  it('akzeptiert einen typischen gültigen Code', () => {
    expect(isValidJoinCodeFormat('apfel-birne')).toBe(true)  // 11 Zeichen
    expect(isValidJoinCodeFormat('lemma-korpus')).toBe(true)
  })

  it('normalisiert die Eingabe vor der Prüfung', () => {
    expect(isValidJoinCodeFormat('APFEL-BIRNE')).toBe(true)
    expect(isValidJoinCodeFormat('  apfel-birne  ')).toBe(true)
  })

  it('lehnt Codes ohne Bindestrich ab', () => {
    expect(isValidJoinCodeFormat('apfelbirne')).toBe(false)
  })

  it('lehnt Codes mit mehr als einem Segment-Trennzeichen ab (a-b-c)', () => {
    // Regex ^[a-z]+-[a-z]+$ erlaubt nur genau einen Bindestrich
    expect(isValidJoinCodeFormat('apfel-birne-kirsche')).toBe(false)
  })

  it('lehnt Codes mit Ziffern oder Sonderzeichen ab', () => {
    expect(isValidJoinCodeFormat('apfel-1birne')).toBe(false)
    expect(isValidJoinCodeFormat('apfel_birne')).toBe(false)
  })

  it('lehnt zu kurze Codes ab (unter 10 Zeichen)', () => {
    // 'ab-cd' = 5 Zeichen
    expect(isValidJoinCodeFormat('ab-cd')).toBe(false)
  })

  it('lehnt zu lange Codes ab (über 20 Zeichen)', () => {
    // 'aaaaaaaaaa-bbbbbbbbbb' = 21 Zeichen
    expect(isValidJoinCodeFormat('aaaaaaaaaa-bbbbbbbbbb')).toBe(false)
  })

  it('akzeptiert Codes, die exakt 10 Zeichen lang sind (Untergrenze)', () => {
    // 'aaaa-aaaaa' = 10 Zeichen
    expect(isValidJoinCodeFormat('aaaa-aaaaa')).toBe(true)
  })

  it('akzeptiert Codes, die exakt 20 Zeichen lang sind (Obergrenze)', () => {
    // 'aaaaaaaaaa-aaaaaaaaa' = 20 Zeichen
    expect(isValidJoinCodeFormat('aaaaaaaaaa-aaaaaaaaa')).toBe(true)
  })

  it('lehnt leere Eingabe ab', () => {
    expect(isValidJoinCodeFormat('')).toBe(false)
    expect(isValidJoinCodeFormat(null)).toBe(false)
  })
})

// ── generateJoinCode ──────────────────────────────────────────────────────────
describe('generateJoinCode', () => {
  it('gibt einen gültigen Code zurück (Format-Validierung)', () => {
    const code = generateJoinCode()
    expect(isValidJoinCodeFormat(code)).toBe(true)
  })

  it('gibt einen normierten Kleinbuchstaben-Code zurück', () => {
    const code = generateJoinCode()
    expect(code).toBe(code.toLowerCase())
  })

  it('Format ist immer <wort>-<wort>', () => {
    const code = generateJoinCode()
    expect(code).toMatch(/^[a-z]+-[a-z]+$/)
  })

  it('beide Teile stammen aus JOIN_CODE_WORDS', () => {
    const wordSet = new Set(JOIN_CODE_WORDS)
    const code = generateJoinCode()
    const [part1, part2] = code.split('-')
    expect(wordSet.has(part1), `"${part1}" ist nicht in JOIN_CODE_WORDS`).toBe(true)
    expect(wordSet.has(part2), `"${part2}" ist nicht in JOIN_CODE_WORDS`).toBe(true)
  })

  it('die beiden Teile eines Codes sind verschieden (kein Wort-Duplikat)', () => {
    // generateJoinCode überspringt Kandidaten, bei denen first === second
    for (let i = 0; i < 20; i++) {
      const code = generateJoinCode()
      const [part1, part2] = code.split('-')
      expect(part1, 'Beide Codeteile sind identisch').not.toBe(part2)
    }
  })

  it('liefert bei deterministischem randomFn den erwarteten Code', () => {
    const wordSet = new Set(JOIN_CODE_WORDS)
    // Deterministisch: immer Index 0 und 1 der sortierten Liste
    let callCount = 0
    const deterministicFn = () => {
      // Abwechselnd 0 und kurz nach 1/words.length, damit beide Picks unterschiedliche Wörter sind
      const idx = callCount % 2
      callCount++
      return idx === 0 ? 0 : 1 / JOIN_CODE_WORDS.length
    }
    const code = generateJoinCode(deterministicFn)
    expect(isValidJoinCodeFormat(code)).toBe(true)
    const [p1, p2] = code.split('-')
    expect(wordSet.has(p1)).toBe(true)
    expect(wordSet.has(p2)).toBe(true)
  })

  it('generiert mehrfach hintereinander gültige Codes (Stabilität)', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidJoinCodeFormat(generateJoinCode())).toBe(true)
    }
  })

  it('aktiviert den Erschöpfungs-Fallback wenn die Zufallsphase scheitert', () => {
    // randomFn gibt immer 0 → pickWord gibt immer dasselbe Wort →
    // first === second, alle 80 Zufallsversuche schlagen fehl.
    // Der Fallback-Loop (nested for) findet trotzdem einen gültigen Code.
    const alwaysZeroFn = () => 0
    const code = generateJoinCode(alwaysZeroFn)
    expect(isValidJoinCodeFormat(code)).toBe(true)
    const [p1, p2] = code.split('-')
    expect(p1).not.toBe(p2)
  })

  it('produziert keine Codes mit Whitespace', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateJoinCode()).not.toMatch(/\s/)
    }
  })
})
