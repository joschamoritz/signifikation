import { useCallback, useRef, useState } from 'react'

// Deep-Link von der Lehrer-Landingpage (/lehrer): /?tab=klassenraum öffnet
// direkt den Klassenraum-Tab (für nicht eingeloggte Lehrkräfte → Schüler-/
// Demo-Ansicht). Bewusst nur 'klassenraum', um keine Mount-Sonderfälle für
// Konto/Kurs zu erzeugen (die werden lazy via handleTabChange gemountet).
function initialTab() {
  if (typeof window === 'undefined') return 'spielmodi'
  try {
    if (new URLSearchParams(window.location.search).get('tab') === 'klassenraum') {
      return 'klassenraum'
    }
  } catch { /* ungültige URL → Default */ }
  return 'spielmodi'
}

export function useAppNavigation({ activePhase, backToHome, startVT }) {
  const [activeTab, setActiveTab] = useState(initialTab)

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
