import { useState, useEffect } from 'react'

export function useActiveSnapCard(containerRef) {
  const [activeCard, setActiveCard] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return

    const container = containerRef.current
    if (!container) return

    const items = container.querySelectorAll('.test-entry')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setActiveCard(Array.from(items).indexOf(entry.target))
          }
        })
      },
      { root: container, threshold: 0.5 }
    )

    items.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [containerRef])

  useEffect(() => {
    const items = containerRef.current?.querySelectorAll('.test-entry')
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) {
      // Breakpoint verlassen – alle inert-Attribute bereinigen
      items?.forEach(item => item.removeAttribute('inert'))
      return
    }
    items?.forEach((item, i) => {
      if (i === activeCard) item.removeAttribute('inert')
      else item.setAttribute('inert', '')
    })
  }, [activeCard, containerRef])

  return activeCard
}
