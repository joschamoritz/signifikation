import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import PersistentClassroomTab from './components/PersistentClassroomTab'
import PersistentKontoTab from './components/PersistentKontoTab'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import { useAppModel } from './hooks/useAppModel'
import { useTheme, ThemeContext } from './hooks/useTheme'

export default function App() {
  const theme = useTheme()

  const {
    appRef,
    activeTab,
    classroomLive,
    classroomMounted,
    kontoMounted,
    handleTabChange,
    showTabBar,
    phase,
    tabScreens,
    appGameScreensProps,
    persistentClassroomProps,
    persistentKontoProps,
  } = useAppModel()

  return (
    <ThemeContext.Provider value={theme}>
    <ErrorBoundary>
      <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
        <AppGameScreens {...appGameScreensProps} />
        <TabTransition activeTab={activeTab} tabs={tabScreens} />
        {classroomMounted ? <PersistentClassroomTab {...persistentClassroomProps} /> : null}
        {kontoMounted ? <PersistentKontoTab {...persistentKontoProps} /> : null}
      </AppShell>
      {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} classroomLive={classroomLive} />}
    </ErrorBoundary>
    </ThemeContext.Provider>
  )
}
