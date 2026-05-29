import { useCallback, useRef, useState } from 'react'

export function useAppNavigation({ activePhase, backToHome, startVT }) {
  const [activeTab, setActiveTab] = useState('spielmodi')

  // Konto-Tab: einmal gemounted, immer gemounted (lazy-once wie Classroom)
  const kontoMountedRef = useRef(false)
  const [kontoMounted, setKontoMounted] = useState(false)

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return

    if (activeTab === 'spielmodi' && activePhase !== 'home') {
      startVT(() => backToHome())
    }

    if (tab === 'profil' && !kontoMountedRef.current) {
      kontoMountedRef.current = true
      setKontoMounted(true)
    }

    setActiveTab(tab)
  }, [activePhase, activeTab, backToHome, startVT])

  return {
    activeTab,
    setActiveTab,
    kontoMounted,
    handleTabChange,
    showTabBar: activePhase === 'home' || activeTab !== 'spielmodi',
  }
}
