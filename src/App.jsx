import { lazy, Suspense } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import UpdateBanner from './components/UpdateBanner'
import { useAppModel } from './hooks/useAppModel'
import { useTheme, ThemeContext } from './hooks/useTheme'

// Classroom zieht socket.io-client (~32 KB) und Mollie-Flows mit; nur laden,
// wenn der Nutzer tatsächlich auf den jeweiligen Tab wechselt.
const PersistentClassroomTab = lazy(() => import('./components/PersistentClassroomTab'))
const PersistentKontoTab     = lazy(() => import('./components/PersistentKontoTab'))

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
      <UpdateBanner />
      <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
        <AppGameScreens {...appGameScreensProps} />
        <TabTransition activeTab={activeTab} tabs={tabScreens} />
        <Suspense fallback={null}>
          {classroomMounted ? <PersistentClassroomTab {...persistentClassroomProps} /> : null}
          {kontoMounted ? <PersistentKontoTab {...persistentKontoProps} /> : null}
        </Suspense>
      </AppShell>
      {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} classroomLive={classroomLive} />}
    </ErrorBoundary>
    </ThemeContext.Provider>
  )
}
