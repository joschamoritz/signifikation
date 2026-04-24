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
    if (!lemma) return
    const needsIpa  = !initialIpa
    const needsDefs = !initialDefinitionen.length
    if (!needsIpa && !needsDefs) { setLoading(false); return }

    const controller = new AbortController()
    const { signal } = controller

    fetch(`${API}/wiktionary?q=${encodeURIComponent(lemma)}`, { signal })
      .then(r => r.json())
      .then(data => {
        if (needsIpa  && data.ipa)          setIpa(data.ipa)
        if (needsDefs && data.definitionen?.length) setDefinitionen(data.definitionen)
      })
      .catch(err => { if (err.name !== 'AbortError') console.error('Wiktionary fetch:', err) })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [lemma]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ipa, definitionen, loading }
}
