import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import { useAppModel } from './hooks/useAppModel'
import { useTheme, ThemeContext } from './hooks/useTheme'
import { useLocationPath, matchClassroomRoute } from './components/classroom/routing'
import './components/classroom/student/KioskStub.css'

// Classroom zieht socket.io-client (~32 KB) und Mollie-Flows mit; nur laden,
// wenn der Nutzer tatsächlich auf den jeweiligen Tab wechselt.
const PersistentKontoTab     = lazy(() => import('./components/PersistentKontoTab'))

// Klassenraum — Tab fuer Lehrkraefte (Lazy-Pfad, damit socket.io-client erst
// beim Tab-Wechsel geladen wird) und Schueler-Shell (Routen /c und /c/:code).
const TeacherClassroomTab = lazy(() => import('./components/classroom/teacher/TeacherClassroomTab'))
const StudentJoinEntry    = lazy(() => import('./components/classroom/student/StudentJoinEntry'))
const StudentKioskRoute   = lazy(() => import('./components/classroom/student/StudentKioskRoute'))

// MainAppShell kapselt useAppModel + alle Hooks der Hauptansicht. Dadurch
// kann <App> ueber Routen entscheiden, ohne dass die Hook-Reihenfolge in
// <App> abhaengig von der aktuellen URL waechst oder schrumpft (das war ein
// realer Bug — Pfadwechsel von / auf /c/CODE liess React die Hooks unterhalb
// der Branch verschwinden und warf „Rendered fewer hooks than expected").
function MainAppShell() {
  const {
    appRef,
    activeTab,
    kontoMounted,
    handleTabChange,
    showTabBar,
    phase,
    tabScreens,
    appGameScreensProps,
    persistentKontoProps,
    classroomTeacher,
  } = useAppModel()
  const showClassroomTab = classroomTeacher

  // Klassenraum: einmal gemounted (bei erstem Tab-Besuch), bleibt im DOM
  // damit Sockets und Step-State einen Tab-Wechsel ueberleben — identisches
  // Pattern wie PersistentKontoTab.
  const classroomMountedRef = useRef(false)
  const [classroomMounted, setClassroomMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'klassenraum' && !classroomMountedRef.current) {
      classroomMountedRef.current = true
      setClassroomMounted(true)
    }
  }, [activeTab])

  return (
    <>
      <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
        <AppGameScreens {...appGameScreensProps} />
        <TabTransition activeTab={activeTab} tabs={tabScreens} />
        <Suspense fallback={null}>
          {kontoMounted ? <PersistentKontoTab {...persistentKontoProps} /> : null}
          {classroomMounted ? (
            <div
              aria-hidden={activeTab !== 'klassenraum' ? 'true' : undefined}
              style={activeTab !== 'klassenraum' ? { display: 'none' } : undefined}
            >
              <TeacherClassroomTab />
            </div>
          ) : null}
        </Suspense>
      </AppShell>
      {showTabBar && (
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          showClassroomTab={showClassroomTab}
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
