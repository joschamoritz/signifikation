import { describe, expect, it, vi } from 'vitest'
import { createKollokationAnalyse } from './kollokationAnalyse.js'

const analyse = (pool, n = 3) => ({
  pool,
  kollokatoren: Array.from({ length: n }, (_, i) => ({ wort: `k${i + 1}`, logDice: 10 - i, platz: i + 1 })),
})

describe('createKollokationAnalyse (Spielweg)', () => {
  it('nimmt die Wortart des Lemmas und die Eignung des Spiels (Pool ab MIN_KOLLOKATOREN)', async () => {
    const fetchKollokatorenAnalyse = vi.fn(async (_l, pos) => (pos === 'Verb' ? analyse(9) : analyse(10)))
    const { analyzeKollokationen } = createKollokationAnalyse({ fetchKollokatorenAnalyse, MIN_KOLLOKATOREN: 10 })
    const sub = await analyzeKollokationen('Lauf', 'Substantiv')
    expect(sub).toMatchObject({ pos: 'Substantiv', pool: 10, usable: true })
    expect(sub.kollokatoren[0]).toEqual({ wort: 'k1', logDice: 10 })
    expect((await analyzeKollokationen('laufen', 'Verb')).usable).toBe(false)
    expect(fetchKollokatorenAnalyse).toHaveBeenCalledTimes(2)
  })

  it('ohne Wortart: die mit dem größten Pool', async () => {
    const fetchKollokatorenAnalyse = vi.fn(async (_l, pos) => analyse({ Substantiv: 4, Verb: 30, Adjektiv: 12 }[pos]))
    const { analyzeKollokationen } = createKollokationAnalyse({ fetchKollokatorenAnalyse, MIN_KOLLOKATOREN: 10 })
    expect(await analyzeKollokationen('fahren', '')).toMatchObject({ pos: 'Verb', pool: 30, usable: true })
  })
})
