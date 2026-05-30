// Root des Lehrer-Tabs „Klassenraum".
//
// Mountet den Reducer-Context und rendert den Step, der gerade aktiv ist.
// Wörterbuch-Stil: Container limitiert auf 680px (Setup/Lobby).

import { TeacherClassroomProvider, useTeacherClassroom, STEPS } from './TeacherClassroomContext'
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
      <div className="cr2-teacher">
        <header className="cr2-teacher__masthead" role="banner">
          <p className="cr2-teacher__overline">Unterricht · Live-Session</p>
          <h1 className="cr2-teacher__title">Klassenraum</h1>
        </header>
        <main className="cr2-teacher__main">
          <StepRouter />
        </main>
      </div>
    </TeacherClassroomProvider>
  )
}
