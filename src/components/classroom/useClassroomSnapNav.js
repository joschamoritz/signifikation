import { useCallback, useEffect, useState } from 'react'

export function useClassroomSnapNav({ entriesRef, isTeacher, loadingAccount }) {
  const [activeCard, setActiveCard] = useState(0)

  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [entriesRef])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    const container = entriesRef.current
    if (!container) return
    const items = container.querySelectorAll('.test-entry')
    if (!items.length) return

    let observer = null

    function connect() {
      if (observer) return
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              setActiveCard(Array.from(items).indexOf(entry.target))
            }
          })
        },
        { root: container, threshold: 0.5 },
      )
      items.forEach((item) => observer.observe(item))
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
  }, [entriesRef, loadingAccount, isTeacher])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    const items = entriesRef.current?.querySelectorAll('.test-entry')

    function applyInert(isMobile) {
      if (!isMobile) {
        items?.forEach(item => item.removeAttribute('inert'))
        return
      }
      items?.forEach((item, index) => {
        if (index === activeCard) item.removeAttribute('inert')
        else item.setAttribute('inert', '')
      })
    }

    function onBreakpointChange(e) {
      applyInert(e.matches)
    }

    mq.addEventListener('change', onBreakpointChange)
    applyInert(mq.matches)

    return () => mq.removeEventListener('change', onBreakpointChange)
  }, [activeCard, entriesRef])

  const handleSnapKeyDown = useCallback((event) => {
    if (!window.matchMedia('(max-width: 699px)').matches) return
    const maxCard = isTeacher ? 3 : 2
    if (event.key === 'ArrowDown' && activeCard < maxCard) scrollToCard(activeCard + 1)
    if (event.key === 'ArrowUp' && activeCard > 0) scrollToCard(activeCard - 1)
  }, [activeCard, isTeacher, scrollToCard])

  return {
    activeCard,
    scrollToCard,
    handleSnapKeyDown,
  }
}
