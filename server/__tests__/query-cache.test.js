// Memory-Schutz des Query-Caches (Review 2026-06-11, D-H2):
// Keys entstehen aus User-Input (Eigenes Lemma) — der Cache braucht ein
// hartes Groessenlimit mit LRU-Eviction.
import { beforeEach, describe, expect, it } from 'vitest'
import { getCachedQuery, clearCache, getCacheMetrics } from '../query-cache.js'

const MAX_ENTRIES = 5000 // muss zu query-cache.js passen

describe('query-cache: Groessenlimit + LRU', () => {
  beforeEach(() => {
    clearCache()
  })

  it('deckelt die Eintragszahl auf MAX_ENTRIES', () => {
    for (let i = 0; i < MAX_ENTRIES + 50; i++) {
      getCachedQuery(`limit-test:${i}`, () => i)
    }
    expect(getCacheMetrics().size).toBe(MAX_ENTRIES)
  })

  it('evictet den am laengsten unbenutzten Eintrag (LRU, nicht FIFO)', () => {
    for (let i = 0; i < MAX_ENTRIES; i++) {
      getCachedQuery(`lru-test:${i}`, () => i)
    }
    // Aeltesten Eintrag anfassen → er ist jetzt "frisch benutzt"
    let fetcherCalled = false
    getCachedQuery('lru-test:0', () => { fetcherCalled = true; return -1 })
    expect(fetcherCalled).toBe(false) // Cache-Hit

    // Neuer Eintrag verdraengt lru-test:1 (aeltester unbenutzter), NICHT lru-test:0
    getCachedQuery('lru-test:new', () => 'new')

    let refetched0 = false
    getCachedQuery('lru-test:0', () => { refetched0 = true; return -1 })
    expect(refetched0).toBe(false) // ueberlebt dank LRU-Refresh

    let refetched1 = false
    getCachedQuery('lru-test:1', () => { refetched1 = true; return -1 })
    expect(refetched1).toBe(true) // wurde evictet
  })
})
