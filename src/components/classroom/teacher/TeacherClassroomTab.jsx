// Root des Lehrer-Tabs „Klassenraum".
//
// Mountet den Reducer-Context und rendert den Step, der gerade aktiv ist.
// Wörterbuch-Stil: Container limitiert auf 680px (Setup/Lobby).

import { TeacherClassroomProvider, useTeacherClassroom, STEPS } from './TeacherClassroomContext'
import TabHeader        from '../../TabHeader'
import SessionListStep from './steps/SessionListStep'
import SetupStep       from './steps/SetupStep'
import LobbyStep       from './steps/LobbyStep'
import LiveStep        from './steps/LiveStep'
import EndStep         from './steps/EndStep'
import './TeacherClassroomTab.css'

function StepRouter() {
  const { state } = useTeacherClassroom()
  switch (state.currentStep) {
    case STEPS.SETUP: return <SetupStep />
    case STEPS.LOBBY: return <LobbyStep />
    case STEPS.LIVE:  return <LiveStep />
    case STEPS.END:   return <EndStep />
    case STEPS.LIST:
    default:          return <SessionListStep />
  }
}

export default function TeacherClassroomTab() {
  return (
    <TeacherClassroomProvider>
      <div className="cr2-teacher" lang="de">
        <div className="test-wrapper">
          {/* Identischer App-Header wie alle anderen Tabs (Spielmodi/Kurs). */}
          <TabHeader />

          <nav className="test-raster" aria-label="Klassenraum">
            <span className="test-raster-label" aria-hidden="true">Klassenraum</span>
            <div className="test-raster-words">
              <span className="test-raster-word">Unterricht · Live-Session</span>
            </div>
            <div className="test-raster-end">
              <span className="test-raster-folio" aria-hidden="true">Lehrkraft</span>
            </div>
          </nav>

          <div className="test-rule--double" role="separator" aria-hidden="true" />

          <main className="cr2-teacher__main">
            <StepRouter />
          </main>
        </div>
      </div>
    </TeacherClassroomProvider>
  )
}
