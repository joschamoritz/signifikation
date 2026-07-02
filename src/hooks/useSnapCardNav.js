import { useCallback } from 'react'
import { MOBILE_MEDIA_QUERY } from '../config'

// Snap-Card-Navigation (Home + Kurs teilen dieselbe .test-entries-Snap-Liste):
// Klick/Badge-Sprung per scrollToCard, Pfeiltasten-Navigation (nur mobil) über
// handleSnapKeyDown. Erwartet den bereits berechneten activeCard-Index (aus
// useActiveSnapCard), damit dieser Hook keine eigene IntersectionObserver-
// Logik duplizieren muss.
export function useSnapCardNav(containerRef, activeCard) {
  const scrollToCard = useCallback((index) => {
    const items = containerRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [containerRef])

  const handleSnapKeyDown = useCallback((e) => {
    if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return
    const maxIndex = (containerRef.current?.querySelectorAll('.test-entry').length ?? 1) - 1
    if (e.key === 'ArrowDown') scrollToCard(Math.min(activeCard + 1, maxIndex))
    if (e.key === 'ArrowUp')   scrollToCard(Math.max(activeCard - 1, 0))
  }, [containerRef, activeCard, scrollToCard])

  return { scrollToCard, handleSnapKeyDown }
}
