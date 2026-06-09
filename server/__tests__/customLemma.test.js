import { afterEach, describe, expect, it, vi } from 'vitest'

// Generatoren mocken – wir testen Dispatch + Schwellen, nicht die Korpus-DB.
vi.mock('../wortprofil.js', () => ({
  POS_ROUNDS: {
    Substantiv: [{ key: 'nomen', relCode: 'KON' }],
    Verb:       [{ key: 'objekte', relCode: 'OBJ' }],
    Adjektiv:   [{ key: 'nomen', relCode: '~ATTR' }],
  },
  fetchRelation: vi.fn(),
  fetchZeitenwendeAnalyze: vi.fn(),
}))
vi.mock('../wortzwilling.js', () => ({ fetchWortZwilling: vi.fn() }))
vi.mock('../lueckenfueller.js', () => ({ buildLueckenfueller: vi.fn() }))

import { fetchRelation, fetchZeitenwendeAnalyze } from '../wortprofil.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { buildLueckenfueller } from '../lueckenfueller.js'
import { validateCustomLemma, MIN_KOLLOKATIONEN } from '../customLemma.js'

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

  it('Auto-POS: wählt die Wortart mit den meisten Kollokationen', async () => {
    fetchRelation.mockImplementation((_lemma, pos) => Promise.resolve(pos === 'Verb' ? kolls(15) : kolls(3)))
    const res = await validateCustomLemma({ mode: 'kollokationen', q: 'laufen' })
    expect(res.pos).toBe('Verb')
    expect(res.usable).toBe(true)
    expect(res.count).toBe(15)
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
