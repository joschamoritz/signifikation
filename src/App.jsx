import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import PersistentClassroomTab from './components/PersistentClassroomTab'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import PaywallModal from './components/PaywallModal'
import { useAppModel } from './hooks/useAppModel'

export default function App() {
  const {
    appRef,
    activeTab,
    classroomLive,
    handleTabChange,
    showTabBar,
    phase,
    tabScreens,
    appGameScreensProps,
    persistentClassroomProps,
    isPaywallOpen,
    closePaywall,
  } = useAppModel()

  return (
    <ErrorBoundary>
      <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
        <AppGameScreens {...appGameScreensProps} />
        <TabTransition activeTab={activeTab} tabs={tabScreens} />
        <PersistentClassroomTab {...persistentClassroomProps} />
      </AppShell>
      {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} classroomLive={classroomLive} />}
      {isPaywallOpen && <PaywallModal onClose={closePaywall} />}
    </ErrorBoundary>
  )
}
