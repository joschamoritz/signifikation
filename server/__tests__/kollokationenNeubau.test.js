import { describe, it, expect } from 'vitest'
import { planeNeubau, top3, mitNeuenKollokatoren } from '../kollokationenNeubau.js'

const lemma = (id, lemmaName = id) => ({ id, lemma: lemmaName, pos: 'Substantiv', runden: { kollokatoren: [], nomen: [1] }, notiz: 'n' })
const byId = new Map(['haus', 'baum', 'wort', 'kaffee', 'tee'].map((id) => [id, lemma(id, id[0].toUpperCase() + id.slice(1))]))

describe('planeNeubau', () => {
  // Echte Form: { ids, thema, … }; ein Tag als Altdaten-Array
  const kalender = {
    '2026-11-19': { ids: ['haus', 'baum', 'wort'], thema: '' },
    '2026-11-21': { ids: ['kaffee', 'haus', 'tee'], thema: '', lueckenfueller_id: 'baum' },
    '2026-11-22': ['baum'],
    '2026-12-05': { ids: ['wort'] },
  }

  it('baut nur Lemmata ab dem Stichtag, die vorher nicht vorkamen', () => {
    const { neu, uebersprungen } = planeNeubau({ kalender, byId, ab: '2026-11-21' })
    expect(neu.map((n) => n.id)).toEqual(['kaffee', 'tee'])
    expect(uebersprungen.map((u) => u.id).sort()).toEqual(['baum', 'haus', 'wort'])
    expect(uebersprungen.find((u) => u.id === 'haus').grund).toContain('2026-11-19')
  })

  it('nimmt mit auchVergangene auch geteilte Lemmata', () => {
    const { neu } = planeNeubau({ kalender, byId, ab: '2026-11-21', auchVergangene: true })
    expect(neu.map((n) => n.id).sort()).toEqual(['baum', 'haus', 'kaffee', 'tee', 'wort'])
  })

  it('beachtet das Ende des Zeitraums', () => {
    const { neu } = planeNeubau({ kalender, byId, ab: '2026-11-21', bis: '2026-11-30', auchVergangene: true })
    expect(neu.map((n) => n.id)).not.toContain('wort')
    expect(neu.find((n) => n.id === 'baum').daten).toEqual(['2026-11-22'])
  })

  it('zählt Spezialwochen als Vorkommen (vergangene sperren, künftige bauen)', () => {
    const { neu, uebersprungen } = planeNeubau({
      kalender: { '2026-11-25': ['kaffee'] },
      spezialwochen: [
        { von: '2026-11-10', bis: '2026-11-16', lemma_id: 'kaffee' },
        { von: '2026-12-01', bis: '2026-12-07', lemma_id: 'tee' },
      ],
      byId,
      ab: '2026-11-21',
    })
    expect(neu.map((n) => n.id)).toEqual(['tee'])
    expect(uebersprungen.map((u) => u.id)).toEqual(['kaffee'])
  })

  it('meldet Kennungen ohne Lemma', () => {
    const { uebersprungen } = planeNeubau({ kalender: { '2026-11-25': ['gibtsnicht'] }, byId, ab: '2026-11-21' })
    expect(uebersprungen).toEqual([{ id: 'gibtsnicht', lemma: null, grund: 'Lemma fehlt in der Datenbank', daten: ['2026-11-25'] }])
  })
})

describe('mitNeuenKollokatoren', () => {
  it('ersetzt nur runden.kollokatoren', () => {
    const neu = [{ wort: 'trinken', rang: 1 }]
    const out = mitNeuenKollokatoren(byId.get('kaffee'), neu)
    expect(out.runden).toEqual({ kollokatoren: neu, nomen: [1] })
    expect(out.notiz).toBe('n')
    expect(byId.get('kaffee').runden.kollokatoren).toEqual([]) // Original unverändert
  })
})

describe('top3', () => {
  it('liefert die Wörter mit Rang 1–3 in Rangfolge', () => {
    expect(top3([{ wort: 'c', rang: 3 }, { wort: 'x', rang: 7 }, { wort: 'a', rang: 1 }, { wort: 'b', rang: 2 }])).toEqual(['a', 'b', 'c'])
    expect(top3(null)).toEqual([])
  })
})
