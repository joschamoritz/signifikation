import { afterEach, describe, expect, it, vi } from 'vitest'

// Generatoren mocken – wir testen Dispatch + Schwellen, nicht die Korpus-DB.
vi.mock('../wortprofil.js', () => ({
  POS_ROUNDS: {
    Substantiv: [{ key: 'nomen', relCode: 'KON' }],
    Verb:       [{ key: 'objekte', relCode: 'OBJ' }],
    Adjektiv:   [{ key: 'nomen', relCode: '~ATTR' }],
  },
  fetchRelation: vi.fn(),
  fetchLemma: vi.fn(),
  fetchZeitenwende: vi.fn(),
  fetchZeitenwendeAnalyze: vi.fn(),
  // Default: keine Häufigkeitsdaten → Reihenfolge fällt auf POS_CANDIDATES zurück
  posByFrequency: vi.fn(() => []),
}))
vi.mock('../wortzwilling.js', () => ({ fetchWortZwilling: vi.fn() }))
vi.mock('../lueckenfueller.js', () => ({ buildLueckenfueller: vi.fn() }))
vi.mock('../wiktionary.js', () => ({ fetchWiktionary: vi.fn(async () => ({ ipa: 'ˈaʁ̥çiːf', definitionen: ['Sammlung'] })) }))

import { fetchRelation, fetchLemma, fetchZeitenwende, fetchZeitenwendeAnalyze, posByFrequency } from '../wortprofil.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { buildLueckenfueller } from '../lueckenfueller.js'
import { validateCustomLemma, buildCustomPlay, MIN_KOLLOKATIONEN } from '../customLemma.js'

function kolls(n, prefix = 'w') {
  return Array.from({ length: n }, (_, i) => ({ lemma: `${prefix}${i}`, logDice: String((10 - i * 0.1).toFixed(2)) }))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('validateCustomLemma – Kollokationen', () => {
  it('usable=true bei ≥10 distinkten Kollokationen (mit POS)', async () => {
    fetchRelation.mockResolvedValue(kolls(12))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'Archiv', pos: 'Substantiv' })
    expect(res.usable).toBe(true)
    expect(res.count).toBe(12)
    expect(res.pos).toBe('Substantiv')
    expect(res.reason).toBeNull()
  })

  it('usable=false bei <10 Kollokationen, mit erklärender reason', async () => {
    fetchRelation.mockResolvedValue(kolls(6))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'Selten', pos: 'Substantiv' })
    expect(res.usable).toBe(false)
    expect(res.count).toBe(6)
    expect(res.reason).toContain(String(MIN_KOLLOKATIONEN))
  })

  it('Auto-POS ohne Häufigkeitsdaten: erste spielbare Wortart gewinnt', async () => {
    posByFrequency.mockReturnValueOnce([])
    fetchRelation.mockImplementation((_lemma, pos) => Promise.resolve(pos === 'Verb' ? kolls(15) : kolls(3)))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'laufen' })
    expect(res.pos).toBe('Verb')
    expect(res.usable).toBe(true)
    expect(res.count).toBe(15)
  })

  // „Elend"-Fix: die Kollokator-ANZAHL ist als Kriterium verzerrt (Runden sind
  // auf 30 gedeckelt, Substantiv-Runden füllen das Limit fast immer). Maßgeblich
  // ist die Korpus-Häufigkeit – auch wenn eine andere Wortart mehr Kollokatoren
  // liefert.
  it('Auto-POS folgt der Korpus-Häufigkeit, nicht der Kollokator-Anzahl', async () => {
    posByFrequency.mockReturnValueOnce([
      { pos: 'Adjektiv', freq: 3_118_719 },
      { pos: 'Substantiv', freq: 60_126 },
    ])
    // Substantiv hätte MEHR Kollokatoren – darf trotzdem nicht gewinnen.
    fetchRelation.mockImplementation((_lemma, pos) =>
      Promise.resolve(pos === 'Substantiv' ? kolls(30) : kolls(12)))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'deutsch' })
    expect(res.pos).toBe('Adjektiv')
    expect(res.count).toBe(12)
  })

  it('Auto-POS überspringt die häufigste Wortart, wenn sie nicht spielbar ist', async () => {
    posByFrequency.mockReturnValueOnce([
      { pos: 'Substantiv', freq: 900 },
      { pos: 'Verb', freq: 100 },
    ])
    fetchRelation.mockImplementation((_lemma, pos) => Promise.resolve(pos === 'Verb' ? kolls(15) : kolls(4)))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'Grenzfall' })
    expect(res.pos).toBe('Verb')
    expect(res.usable).toBe(true)
  })

  it('kein Kandidat spielbar → bester Versuch wird als Begründung gemeldet', async () => {
    posByFrequency.mockReturnValueOnce([{ pos: 'Substantiv', freq: 10 }, { pos: 'Verb', freq: 5 }])
    fetchRelation.mockImplementation((_lemma, pos) => Promise.resolve(pos === 'Verb' ? kolls(7) : kolls(2)))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'Nische' })
    expect(res.usable).toBe(false)
    expect(res.count).toBe(7)
    expect(res.pos).toBe('Verb')
  })

  it('dedupliziert nach Lemma (höchstes logDice gewinnt)', async () => {
    fetchRelation.mockResolvedValue([
      { lemma: 'doppelt', logDice: '5.0' },
      { lemma: 'doppelt', logDice: '8.0' },
      ...kolls(3, 'x'),
    ])
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'Test', pos: 'Substantiv' })
    expect(res.count).toBe(4) // 'doppelt' + 3 distinkte
  })
})

