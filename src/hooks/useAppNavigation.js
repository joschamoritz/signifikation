import { useCallback, useState } from 'react'

export function useAppNavigation({ activePhase, backToHome, startVT }) {
  const [activeTab, setActiveTab] = useState('spielmodi')
  const [classroomLive, setClassroomLive] = useState(false)
  const [classroomInSession, setClassroomInSession] = useState(false)

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return

    if (activeTab === 'spielmodi' && activePhase !== 'home') {
      startVT(() => backToHome())
    }

    setActiveTab(tab)
  }, [activePhase, activeTab, backToHome, startVT])

  return {
    activeTab,
    setActiveTab,
    classroomLive,
    setClassroomLive,
    classroomInSession,
    setClassroomInSession,
    handleTabChange,
    showTabBar: activePhase === 'home' || activeTab !== 'spielmodi',
  }
}
