import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  calculateMixedScore,
  getMedal,
  getDailyMedal,
  getRundInfo,
  shuffle,
  getRoundOptions,
} from './gameLogic'

// ── calculateScore ──────────────────────────────────────────
describe('calculateScore', () => {
  const kollokatoren = [
    { wort: 'stark', rang: 1 },
    { wort: 'groß',  rang: 2 },
    { wort: 'klein', rang: 3 },
    { wort: 'weit',  rang: 4 },
    { wort: 'eng',   rang: 5 },
  ]

  it('gibt 3 für alle Top-3-Treffer', () => {
    expect(calculateScore(['stark', 'groß', 'klein'], kollokatoren)).toBe(3)
  })

  it('gibt 1 für genau einen Top-3-Treffer', () => {
    expect(calculateScore(['weit', 'eng', 'stark'], kollokatoren)).toBe(1)
  })

  it('gibt 0 für leere Auswahl', () => {
    expect(calculateScore([], kollokatoren)).toBe(0)
  })

  it('zählt nur rang ≤ 3', () => {
    expect(calculateScore(['stark', 'weit', 'eng'], kollokatoren)).toBe(1)
  })

  it('ignoriert unbekannte Wörter', () => {
    expect(calculateScore(['unbekannt', 'groß', 'klein'], kollokatoren)).toBe(2)
  })
})

// ── calculateMixedScore ─────────────────────────────────────
describe('calculateMixedScore', () => {
  const koll = [
    { wort: 'stark', rang: 1 },
    { wort: 'groß',  rang: 2 },
    { wort: 'klein', rang: 3 },
    { wort: 'weit',  rang: 4 },
    { wort: 'eng',   rang: 5 },
    { wort: 'kurz',  rang: 6 },
    { wort: 'hoch',  rang: 7 },
    { wort: 'tief',  rang: 8 },
    { wort: 'leise', rang: 9 },
    { wort: 'laut',  rang: 10 },
  ]

  it('gibt 10 für alle Top-3 (Reihenfolge egal) + Bonus', () => {
    // 3 + 3 + 3 + Bonus(1) = 10
    expect(calculateMixedScore(['stark', 'groß', 'klein'], koll)).toBe(10)
  })

  it('Klick-Reihenfolge ändert den Score nicht', () => {
    expect(calculateMixedScore(['klein', 'stark', 'groß'], koll)).toBe(10)
    expect(calculateMixedScore(['groß', 'klein', 'stark'], koll)).toBe(10)
  })

  it('addiert 2 für Rang-4-Treffer (nearPool)', () => {
    // stark(3) + groß(3) + weit(2) = 8, kein Bonus
    expect(calculateMixedScore(['stark', 'groß', 'weit'], koll)).toBe(8)
  })

  it('addiert 2 für Rang-7-Treffer (oberes Ende nearPool)', () => {
    // stark(3) + groß(3) + hoch(2) = 8
    expect(calculateMixedScore(['stark', 'groß', 'hoch'], koll)).toBe(8)
  })

  it('addiert 1 für Rang-8-Treffer (midPool)', () => {
    // stark(3) + groß(3) + tief(1) = 7
    expect(calculateMixedScore(['stark', 'groß', 'tief'], koll)).toBe(7)
  })

  it('addiert 1 für Rang-10-Treffer (unteres Ende midPool)', () => {
    // stark(3) + groß(3) + laut(1) = 7
    expect(calculateMixedScore(['stark', 'groß', 'laut'], koll)).toBe(7)
  })

  it('gibt 0 für unbekannte Wörter', () => {
    // unbekannt(0) + stark(3) + groß(3) = 6
    expect(calculateMixedScore(['unbekannt', 'stark', 'groß'], koll)).toBe(6)
  })

  it('kein Bonus wenn nicht alle 3 in Top-3', () => {
    // stark(3) + groß(3) + weit(2) = 8, kein Bonus
    expect(calculateMixedScore(['stark', 'groß', 'weit'], koll)).toBe(8)
  })

  it('gibt 0 für leere Auswahl', () => {
    expect(calculateMixedScore([], koll)).toBe(0)
  })

  it('mischt nearPool und midPool korrekt', () => {
    // weit(2) + tief(1) + leise(1) = 4
    expect(calculateMixedScore(['weit', 'tief', 'leise'], koll)).toBe(4)
  })
})