describe('validateCustomLemma – Wort-Zwilling', () => {
  it('usable=true wenn fetchWortZwilling ein Paar liefert', async () => {
    fetchWortZwilling.mockResolvedValue({ wortA: 'Bruder', wortB: 'Schwester', kollokatoren: [] })
    const res = await validateCustomLemma({ mode: 'wortzwilling', a: 'Bruder', b: 'Schwester', pos: 'Substantiv' })
    expect(res.usable).toBe(true)
    expect(res.reason).toBeNull()
  })

  it('usable=false wenn fetchWortZwilling null liefert', async () => {
    fetchWortZwilling.mockResolvedValue(null)
    const res = await validateCustomLemma({ mode: 'wortzwilling', a: 'x', b: 'y', pos: 'Substantiv' })
    expect(res.usable).toBe(false)
    expect(res.reason).toMatch(/5 pro Wort/)
  })
})

describe('validateCustomLemma – Zeitenwende', () => {
  it('usable=true wenn Analyze.usable true', async () => {
    fetchZeitenwendeAnalyze.mockResolvedValue({ usable: true, preCandidates: [], postCandidates: [] })
    const res = await validateCustomLemma({ mode: 'zeitenwende', q: 'Internet' })
    expect(res.usable).toBe(true)
  })

  it('usable=false wenn Analyze null/ohne usable', async () => {
    fetchZeitenwendeAnalyze.mockResolvedValue(null)
    const res = await validateCustomLemma({ mode: 'zeitenwende', q: 'xyz' })
    expect(res.usable).toBe(false)
    expect(res.reason).toMatch(/vor und 5 nach 2000/)
  })
})

describe('validateCustomLemma – Lückenfüller', () => {
  it('usable=true wenn buildLueckenfueller Runden liefert', async () => {
    buildLueckenfueller.mockResolvedValue([{}, {}, {}, {}])
    const res = await validateCustomLemma({ mode: 'lueckenfueller', q: 'Wasser', pos: 'Substantiv' })
    expect(res.usable).toBe(true)
    expect(res.rounds).toBe(4)
  })

  it('usable=false wenn buildLueckenfueller null liefert', async () => {
    buildLueckenfueller.mockResolvedValue(null)
    const res = await validateCustomLemma({ mode: 'lueckenfueller', q: 'selten', pos: 'Substantiv' })
    expect(res.usable).toBe(false)
    expect(res.rounds).toBe(0)
  })
})

