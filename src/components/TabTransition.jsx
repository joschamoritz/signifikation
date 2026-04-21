import { useState, useEffect, useRef } from 'react'

const TAB_ORDER = ['spielmodi', 'klassenraum', 'kurs', 'profil']

export default function TabTransition({ activeTab, tabs }) {
  const [displayTab, setDisplayTab] = useState(activeTab)
  const [leavingTab, setLeavingTab] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [direction, setDirection] = useState(null)
  const prevTabRef = useRef(activeTab)
  const timerRef = useRef(null)

  const currentScreen = tabs[displayTab] ?? null
  const leavingScreen = leavingTab ? (tabs[leavingTab] ?? null) : null
  const hasActiveScreen = Boolean(currentScreen || leavingScreen)

  useEffect(() => {
    if (activeTab === prevTabRef.current) return

    const fromIndex = TAB_ORDER.indexOf(prevTabRef.current)
    const toIndex = TAB_ORDER.indexOf(activeTab)
    const newDirection = toIndex > fromIndex ? 'forward' : 'backward'

    setDirection(newDirection)
    setIsTransitioning(true)
    setLeavingTab(prevTabRef.current)

    setDisplayTab(activeTab)
    prevTabRef.current = activeTab

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsTransitioning(false)
      setDirection(null)
      setLeavingTab(null)
    }, 350)

    return () => clearTimeout(timerRef.current)
  }, [activeTab])

  return (
    <div className={`tab-transition-container${hasActiveScreen ? '' : ' tab-transition-container--empty'}`}>
      {isTransitioning && leavingScreen ? (
        <div className={`tab-screen tab-screen--exit-${direction}`} key={`leave-${leavingTab}`}>
          {leavingScreen}
        </div>
      ) : null}
      {currentScreen ? (
        <div
          className={`tab-screen${isTransitioning ? ` tab-screen--enter-${direction}` : ' tab-screen--static'}`}
          key={`enter-${displayTab}`}
        >
          {currentScreen}
        </div>
      ) : null}
    </div>
  )
}