// ── getMedal ────────────────────────────────────────────────
describe('getMedal', () => {
  it('Gold bei ≥ 70%', () => {
    expect(getMedal(7, 10).label).toBe('Gold')
    expect(getMedal(10, 10).label).toBe('Gold')
  })
  it('Silber bei ≥ 50%', () => {
    expect(getMedal(5, 10).label).toBe('Silber')
    expect(getMedal(6, 10).label).toBe('Silber')
  })
  it('Bronze bei ≥ 30%', () => {
    expect(getMedal(3, 10).label).toBe('Bronze')
    expect(getMedal(4, 10).label).toBe('Bronze')
  })
  it('Teilgenommen unter 30%', () => {
    expect(getMedal(2, 10).label).toBe('Teilgenommen')
    expect(getMedal(0, 10).label).toBe('Teilgenommen')
  })
  it('hat emoji', () => {
    expect(getMedal(10, 10).emoji).toBe('🥇')
    expect(getMedal(5, 10).emoji).toBe('🥈')
    expect(getMedal(3, 10).emoji).toBe('🥉')
    expect(getMedal(0, 10).emoji).toBe('🌱')
  })
  it('verarbeitet max=0 ohne Division durch null', () => {
    expect(() => getMedal(0, 0)).not.toThrow()
  })
})

// ── getDailyMedal ───────────────────────────────────────────
describe('getDailyMedal', () => {
  it('Gold ab 70% (≥ 21 von 30)', () => {
    expect(getDailyMedal(21).label).toBe('Gold')
    expect(getDailyMedal(30).label).toBe('Gold')
  })
  it('Silber 50–69% (15–20 von 30)', () => {
    expect(getDailyMedal(15).label).toBe('Silber')
    expect(getDailyMedal(20).label).toBe('Silber')
  })
  it('Bronze 30–49% (9–14 von 30)', () => {
    expect(getDailyMedal(9).label).toBe('Bronze')
    expect(getDailyMedal(14).label).toBe('Bronze')
  })
  it('Teilgenommen unter 30% (< 9 von 30)', () => {
    expect(getDailyMedal(8).label).toBe('Teilgenommen')
    expect(getDailyMedal(0).label).toBe('Teilgenommen')
  })
  it('hat emoji', () => {
    expect(getDailyMedal(30).emoji).toBe('🥇')
    expect(getDailyMedal(15).emoji).toBe('🥈')
    expect(getDailyMedal(9).emoji).toBe('🥉')
    expect(getDailyMedal(0).emoji).toBe('🌱')
  })
})

// ── getRundInfo ─────────────────────────────────────────────
describe('getRundInfo', () => {
  it('gibt rundenInfo des Lemmas zurück falls vorhanden', () => {
    const lemma = { rundenInfo: [{ key: 'x', label: 'X', relCode: 'Y', desc: 'Z' }] }
    expect(getRundInfo(lemma)).toEqual(lemma.rundenInfo)
  })
  it('gibt Fallback zurück falls kein rundenInfo', () => {
    const result = getRundInfo({ lemma: 'test' })
    expect(result).toHaveLength(3)
    expect(result[0].key).toBe('nomen')
  })
  it('gibt Fallback zurück für null', () => {
    expect(getRundInfo(null)).toHaveLength(3)
  })
})

// ── shuffle ─────────────────────────────────────────────────
describe('shuffle', () => {
  it('verändert nicht die Länge', () => {
    expect(shuffle([1, 2, 3, 4, 5])).toHaveLength(5)
  })
  it('enthält alle ursprünglichen Elemente', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr).sort()).toEqual([...arr].sort())
  })
  it('mutiert das Original nicht', () => {
    const arr = [1, 2, 3]
    shuffle(arr)
    expect(arr).toEqual([1, 2, 3])
  })
  it('funktioniert mit leerem Array', () => {
    expect(shuffle([])).toEqual([])
  })
})

// ── getRoundOptions ─────────────────────────────────────────
describe('getRoundOptions', () => {
  it('gibt ein Array mit gleicher Länge zurück', () => {
    const koll = [{ wort: 'a', rang: 1 }, { wort: 'b', rang: 2 }]
    expect(getRoundOptions(koll)).toHaveLength(2)
  })
  it('enthält alle ursprünglichen Einträge', () => {
    const koll = [{ wort: 'a' }, { wort: 'b' }, { wort: 'c' }]
    const result = getRoundOptions(koll)
    expect(result.map(k => k.wort).sort()).toEqual(['a', 'b', 'c'])
  })
})
