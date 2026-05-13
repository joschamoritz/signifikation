// Belege aus eigener belege.db (CC BY-SA, kein DWDS).
// Aktiviert sobald belege.db auf Railway Volume hochgeladen ist (BELEGE_DB=/data/belege.db).

import { useState } from 'react'
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

  /**
   * Lädt Belege für eine Kollokation.
   * @param {string} collocate   – Die Kollokation (Suchwort)
   * @param {string} [cacheKey]  – Optionaler Cache-Key (Standard: collocate); nützlich wenn
   *                               dasselbe Wort in verschiedenen Runden/Kontexten vorkommt
   * @param {Object} [overrides] – Überschreibt Hook-weite Parameter (z.B. { rel: 'KON' })
   */
  async function loadBelege(collocate, cacheKey, overrides = {}) {
    const key = cacheKey ?? collocate
    if (openBeleg === key) { setOpenBeleg(null); return }
    if (belegeCache[key] !== undefined) { setOpenBeleg(key); return }

    setOpenBeleg(key)
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
      if (!r.ok) { setBelegeCache(prev => ({ ...prev, [key]: null })); return }
      const data = await r.json()
      setBelegeCache(prev => ({ ...prev, [key]: Array.isArray(data) ? data : null }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [key]: null }))
    } finally {
      setBelegeLoading(false)
    }
  }

  function closeBelege() { setOpenBeleg(null) }

  return { openBeleg, belegeCache, belegeLoading, loadBelege, closeBelege }
}
