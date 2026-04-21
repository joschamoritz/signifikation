import { useEffect } from 'react'

export function useAppEffects({
  activeTab,
  refreshEntitlements,
  phase,
  appRef,
  persistResults,
  classroomSubmitRef,
}) {
  useEffect(() => {
    if (activeTab !== 'profil') return
    refreshEntitlements()
  }, [activeTab, refreshEntitlements])

  useEffect(() => {
    appRef.current?.focus()
  }, [appRef, phase])

  useEffect(() => {
    persistResults(classroomSubmitRef.current)
  }, [classroomSubmitRef, persistResults])
}
