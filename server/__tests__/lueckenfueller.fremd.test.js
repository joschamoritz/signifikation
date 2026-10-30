/**
 * Lückenfüller: Distraktoren aus fremden Pools (Stufe 3, Messung vom 30.10.2026). Kollokatoren
 * der KON-Nachbarn, die mit dem Grundwort nie vorkommen, gehen vor; Nomen-Grundwörter bekommen
 * zuerst Adjektiv-Lücken.
 */
import { describe, expect, it, vi } from 'vitest'

const adj = (lemma, i) => ({ lemma, pos: 'Adjektiv', logDice: String(11 - i * 0.5) })
// Eigener Pool von „Zahl“: ein starkes Nomen (KON) vor den Adjektiven (ATTR)
const ATTR = ['groß', 'gering', 'rot', 'genau', 'wachsend', 'steigend', 'reell', 'absolut'].map(adj)
const KON = [{ lemma: 'Größe', pos: 'Substantiv', logDice: '12.0' }]

// Wortprofil für queryRelation: Nachbarn von „Zahl“ und deren Adjektive
const ZEILEN = {
  'Zahl|KON': [{ lemma: 'Buchstabe', pos: 'Substantiv', logDice: '9' }, { lemma: 'Größe', pos: 'Substantiv', logDice: '8' }],
  // mit „Zahl“ belegt, auch schwach: darf nie fremder Distraktor werden
  'Zahl|ATTR': [...ATTR, adj('historisch', 20)],
  'Buchstabe|ATTR': [adj('kyrillisch', 0), adj('fett', 3), adj('historisch', 1)],
  'Größe|ATTR': [adj('physikalisch', 0), adj('fett', 4), adj('veränderlich', 2)],
}

vi.mock('../wortprofil.js', () => ({
  fetchRelation: vi.fn(async (_l, _p, rel) => (rel === 'ATTR' ? ATTR : rel === 'KON' ? KON : [])),
  lemmaZeilen: vi.fn(() => 0),
  queryRelation: vi.fn((lemma, _p, rel) => ZEILEN[`${lemma}|${rel}`] ?? []),
}))
vi.mock('../belege.js', () => ({
  fetchSaetze: vi.fn(() => []),
  fetchBelegeRaw: vi.fn((_l, koll) => [{
    satz: /^\p{Lu}/u.test(koll)
      ? `Zahl und ${koll} sind die beiden Grundbegriffe, die in diesem Kapitel genauer erklärt werden.`
      : `Aufgrund der ${koll}en Zahl an Opfern mussten diese auf mehrere Krankenhäuser verteilt werden.`,
    quelle: 'Test',
  }]),
  // jede Wortform gilt als belegt
  zaehlePhrase: vi.fn(woerter => (woerter.length === 1 ? 10 : 0)),
}))
vi.mock('../belegPruefung/details.js', () => ({ gepruefteDetails: vi.fn(() => null) }))

const { buildLueckenfueller, fremderPool } = await import('../lueckenfueller.js')

describe('fremderPool', () => {
  it('nimmt Kollokatoren der Nachbarn, die mit dem Grundwort nie vorkommen – mehrfach belegte zuerst', () => {
    const lemmata = fremderPool('Zahl', 'Substantiv', ['ATTR', 'KON']).map(k => k.lemma)
    expect(lemmata[0]).toBe('fett')
    expect(lemmata).toEqual(expect.arrayContaining(['kyrillisch', 'physikalisch', 'veränderlich']))
    expect(lemmata).not.toContain('historisch')
    expect(lemmata).not.toContain('groß')
  })
})

describe('Runden mit fremdem Pool', () => {
  it('Adjektiv-Lücken vor Aufzählungen, auch wenn ein Nomen stärker ist', async () => {
    const runden = await buildLueckenfueller('Zahl', 'Substantiv')
    expect(runden[0].kollokator).toBe('großen')
  })

  it('die erste Runde bekommt fremde Distraktoren, danach füllt der eigene Pool auf', async () => {
    const runden = await buildLueckenfueller('Zahl', 'Substantiv')
    const falsche = (r) => r.optionen.filter(o => o !== r.kollokator)
    expect(falsche(runden[0]).sort()).toEqual(['fetten', 'kyrillischen', 'physikalischen'])
    const alle = runden.filter(r => r.optionen).flatMap(falsche)
    expect(alle.some(o => o.startsWith('historisch'))).toBe(false)
    expect(runden.filter(r => r.type === 'choice').every(r => r.optionen.length === 4)).toBe(true)
  })
})
