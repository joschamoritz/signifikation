/**
 * server/__tests__/zeitenwendePrefetch.test.js
 *
 * Tests für das Vorwärmen des Wiktionary-Caches (Audit 2026-06-15, #6).
 * fetchWiktionary wird gemockt (kein Netz); die Zeitenwende-Zeile wird in die
 * Test-DB geschrieben. Geprüft wird, dass der Prefetch den exakten Cache-Key
 * `wikt:<lemma>` füllt, den der Endpunkt liest, und keinen unnötigen Fetch macht.
 */
import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('../wiktionary.js', () => ({
  fetchWiktionary: vi.fn(async () => ({ ipa: 'ˈtɛst', definitionen: ['Probe'] })),
}))

import { fetchWiktionary } from '../wiktionary.js'
import db from '../db.js'
import { cacheGet, cacheSet } from '../store.js'
import { prefetchZeitenwendeWiktionary } from '../jobs/zeitenwendePrefetch.js'

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'
function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now)
}

const usedDates = []
function insertZeitenwende(datum, lemma) {
  db.prepare('INSERT OR REPLACE INTO zeitenwende (datum, data) VALUES (?, ?)')
    .run(datum, JSON.stringify({ lemma, words: [] }))
  usedDates.push(datum)
}

afterEach(() => {
  for (const d of usedDates) db.prepare('DELETE FROM zeitenwende WHERE datum = ?').run(d)
  usedDates.length = 0
  vi.clearAllMocks()
})

describe('prefetchZeitenwendeWiktionary', () => {
  it('füllt den wikt:-Cache für das heutige Lemma', async () => {
    const now = new Date()
    const lemma = `Prefetchwort-${Date.now()}`
    insertZeitenwende(berlinDate(now), lemma)

    const warmed = await prefetchZeitenwendeWiktionary(now)

    expect(warmed).toBe(true)
    expect(fetchWiktionary).toHaveBeenCalledWith(lemma)
    expect(cacheGet(`wikt:${lemma}`)).toEqual({ ipa: 'ˈtɛst', definitionen: ['Probe'] })
  })

  it('überspringt den Fetch, wenn der Cache schon warm ist', async () => {
    const now = new Date()
    const lemma = `Schonwarm-${Date.now()}`
    insertZeitenwende(berlinDate(now), lemma)
    cacheSet(`wikt:${lemma}`, { ipa: 'x', definitionen: [] })

    const warmed = await prefetchZeitenwendeWiktionary(now)

    expect(warmed).toBe(false)
    expect(fetchWiktionary).not.toHaveBeenCalled()
  })

  it('macht nichts, wenn für den Tag kein Zeitenwende-Eintrag existiert', async () => {
    // Datum bewusst weit in der Zukunft → garantiert keine Zeile.
    const now = new Date('2099-12-31T12:00:00Z')

    const warmed = await prefetchZeitenwendeWiktionary(now)

    expect(warmed).toBe(false)
    expect(fetchWiktionary).not.toHaveBeenCalled()
  })
})
