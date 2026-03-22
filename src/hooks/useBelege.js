// DEAKTIVIERT: Korpusbelege dürfen laut DWDS-Nutzungsbedingungen nicht extern veröffentlicht werden.
// Reaktivieren sobald schriftliche Genehmigung der BBAW vorliegt.
// In Results.jsx: useBelege-Import + useBelege()-Aufruf + BelegePanel einkommentieren,
//                 onClick der wortprofil-item buttons auf loadBelege umstellen.

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
   * Lädt Belege für ein Kollokat.
   * @param {string} collocate   – Das Kollokat (Suchwort)
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
      const data = await r.json()
      setBelegeCache(prev => ({ ...prev, [key]: Array.isArray(data) ? data : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [key]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  function closeBelege() { setOpenBeleg(null) }

  return { openBeleg, belegeCache, belegeLoading, loadBelege, closeBelege }
}
