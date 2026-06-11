import { useEffect } from 'react'

export function useAppEffects({
  activeTab,
  refreshEntitlements,
  phase,
  appRef,
}) {
  useEffect(() => {
    if (activeTab !== 'profil') return
    refreshEntitlements()
  }, [activeTab, refreshEntitlements])

  useEffect(() => {
    appRef.current?.focus()
  }, [appRef, phase])

  // Hinweis: Die Persistenz der Kollokationen-Ergebnisse haengt jetzt am
  // Finish-Ereignis in useKollokationenGame (Phasenwechsel → 'results'),
  // nicht mehr an einem render-getriebenen Effekt hier.
}
