import { useState, useEffect } from 'react'
import { API } from '../config'

/**
 * Fetcht IPA + Definitionen für ein einzelnes Lemma von der Wiktionary-API.
 * Bereits vorhandene Werte (aus den gespeicherten Daten) werden als Initialwert
 * übernommen und nur dann per API nachgeladen, wenn sie fehlen.
 */
export function useWiktionary({ lemma, initialIpa = '', initialDefinitionen = [] }) {
  const [ipa, setIpa]               = useState(initialIpa)
  const [definitionen, setDefinitionen] = useState(initialDefinitionen)
  const [loading, setLoading]       = useState(!initialIpa || !initialDefinitionen.length)

  useEffect(() => {
    let cancelled = false

    setIpa(initialIpa)
    setDefinitionen(initialDefinitionen)
    setLoading(!initialIpa || !initialDefinitionen.length)

    if (!lemma) return () => { cancelled = true }
    const needsIpa  = !initialIpa
    const needsDefs = !initialDefinitionen.length
    if (!needsIpa && !needsDefs) {
      setLoading(false)
      return () => { cancelled = true }
    }

    const controller = new AbortController()
    const { signal } = controller

    fetch(`${API}/wiktionary?q=${encodeURIComponent(lemma)}`, { signal })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (needsIpa  && data.ipa) setIpa(data.ipa)
        if (needsDefs && data.definitionen?.length) setDefinitionen(data.definitionen)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [lemma, initialDefinitionen, initialIpa])

  return { ipa, definitionen, loading }
}
