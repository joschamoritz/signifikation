import { useState, useEffect, useRef } from 'react'

const TAB_ORDER = ['spielmodi', 'klassenraum', 'kurs', 'profil']

export default function TabTransition({ activeTab, tabs }) {
  const [displayTab, setDisplayTab] = useState(activeTab)
  const [prevTab, setPrevTab] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [direction, setDirection] = useState(null)
  const prevTabRef = useRef(activeTab)

  const currentScreen = tabs[displayTab] ?? null
  const previousScreen = prevTab ? (tabs[prevTab] ?? null) : null

  useEffect(() => {
    if (activeTab === prevTabRef.current) return

    const fromIndex = TAB_ORDER.indexOf(prevTabRef.current)
    const toIndex = TAB_ORDER.indexOf(activeTab)
    const newDirection = toIndex > fromIndex ? 'forward' : 'backward'

    setDirection(newDirection)
    setPrevTab(prevTabRef.current)
    setIsTransitioning(true)
    
    // Sofort neuen Tab mounten (beide Screens parallel während Transition)
    setDisplayTab(activeTab)
    prevTabRef.current = activeTab

    // Nach Animation: Cleanup
    const timer = setTimeout(() => {
      setIsTransitioning(false)
      setPrevTab(null)
      setDirection(null)
    }, 350)

    return () => clearTimeout(timer)
  }, [activeTab])

  return (
    <div className="tab-transition-container">
      {/* Alte Seite (exit-Animation, nur während Transition sichtbar) */}
      {isTransitioning && previousScreen && (
        <div className={`tab-screen tab-screen--exit-${direction}`} key={prevTab}>
          {previousScreen}
        </div>
      )}
      
      {/* Neue Seite (enter-Animation wenn Transition läuft, sonst statisch) */}
      <div 
        className={`tab-screen${isTransitioning ? ` tab-screen--enter-${direction}` : ''}`}
        style={!isTransitioning ? { position: 'relative' } : undefined}
        key={displayTab}
      >
        {currentScreen}
      </div>
    </div>
  )
}
