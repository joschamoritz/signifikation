import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  getMedal,
  getDailyMedal,
  getZRMedal,
  getRundInfo,
  shuffle,
  getRandomItems,
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

  it('gibt 0 für keine Top-3-Treffer', () => {
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

// ── getMedal ────────────────────────────────────────────────
describe('getMedal', () => {
  it('Gold bei ≥ 80%', () => {
    expect(getMedal(8, 10).label).toBe('Gold')
    expect(getMedal(10, 10).label).toBe('Gold')
  })
  it('Silber bei ≥ 60%', () => {
    expect(getMedal(6, 10).label).toBe('Silber')
    expect(getMedal(7, 10).label).toBe('Silber')
  })
  it('Bronze bei ≥ 40%', () => {
    expect(getMedal(4, 10).label).toBe('Bronze')
    expect(getMedal(5, 10).label).toBe('Bronze')
  })
  it('Teilgenommen unter 40%', () => {
    expect(getMedal(3, 10).label).toBe('Teilgenommen')
    expect(getMedal(0, 10).label).toBe('Teilgenommen')
  })
  it('hat emoji', () => {
    expect(getMedal(10, 10).emoji).toBe('🥇')
    expect(getMedal(6, 10).emoji).toBe('🥈')
    expect(getMedal(4, 10).emoji).toBe('🥉')
    expect(getMedal(0, 10).emoji).toBe('🌱')
  })
  it('verarbeitet max=0 ohne Division durch null', () => {
    expect(() => getMedal(0, 0)).not.toThrow()
  })
})

// ── getDailyMedal ───────────────────────────────────────────
describe('getDailyMedal', () => {
  it('Gold ab 80% (≥ 24 von 30)', () => {
    expect(getDailyMedal(24).label).toBe('Gold')
    expect(getDailyMedal(30).label).toBe('Gold')
  })
  it('Silber 60–79% (18–23 von 30)', () => {
    expect(getDailyMedal(18).label).toBe('Silber')
    expect(getDailyMedal(23).label).toBe('Silber')
  })
  it('Bronze 40–59% (12–17 von 30)', () => {
    expect(getDailyMedal(12).label).toBe('Bronze')
    expect(getDailyMedal(17).label).toBe('Bronze')
  })
  it('Teilgenommen unter 40% (< 12 von 30)', () => {
    expect(getDailyMedal(11).label).toBe('Teilgenommen')
    expect(getDailyMedal(0).label).toBe('Teilgenommen')
  })
  it('hat emoji', () => {
    expect(getDailyMedal(30).emoji).toBe('🥇')
    expect(getDailyMedal(18).emoji).toBe('🥈')
    expect(getDailyMedal(12).emoji).toBe('🥉')
    expect(getDailyMedal(0).emoji).toBe('🌱')
  })
})

// ── getZRMedal ──────────────────────────────────────────────
describe('getZRMedal', () => {
  it('Gold bei ≥ 80%', () => {
    expect(getZRMedal(8, 10).label).toBe('Gold')
    expect(getZRMedal(10, 10).label).toBe('Gold')
  })
  it('Silber bei ≥ 60%', () => {
    expect(getZRMedal(6, 10).label).toBe('Silber')
    expect(getZRMedal(7, 10).label).toBe('Silber')
  })
  it('Bronze bei ≥ 40%', () => {
    expect(getZRMedal(4, 10).label).toBe('Bronze')
    expect(getZRMedal(5, 10).label).toBe('Bronze')
  })
  it('Teilgenommen unter 40%', () => {
    expect(getZRMedal(3, 10).label).toBe('Teilgenommen')
    expect(getZRMedal(0, 10).label).toBe('Teilgenommen')
  })
  it('verarbeitet max=0 ohne Division durch null', () => {
    expect(() => getZRMedal(0, 0)).not.toThrow()
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

// ── getRandomItems ──────────────────────────────────────────
describe('getRandomItems', () => {
  it('gibt die angeforderte Anzahl zurück', () => {
    expect(getRandomItems([1, 2, 3, 4, 5], 3)).toHaveLength(3)
  })
  it('gibt maximal die Array-Länge zurück', () => {
    expect(getRandomItems([1, 2], 5)).toHaveLength(2)
  })
  it('gibt leeres Array zurück bei count=0', () => {
    expect(getRandomItems([1, 2, 3], 0)).toHaveLength(0)
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
