import { useEffect, useLayoutEffect } from 'react'

// Modul-Level Map: überlebt Komponenten-Mounts.
// Key ist beliebig (Tab-Name); Wert ist letzte scrollTop-Position.
const scrollPositions = new Map()

/**
 * Hängt einen Scroll-Listener an `ref.current` und merkt sich die scrollTop
 * unter `key`. Beim Mount wird die Position wiederhergestellt – synchron vor
 * dem ersten Paint, damit kein Springen sichtbar ist.
 *
 * Funktioniert auch wenn die Komponente durch phase-Wechsel (nicht Tab-Wechsel)
 * neu gemountet wird, da die Logik am Lifecycle der Komponente selbst hängt.
 */
export function useScrollPersist(ref, key) {
  // Restore vor dem Paint
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const saved = scrollPositions.get(key)
    if (saved && saved > 0) el.scrollTop = saved
  }, [ref, key])

  // Kontinuierliches Tracking, damit beim nächsten Mount der letzte Wert vorliegt
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handleScroll = () => {
      scrollPositions.set(key, el.scrollTop)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [ref, key])
}
