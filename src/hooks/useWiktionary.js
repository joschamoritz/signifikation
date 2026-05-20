import { useState, useEffect, useRef } from 'react'
import { API } from '../config'

/**
 * Fetcht IPA + Definitionen für ein einzelnes Lemma von der Wiktionary-API.
 * Bereits vorhandene Werte (aus den gespeicherten Daten) werden als Initialwert
 * übernommen und nur dann per API nachgeladen, wenn sie fehlen.
 *
 * Effect läuft bewusst nur bei Lemma-Wechsel – wenn Parent ein neues
 * initialDefinitionen-Array-Objekt erzeugt (Identitätswechsel ohne
 * Inhaltsänderung), soll nicht erneut gefetcht werden. Refs halten die
 * aktuellen Initialwerte für den Effect-Zeitpunkt verfügbar.
 */
export function useWiktionary({ lemma, initialIpa = '', initialDefinitionen = [] }) {
  const [ipa, setIpa]               = useState(initialIpa)
  const [definitionen, setDefinitionen] = useState(initialDefinitionen)
  const [loading, setLoading]       = useState(!initialIpa || !initialDefinitionen.length)

  const initialIpaRef  = useRef(initialIpa)
  const initialDefsRef = useRef(initialDefinitionen)
  initialIpaRef.current  = initialIpa
  initialDefsRef.current = initialDefinitionen

  useEffect(() => {
    let cancelled = false
    const currentInitialIpa  = initialIpaRef.current
    const currentInitialDefs = initialDefsRef.current

    // Bei Lemma-Wechsel immer auf aktuelle Initialwerte zurücksetzen, damit
    // IPA/Definitionen des Vorgängers nicht stehen bleiben.
    setIpa(currentInitialIpa)
    setDefinitionen(currentInitialDefs)

    if (!lemma) return () => { cancelled = true }

    const needsIpa  = !currentInitialIpa
    const needsDefs = !currentInitialDefs.length
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
  }, [lemma])

  return { ipa, definitionen, loading }
}
