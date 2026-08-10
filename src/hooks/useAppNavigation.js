import { useCallback, useEffect, useRef, useState } from 'react'

// Deep-Link von der Lehrer-Landingpage (/lehrer): /?tab=klassenraum öffnet
// direkt den Klassenraum-Tab (für nicht eingeloggte Lehrkräfte → Schüler-/
// Demo-Ansicht).
//
// /?tab=konto kommt aus den Systemmails: der Passwort-Reset-Link landet mit
// `?token=…` hier, die E-Mail-Bestätigung mit `?verified=1`. Beides zeigt seine
// Rückmeldung in der Konto-Karte — ohne diesen Sprung sähe der Nutzer nach dem
// Klick auf den Mail-Link nur die Startseite. `token` allein reicht ebenfalls,
// damit ältere Reset-Links (ohne tab-Parameter) nicht ins Leere laufen.
function initialTab() {
  if (typeof window === 'undefined') return 'spielmodi'
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === 'klassenraum') return 'klassenraum'
    if (params.get('tab') === 'konto' || params.has('token') || params.has('verified')) {
      return 'profil'
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
