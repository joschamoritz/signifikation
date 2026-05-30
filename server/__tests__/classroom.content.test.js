import { describe, it, expect, vi } from 'vitest'
import { resolveKollokatoren, shuffleArr } from '../classroom/content.js'

const worte = (list) => list.map((k) => k.wort).sort()

describe('resolveKollokatoren (F2a — live aus wortprofil.db)', () => {
  it('nutzt die live generierten Kollokatoren (fetchLemma)', async () => {
    const live = [
      { wort: 'errichten', rang: 1 },
      { wort: 'wegräumen', rang: 2 },
      { wort: 'brennend', rang: 3 },
      { wort: 'Stacheldraht', rang: 4 },
    ]
    const fetchLemma = vi.fn(async () => ({ runden: { kollokatoren: live } }))
    const lemma = { lemma: 'Barrikade', pos: 'Substantiv', runden: { kollokatoren: [] } }

    const out = await resolveKollokatoren(lemma, { fetchLemma })
    expect(fetchLemma).toHaveBeenCalledWith('Barrikade', 'Substantiv')
    expect(worte(out)).toEqual(worte(live)) // gleiche Elemente
    expect(out).toHaveLength(4)
  })

  it('faellt auf das gespeicherte Feld zurueck, wenn fetchLemma leer liefert', async () => {
    const stored = [{ wort: 'stark', rang: 1 }, { wort: 'groß', rang: 2 }]
    const fetchLemma = vi.fn(async () => ({ runden: { kollokatoren: [] } }))
    const lemma = { lemma: 'Wasser', pos: 'Substantiv', runden: { kollokatoren: stored } }

    const out = await resolveKollokatoren(lemma, { fetchLemma })
    expect(worte(out)).toEqual(worte(stored))
  })

  it('faellt auf das gespeicherte Feld zurueck, wenn fetchLemma wirft (DB nicht erreichbar)', async () => {
    const stored = [{ wort: 'klar', rang: 1 }]
    const fetchLemma = vi.fn(async () => { throw new Error('Wortprofil-DB nicht gefunden') })
    const logWarn = vi.fn()
    const lemma = { lemma: 'Wasser', pos: 'Substantiv', runden: { kollokatoren: stored } }

    const out = await resolveKollokatoren(lemma, { fetchLemma, logWarn })
    expect(worte(out)).toEqual(worte(stored))
    expect(logWarn).toHaveBeenCalled()
  })

  it('liefert leeres Array, wenn weder live noch gespeichert Daten haben', async () => {
    const fetchLemma = vi.fn(async () => ({ runden: { kollokatoren: [] } }))
    const lemma = { lemma: 'Nix', pos: 'Substantiv', runden: {} }
    expect(await resolveKollokatoren(lemma, { fetchLemma })).toEqual([])
  })

  it('mischt die Reihenfolge (Top-3 nicht garantiert oben), behaelt aber rang', async () => {
    // 10 Eintraege, rang 1-10. Nach dem Mischen darf rang 1 nicht IMMER an Index 0 stehen.
    const live = Array.from({ length: 10 }, (_, i) => ({ wort: `w${i + 1}`, rang: i + 1 }))
    const fetchLemma = vi.fn(async () => ({ runden: { kollokatoren: live } }))
    const lemma = { lemma: 'X', pos: 'Substantiv', runden: {} }

    let movedAtLeastOnce = false
    for (let t = 0; t < 12; t++) {
      const out = await resolveKollokatoren(lemma, { fetchLemma })
      expect(out).toHaveLength(10)
      // rang bleibt erhalten (Scoring braucht ihn)
      expect(out.find((k) => k.wort === 'w1').rang).toBe(1)
      if (out[0].rang !== 1) movedAtLeastOnce = true
    }
    expect(movedAtLeastOnce).toBe(true)
  })

  it('shuffleArr ist robust gegen Nicht-Arrays', () => {
    expect(shuffleArr(null)).toEqual([])
    expect(shuffleArr(undefined)).toEqual([])
  })
})
