import { useState, useEffect, useRef } from 'react'

const TAB_ORDER = ['spielmodi', 'klassenraum', 'kurs', 'profil']

export default function TabTransition({ activeTab, tabs }) {
  const [displayTab, setDisplayTab] = useState(activeTab)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [direction, setDirection] = useState(null)
  const prevTabRef = useRef(activeTab)
  const timerRef = useRef(null)

  const currentScreen = tabs[displayTab] ?? null

  useEffect(() => {
    if (activeTab === prevTabRef.current) return

    const fromIndex = TAB_ORDER.indexOf(prevTabRef.current)
    const toIndex = TAB_ORDER.indexOf(activeTab)
    const newDirection = toIndex > fromIndex ? 'forward' : 'backward'

    setDirection(newDirection)
    setIsTransitioning(true)

    setDisplayTab(activeTab)
    prevTabRef.current = activeTab

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsTransitioning(false)
      setDirection(null)
    }, 350)

    return () => clearTimeout(timerRef.current)
  }, [activeTab])

  return (
    <div className="tab-transition-container">
      <div 
        className={`tab-screen${isTransitioning ? ` tab-screen--shift-${direction}` : ''}`}
        style={!isTransitioning ? { position: 'relative' } : undefined}
        key={displayTab}
      >
        {currentScreen}
      </div>
    </div>
  )
}
