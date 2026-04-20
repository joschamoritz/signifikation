import { useCallback, useEffect, useState } from 'react'

export function useClassroomSnapNav({ entriesRef, isTeacher, loadingAccount }) {
  const [activeCard, setActiveCard] = useState(0)

  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [entriesRef])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return
    const container = entriesRef.current
    if (!container) return
    const items = container.querySelectorAll('.test-entry')
    if (!items.length) return
    const observer = new IntersectionObserver(
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
    return () => observer.disconnect()
  }, [entriesRef, loadingAccount, isTeacher])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)')
    if (!mq.matches) return
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.forEach((item, index) => {
      if (index === activeCard) item.removeAttribute('inert')
      else item.setAttribute('inert', '')
    })
  }, [activeCard, entriesRef])

  const handleSnapKeyDown = useCallback((event) => {
    if (!window.matchMedia('(max-width: 699px)').matches) return
    const maxCard = isTeacher ? 3 : 2
    if (event.key === 'ArrowDown') scrollToCard(Math.min(activeCard + 1, maxCard))
    if (event.key === 'ArrowUp') scrollToCard(Math.max(activeCard - 1, 0))
  }, [activeCard, isTeacher, scrollToCard])

  return {
    activeCard,
    scrollToCard,
    handleSnapKeyDown,
  }
}
