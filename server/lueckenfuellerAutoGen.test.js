import { describe, expect, it, vi } from 'vitest'
import { ergaenzeLueckenfueller, LUECKENFUELLER_STATUS } from './lueckenfuellerAutoGen.js'
import { toId } from './wortprofil.js'

const RUNDEN = [{ type: 'single', kollokator: 'alt' }, { type: 'single', kollokator: 'neu' }]

function deps(overrides = {}) {
  return {
    lemmaEntries: [],
    weitereWoerter: [],
    getLemmataIndex: () => ({ byId: new Map() }),
    buildLueckenfueller: vi.fn(async () => RUNDEN),
    resolveCandidate: vi.fn(async () => ({ pos: 'Substantiv', result: RUNDEN })),
    fetchLemma: vi.fn(async (lemma, pos) => ({ id: toId(lemma), lemma, pos, runden: {} })),
    toId,
    ...overrides,
  }
}

describe('ergaenzeLueckenfueller', () => {
  it('tut nichts, wenn für den Tag kein Lückenfüller gesetzt ist', async () => {
    const d = deps()
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: '' })
    expect(result).toEqual({ status: null })
    expect(d.buildLueckenfueller).not.toHaveBeenCalled()
  })

  it('erzeugt Runden für ein neues Kollokationen-Wort des Tages', async () => {
    const d = deps({ lemmaEntries: [{ id: 'hoersaal', lemma: 'Hörsaal', pos: 'Substantiv' }] })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'hoersaal' })

    expect(result.status).toBe(LUECKENFUELLER_STATUS.ERZEUGT)
    expect(result.runden).toBe(2)
    expect(result.lemma).toMatchObject({ id: 'hoersaal', lueckenfueller: RUNDEN })
    expect(d.buildLueckenfueller).toHaveBeenCalledWith('Hörsaal', 'Substantiv')
  })

  it('baut vorhandene Runden nie neu — sie könnten schon an anderen Tagen gespielt worden sein', async () => {
    const vorhanden = [{ type: 'single', kollokator: 'bestehend' }]
    const d = deps({ lemmaEntries: [{ id: 'kind', lemma: 'Kind', pos: 'Substantiv', lueckenfueller: vorhanden }] })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'kind' })

    expect(result).toEqual({ status: LUECKENFUELLER_STATUS.VORHANDEN, id: 'kind' })
    expect(d.buildLueckenfueller).not.toHaveBeenCalled()
  })

  it('meldet zu wenig Material, ohne ein Lemma zurückzugeben', async () => {
    const d = deps({
      lemmaEntries: [{ id: 'still', lemma: 'still', pos: 'Adjektiv' }],
      buildLueckenfueller: vi.fn(async () => null),
    })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'still' })

    expect(result).toEqual({ status: LUECKENFUELLER_STATUS.ZU_WENIG_MATERIAL, id: 'still' })
  })

  it('legt für ein Zeitenwende-Wort ohne Lemma eines mit Runden an', async () => {
    const d = deps({ weitereWoerter: ['Rakete', 'Flugzeug', 'Erde'] })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'erde' })

    expect(result.status).toBe(LUECKENFUELLER_STATUS.ERZEUGT)
    expect(result.lemma).toMatchObject({ id: 'erde', lemma: 'Erde', lueckenfueller: RUNDEN })
    expect(d.resolveCandidate).toHaveBeenCalledWith('Erde', undefined)
    expect(d.fetchLemma).toHaveBeenCalledWith('Erde', 'Substantiv')
  })

  it('findet Zwilling-Wörter auch mit Umlaut über die ID', async () => {
    const d = deps({ weitereWoerter: ['Märchen', 'Roman', ''] })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'maerchen' })

    expect(result.lemma).toMatchObject({ id: 'maerchen', lemma: 'Märchen' })
  })

  it('ergänzt ein bestehendes Lemma ohne Runden, statt es neu anzulegen', async () => {
    const bestehend = { id: 'wal', lemma: 'Wal', pos: 'Substantiv', notiz: 'bleibt erhalten' }
    const d = deps({ getLemmataIndex: () => ({ byId: new Map([['wal', bestehend]]) }) })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'wal' })

    expect(result.lemma).toMatchObject({ ...bestehend, lueckenfueller: RUNDEN })
    expect(d.resolveCandidate).toHaveBeenCalledWith('Wal', 'Substantiv')
    expect(d.fetchLemma).not.toHaveBeenCalled()
  })

  it('meldet eine ID, die zu keinem Wort des Tages passt, als unbekannt', async () => {
    const d = deps({ weitereWoerter: ['Bier', 'Wein', 'Fest'] })
    const result = await ergaenzeLueckenfueller({ ...d, lueckenfuellerId: 'tippfehler' })

    expect(result).toEqual({ status: LUECKENFUELLER_STATUS.UNBEKANNT, id: 'tippfehler' })
    expect(d.resolveCandidate).not.toHaveBeenCalled()
  })
})
