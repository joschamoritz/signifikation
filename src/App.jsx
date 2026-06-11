import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import { useAppModel } from './hooks/useAppModel'
import { useTheme, ThemeContext } from './hooks/useTheme'
import { useLocationPath, matchClassroomRoute } from './components/classroom/routing'

// Classroom zieht socket.io-client (~32 KB) und Mollie-Flows mit; nur laden,
// wenn der Nutzer tatsächlich auf den jeweiligen Tab wechselt.
const PersistentKontoTab     = lazy(() => import('./components/PersistentKontoTab'))

// Klassenraum — Tab fuer Lehrkraefte (Lazy-Pfad, damit socket.io-client erst
// beim Tab-Wechsel geladen wird) und Schueler-Shell (Routen /c und /c/:code).
const TeacherClassroomTab = lazy(() => import('./components/classroom/teacher/TeacherClassroomTab'))
const StudentJoinEntry    = lazy(() => import('./components/classroom/student/StudentJoinEntry'))
const StudentKioskRoute   = lazy(() => import('./components/classroom/student/StudentKioskRoute'))

// Inline-Fallback fuer einen einzelnen Tab/Bereich: ersetzt nur diesen
// Ausschnitt (die TabBar + andere Tabs bleiben bedienbar), statt die ganze
// App gegen die globale Fehler-UI zu tauschen.
function SectionErrorFallback({ label = 'Dieser Bereich' }) {
  return (
    <div role="alert" className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 12, padding: '32px 24px', textAlign: 'center' }}>
      <p aria-hidden="true" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', color: 'var(--accent)', letterSpacing: '0.3em', lineHeight: 1 }}>· · ·</p>
      <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 700 }}>{label} konnte nicht geladen werden</p>
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', maxWidth: 320 }}>Wechsle den Tab oder lade die Seite neu.</p>
      <button className="btn-primary" onClick={() => window.location.reload()}>Seite neu laden</button>
    </div>
  )
}

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
  // F5: Klassenraum-Tab fuer ALLE sichtbar — Lehrer sehen das Setup,
  // nicht-eingeloggte Nutzer die Schueler-Code-Eingabe (+ QR-Scan).
  const showClassroomTab = true

  // Klassenraum (Lehrer): einmal gemounted (bei erstem Tab-Besuch), bleibt im
  // DOM damit Sockets und Step-State einen Tab-Wechsel ueberleben — identisches
  // Pattern wie PersistentKontoTab. Fuer Schueler nicht noetig (leichtgewichtig).
  const classroomMountedRef = useRef(false)
  const [classroomMounted, setClassroomMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'klassenraum' && classroomTeacher && !classroomMountedRef.current) {
      classroomMountedRef.current = true
      setClassroomMounted(true)
    }
  }, [activeTab, classroomTeacher])

  return (
    <>
      <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
        <AppGameScreens {...appGameScreensProps} />
        <TabTransition activeTab={activeTab} tabs={tabScreens} />
        <Suspense fallback={null}>
          {kontoMounted ? (
            <ErrorBoundary fallback={<SectionErrorFallback label="Das Konto" />}>
              <PersistentKontoTab {...persistentKontoProps} />
            </ErrorBoundary>
          ) : null}
          {classroomMounted && classroomTeacher ? (
            <div
              aria-hidden={activeTab !== 'klassenraum' ? 'true' : undefined}
              style={activeTab !== 'klassenraum' ? { display: 'none' } : undefined}
            >
              <ErrorBoundary fallback={<SectionErrorFallback label="Der Klassenraum" />}>
                <TeacherClassroomTab />
              </ErrorBoundary>
            </div>
          ) : null}
          {activeTab === 'klassenraum' && !classroomTeacher ? (
            <ErrorBoundary fallback={<SectionErrorFallback label="Der Klassenraum" />}>
              <StudentJoinEntry embedded />
            </ErrorBoundary>
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