describe('validateCustomLemma – unbekannter Modus', () => {
  it('wirft bei unbekanntem Modus', async () => {
    await expect(validateCustomLemma({ mode: 'quatsch', q: 'x' })).rejects.toThrow(/Unbekannter Modus/)
  })
})

describe('buildCustomPlay – Kollokationen', () => {
  it('liefert das Lemma-Objekt aus fetchLemma bei spielbarem Wort', async () => {
    fetchRelation.mockResolvedValue(kolls(12))
    fetchLemma.mockResolvedValue({ id: 'archiv', lemma: 'Archiv', pos: 'Substantiv', runden: {} })
    const res = await buildCustomPlay({ mode: 'kollokationen', q: 'Archiv', pos: 'Substantiv' })
    expect(res.usable).toBe(true)
    expect(res.lemma.id).toBe('archiv')
    expect(fetchLemma).toHaveBeenCalledWith('Archiv', 'Substantiv')
  })

  it('liefert usable=false ohne fetchLemma-Aufruf bei zu wenig Kollokationen', async () => {
    fetchRelation.mockResolvedValue(kolls(4))
    const res = await buildCustomPlay({ mode: 'kollokationen', q: 'Selten', pos: 'Substantiv' })
    expect(res.usable).toBe(false)
    expect(res.reason).toContain(String(MIN_KOLLOKATIONEN))
    expect(fetchLemma).not.toHaveBeenCalled()
  })
})

describe('buildCustomPlay – Zeitenwende', () => {
  it('liefert Spieldaten + Wiktionary-Anreicherung, markiert isCustom', async () => {
    fetchZeitenwende.mockResolvedValue({ lemma: 'Archiv', words: [{ wort: 'digital', periode: 'post' }] })
    const res = await buildCustomPlay({ mode: 'zeitenwende', q: 'Archiv' })
    expect(res.usable).toBe(true)
    expect(res.data.lemma).toBe('Archiv')
    expect(res.data.words).toHaveLength(1)
    expect(res.data.ipa).toBe('ˈaʁ̥çiːf')
    expect(res.data.isCustom).toBe(true)
  })

  it('usable=false wenn fetchZeitenwende null liefert', async () => {
    fetchZeitenwende.mockResolvedValue(null)
    const res = await buildCustomPlay({ mode: 'zeitenwende', q: 'xyz' })
    expect(res.usable).toBe(false)
  })
})

describe('buildCustomPlay – Wort-Zwilling', () => {
  it('liefert Paar-Daten ohne Scores, markiert isCustom', async () => {
    fetchWortZwilling.mockResolvedValue({
      wortA: 'Bruder', wortB: 'Schwester', pos: 'Substantiv',
      kollokatoren: [{ wort: 'älterer', zuordnung: 'A', scoreA: 9, scoreB: 1 }],
    })
    const res = await buildCustomPlay({ mode: 'wortzwilling', a: 'Bruder', b: 'Schwester', pos: 'Substantiv' })
    expect(res.usable).toBe(true)
    expect(res.data.wortA).toBe('Bruder')
    expect(res.data.kollokatoren[0]).toEqual({ wort: 'älterer', zuordnung: 'A' })
    expect(res.data.kollokatoren[0].scoreA).toBeUndefined()
    expect(res.data.isCustom).toBe(true)
  })
})

describe('buildCustomPlay – Lückenfüller', () => {
  it('liefert lemma + Runden, markiert isCustom', async () => {
    fetchRelation.mockResolvedValue(kolls(8))
    buildLueckenfueller.mockResolvedValue([{ round: 1 }, { round: 2 }])
    const res = await buildCustomPlay({ mode: 'lueckenfueller', q: 'Wasser', pos: 'Substantiv' })
    expect(res.usable).toBe(true)
    expect(res.data.lemma).toBe('Wasser')
    expect(res.data.lueckenfueller).toHaveLength(2)
    expect(res.data.isCustom).toBe(true)
  })
})
