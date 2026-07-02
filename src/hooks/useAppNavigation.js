import { useCallback, useEffect, useRef, useState } from 'react'

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

  // Konto-Tab: einmal gemounted, immer gemounted (lazy-once wie Classroom).
  const kontoMountedRef = useRef(false)
  const [kontoMounted, setKontoMounted] = useState(false)
  const mountKonto = useCallback(() => {
    if (kontoMountedRef.current) return
    kontoMountedRef.current = true
    setKontoMounted(true)
  }, [])

  // Mounten an activeTab === 'profil' koppeln, NICHT nur an handleTabChange:
  // der Tab kann auch direkt über setActiveTab('profil') gesetzt werden
  // (onNavigateToKonto aus Kurs/EigenesLemma/LoginNotice). Dieser Pfad ging
  // früher an handleTabChange vorbei → kontoMounted blieb false → der Konto-Tab
  // rendered dauerhaft leer, und der TabBar-Klick half nicht (handleTabChange
  // kehrt bei tab===activeTab früh zurück). Der Effekt fängt alle Pfade ab.
  useEffect(() => {
    if (activeTab === 'profil') mountKonto()
  }, [activeTab, mountKonto])

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return

    if (activeTab === 'spielmodi' && activePhase !== 'home') {
      startVT(() => backToHome())
    }

    // Synchron mounten (statt erst im Effekt), damit der häufige TabBar-Pfad
    // keinen Leer-Frame zeigt; der Effekt oben ist das Sicherheitsnetz.
    if (tab === 'profil') mountKonto()

    setActiveTab(tab)
  }, [activePhase, activeTab, backToHome, startVT, mountKonto])

  return {
    activeTab,
    setActiveTab,
    kontoMounted,
    handleTabChange,
    showTabBar: activePhase === 'home' || activeTab !== 'spielmodi',
  }
}
