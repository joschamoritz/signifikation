import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import { useAppModel } from './hooks/useAppModel'
import { useTheme, ThemeContext } from './hooks/useTheme'
import { useFeatureFlag } from './hooks/useFeatureFlag'
import { useLocationPath, matchClassroomRoute } from './components/classroom-v2/routing'
import './components/classroom-v2/student/KioskStub.css'

// Classroom zieht socket.io-client (~32 KB) und Mollie-Flows mit; nur laden,
// wenn der Nutzer tatsächlich auf den jeweiligen Tab wechselt.
const PersistentClassroomTab = lazy(() => import('./components/PersistentClassroomTab'))
const PersistentKontoTab     = lazy(() => import('./components/PersistentKontoTab'))

// Classroom v2 — Tab fuer Lehrkraefte (gleicher Lazy-Pfad wie v1, damit
// socket.io-client erst beim Tab-Wechsel geladen wird) und Schueler-Shell
// (eigene Route /c und /c/:code).
const TeacherClassroomTabV2 = lazy(() => import('./components/classroom-v2/teacher/TeacherClassroomTab'))
const StudentJoinEntry      = lazy(() => import('./components/classroom-v2/student/StudentJoinEntry'))
const StudentKioskRoute     = lazy(() => import('./components/classroom-v2/student/StudentKioskRoute'))

// MainAppShell kapselt useAppModel + alle Hooks der Hauptansicht. Dadurch
// kann <App> ueber Routen entscheiden, ohne dass die Hook-Reihenfolge in
// <App> abhaengig von der aktuellen URL waechst oder schrumpft (das war ein
// realer Bug — Pfadwechsel von / auf /c/CODE liess React die Hooks unterhalb
// der Branch verschwinden und warf „Rendered fewer hooks than expected").
function MainAppShell() {
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
  const showClassroomV2 = useFeatureFlag('classroom_v2')

  // Klassenraum v2: einmal gemounted (bei erstem Tab-Besuch), bleibt im DOM
  // damit Sockets und Step-State einen Tab-Wechsel ueberleben — identisches
  // Pattern wie PersistentClassroomTab (v1) und PersistentKontoTab.
  const classroomV2MountedRef = useRef(false)
  const [classroomV2Mounted, setClassroomV2Mounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'klassenraum-v2' && !classroomV2MountedRef.current) {
      classroomV2MountedRef.current = true
      setClassroomV2Mounted(true)
    }
  }, [activeTab])

  return (
    <>
      <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
        <AppGameScreens {...appGameScreensProps} />
        <TabTransition activeTab={activeTab} tabs={tabScreens} />
        <Suspense fallback={null}>
          {classroomMounted ? <PersistentClassroomTab {...persistentClassroomProps} /> : null}
          {kontoMounted ? <PersistentKontoTab {...persistentKontoProps} /> : null}
          {classroomV2Mounted ? (
            <div
              aria-hidden={activeTab !== 'klassenraum-v2' ? 'true' : undefined}
              style={activeTab !== 'klassenraum-v2' ? { display: 'none' } : undefined}
            >
              <TeacherClassroomTabV2 />
            </div>
          ) : null}
        </Suspense>
      </AppShell>
      {showTabBar && (
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          classroomLive={classroomLive}
          showClassroomV2={showClassroomV2}
        />
      )}
    </>
  )
}

export default function App() {
  const theme = useTheme()
  const path = useLocationPath()
  const classroomRoute = matchClassroomRoute(path)

  return (
    <ThemeContext.Provider value={theme}>
      <ErrorBoundary>
        {classroomRoute.match ? (
          <Suspense fallback={null}>
            {classroomRoute.match === 'kiosk'
              ? <StudentKioskRoute code={classroomRoute.code} />
              : <StudentJoinEntry />}
          </Suspense>
        ) : (
          <MainAppShell />
        )}
      </ErrorBoundary>
    </ThemeContext.Provider>
  )
}
