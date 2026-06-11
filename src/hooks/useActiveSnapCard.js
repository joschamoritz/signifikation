import { MOBILE_MEDIA_QUERY } from '../config'
import { useState, useEffect } from 'react'

export function useActiveSnapCard(containerRef) {
  const [activeCard, setActiveCard] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY)
    const container = containerRef.current
    if (!container) return

    const items = container.querySelectorAll('.test-entry')
    let observer = null

    function connect() {
      if (observer) return
      observer = new IntersectionObserver(
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
    }

    function disconnect() {
      if (!observer) return
      observer.disconnect()
      observer = null
      items.forEach(item => item.removeAttribute('inert'))
    }

    function onBreakpointChange(e) {
      if (e.matches) connect()
      else disconnect()
    }

    mq.addEventListener('change', onBreakpointChange)
    if (mq.matches) connect()

    return () => {
      mq.removeEventListener('change', onBreakpointChange)
      disconnect()
    }
  }, [containerRef])

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY)
    const items = containerRef.current?.querySelectorAll('.test-entry')

    function applyInert(isMobile) {
      if (!isMobile) {
        items?.forEach(item => item.removeAttribute('inert'))
        return
      }
      items?.forEach((item, i) => {
        if (i === activeCard) item.removeAttribute('inert')
        else item.setAttribute('inert', '')
      })
    }

    function onBreakpointChange(e) {
      applyInert(e.matches)
    }

    mq.addEventListener('change', onBreakpointChange)
    applyInert(mq.matches)

    return () => mq.removeEventListener('change', onBreakpointChange)
  }, [activeCard, containerRef])

  return activeCard
}
