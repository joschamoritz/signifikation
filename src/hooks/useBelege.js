// Belege aus eigener belege.db (CC BY-SA, kein DWDS). Aktiviert wenn BELEGE_DB gesetzt.

import { useRef, useState } from 'react'
import { API } from '../config'

/**
 * Wiederverwendbarer Hook für Korpusbelege.
 * Verwaltet openBeleg, belegeCache und belegeLoading zentral.
 *
 * @param {string} lemmaWort – Das Hauptlemma (z.B. "Impfung")
 * @param {string} [relCode] – Standard-Relationstyp; kann pro loadBelege-Aufruf überschrieben werden
 */
export function useBelege(lemmaWort, relCode = '') {
  const [openBeleg,     setOpenBeleg]     = useState(null)
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)

  // Refs spiegeln den jeweils aktuellen Stand: loadBelege entschied früher
  // über den Render-Snapshot von openBeleg/belegeCache — bei schnellem
  // Doppelklick (oder Re-Render zwischen Klick und State-Update) verglich
  // der Toggle gegen einen veralteten Wert und das Panel blieb hängen
  // (Review 2026-06-10).
  const openBelegRef   = useRef(null)
  const belegeCacheRef = useRef({})

  function applyOpen(key) {
    openBelegRef.current = key
    setOpenBeleg(key)
  }

  function applyCacheEntry(key, value) {
    belegeCacheRef.current = { ...belegeCacheRef.current, [key]: value }
    setBelegeCache(belegeCacheRef.current)
  }

  /**
   * Lädt Belege für eine Kollokation.
   * @param {string} collocate   – Die Kollokation (Suchwort)
   * @param {string} [cacheKey]  – Optionaler Cache-Key (Standard: collocate); nützlich wenn
   *                               dasselbe Wort in verschiedenen Runden/Kontexten vorkommt
   * @param {Object} [overrides] – Überschreibt Hook-weite Parameter (z.B. { rel: 'KON' })
   */
  async function loadBelege(collocate, cacheKey, overrides = {}) {
    const key = cacheKey ?? collocate
    if (openBelegRef.current === key) { applyOpen(null); return }
    if (belegeCacheRef.current[key] !== undefined) { applyOpen(key); return }

    applyOpen(key)
    setBelegeLoading(true)
    try {
      const params = new URLSearchParams({
        collocate,
        lemma: lemmaWort,
        rel:   overrides.rel ?? relCode,
        ...(overrides.corpus && { corpus: overrides.corpus }),
        ...(overrides.year   && { year:   overrides.year   }),
      })
      const r    = await fetch(`${API}/belege?${params}`)
      if (!r.ok) { applyCacheEntry(key, null); return }
      const data = await r.json()
      applyCacheEntry(key, Array.isArray(data) ? data : null)
    } catch {
      applyCacheEntry(key, null)
    } finally {
      setBelegeLoading(false)
    }
  }

  function closeBelege() { applyOpen(null) }

  return { openBeleg, belegeCache, belegeLoading, loadBelege, closeBelege }
}
