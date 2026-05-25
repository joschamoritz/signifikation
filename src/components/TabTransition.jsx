import { useEffect, useLayoutEffect, useRef } from 'react'

export default function TabTransition({ activeTab, tabs }) {
  const currentScreen = tabs[activeTab] ?? null
  const hasActiveScreen = Boolean(currentScreen)
  const containerRef = useRef(null)
  const scrollPositionsRef = useRef(new Map())

  // Scroll-Position des aktiven Tabs kontinuierlich mitschreiben,
  // damit sie beim Tab-Wechsel verfügbar ist (Cleanup-Snapshot wäre zu spät:
  // useLayoutEffect-Cleanup läuft erst nachdem React den alten Subtree entfernt hat).
  useEffect(() => {
    const scrollEl = containerRef.current?.querySelector('.test-entries')
    if (!scrollEl) return
    const handleScroll = () => {
      scrollPositionsRef.current.set(activeTab, scrollEl.scrollTop)
    }
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [activeTab])

  // Beim Tab-Wechsel die gemerkte Scroll-Position wiederherstellen,
  // bevor der Browser malt – verhindert sichtbares Springen.
  useLayoutEffect(() => {
    const scrollEl = containerRef.current?.querySelector('.test-entries')
    if (!scrollEl) return
    const saved = scrollPositionsRef.current.get(activeTab)
    if (saved && saved > 0) scrollEl.scrollTop = saved
  }, [activeTab])

  return (
    <div
      ref={containerRef}
      className={`tab-transition-container${hasActiveScreen ? '' : ' tab-transition-container--empty'}`}
    >
      {currentScreen ? (
        <div className="tab-screen tab-screen--static" key={activeTab}>
          {currentScreen}
        </div>
      ) : null}
    </div>
  )
}
