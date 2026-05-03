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
    { wort: 'lang',  rang: 6 },
  ]

  it('gibt 10 für alle Top-3 + richtiger Rang', () => {
    // stark(1)→Pos1=3, groß(2)→Pos2=3, klein(3)→Pos3=3, Bonus+1 = 10
    expect(calculateMixedScore(['stark', 'groß', 'klein'], koll)).toBe(10)
  })

  it('gibt 7 für alle Top-3, falscher Rang (2+2+2+Bonus)', () => {
    // stark als Pos2 → 2, groß als Pos1 → 2, klein als Pos3=3 aber... klein Pos3=3 → richtige Pos → 3
    // ['groß','stark','klein']: groß(rang2,pick1)→2, stark(rang1,pick2)→2, klein(rang3,pick3)→3, Bonus+1 = 8
    expect(calculateMixedScore(['groß', 'stark', 'klein'], koll)).toBe(8)
  })

  it('gibt 6 für Top-3 alle falsche Positionen', () => {
    // ['klein','stark','groß']: klein(rang3,pick1)→2, stark(rang1,pick2)→2, groß(rang2,pick3)→2, Bonus+1=7
    expect(calculateMixedScore(['klein', 'stark', 'groß'], koll)).toBe(7)
  })

  it('addiert 1 für Rang-4-Treffer', () => {
    // stark(Pos1)=3, groß(Pos2)=3, weit(Rang4)=1, kein Bonus = 7
    expect(calculateMixedScore(['stark', 'groß', 'weit'], koll)).toBe(7)
  })

  it('addiert 1 für Rang-5-Treffer', () => {
    // stark(Pos1)=3, groß(Pos2)=3, eng(Rang5)=1, kein Bonus = 7
    expect(calculateMixedScore(['stark', 'groß', 'eng'], koll)).toBe(7)
  })

  it('gibt 0 für Rang-6-Treffer', () => {
    expect(calculateMixedScore(['lang', 'stark', 'groß'], koll)).toBe(
      // lang(Rang6)=0, stark(Pos2,Rang1)→2, groß(Pos3,Rang2)→2 = 4
      4
    )
  })

  it('gibt 0 für unbekannte Wörter', () => {
    expect(calculateMixedScore(['unbekannt', 'stark', 'groß'], koll)).toBe(
      // unbekannt=0, stark(Pos2,Rang1)→2, groß(Pos3,Rang2)→2 = 4
      4
    )
  })

  it('kein Bonus wenn nicht alle 3 in Top-3', () => {
    const score = calculateMixedScore(['stark', 'groß', 'weit'], koll)
    // stark(1,Pos1)=3, groß(2,Pos2)=3, weit(4)=1 → 7, kein Bonus
    expect(score).toBe(7)
  })

  it('gibt 0 für leere Auswahl', () => {
    expect(calculateMixedScore([], koll)).toBe(0)
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
