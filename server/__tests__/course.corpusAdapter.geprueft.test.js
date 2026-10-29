/**
 * Kurs-Adapter mit Belegprüfung: geprüfte Sätze vor der normalen Suche, sonst wie bisher.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../wortprofil.js', () => ({ queryRelation: vi.fn(() => []) }))
vi.mock('../belege.js', () => ({
  fetchBelegeRaw: vi.fn(() => [{ satz: 'Er traf eine Entscheidung, als der Zug schon fuhr.', quelle: 'Suche' }]),
  fetchSaetze: vi.fn(ids => ids.map(id => ({ id, satz: `Sie trafen die Entscheidung Nummer ${id} gemeinsam.`, quelle: 'Geprüft', jahr: 2010 }))),
  scoreBeleg: vi.fn(() => 0),
}))
vi.mock('../belegPruefung/details.js', () => ({ gepruefteSatzIds: vi.fn(() => null) }))

const { makeCorpusAdapter } = await import('../course/corpusAdapter.js')
const { fetchBelegeRaw, fetchSaetze } = await import('../belege.js')
const { gepruefteSatzIds } = await import('../belegPruefung/details.js')

describe('corpusAdapter mit geprüften Belegen', () => {
  const corpus = makeCorpusAdapter()
  beforeEach(() => {
    vi.clearAllMocks()
    gepruefteSatzIds.mockReturnValue(null)
  })

  it('nimmt die geprüften Sätze und fragt die Suche dann nicht', () => {
    gepruefteSatzIds.mockReturnValue([7, 9])
    expect(corpus.fetchBelege('Entscheidung', 'treffen', { limit: 2 })).toEqual([
      { satz: 'Sie trafen die Entscheidung Nummer 7 gemeinsam.', quelle: 'Geprüft' },
      { satz: 'Sie trafen die Entscheidung Nummer 9 gemeinsam.', quelle: 'Geprüft' },
    ])
    expect(corpus.fetchBeleg('Entscheidung', 'treffen').quelle).toBe('Geprüft')
    expect(fetchBelegeRaw).not.toHaveBeenCalled()
  })

  it('ungeprüfte Paare laufen über die normale Suche', () => {
    expect(corpus.fetchBeleg('Entscheidung', 'treffen').quelle).toBe('Suche')
    expect(fetchSaetze).not.toHaveBeenCalled()
  })

  it('fehlen die geprüften Sätze in der Belege-DB, bleibt die Suche', () => {
    gepruefteSatzIds.mockReturnValue([7])
    fetchSaetze.mockReturnValueOnce([])
    expect(corpus.fetchBelege('Entscheidung', 'treffen')).toHaveLength(1)
    expect(fetchBelegeRaw).toHaveBeenCalledOnce()
  })
})
