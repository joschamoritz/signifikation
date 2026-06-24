import { useState, useEffect } from 'react'

// Reaktiver Media-Query-Hook. SSR-/Test-sicher (kein window → false). Nutzt die
// moderne addEventListener-API (Safari ≥14). Bewusst minimal — die Konstante
// MOBILE_MEDIA_QUERY kommt aus src/config.js, damit JS und CSS dieselbe Grenze
// teilen (699px).
export function useMediaQuery(query) {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false

  const [matches, setMatches] = useState(get)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    setMatches(mq.matches) // Query kann sich zwischen Render und Effekt geändert haben
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])

  return matches
}
