// Root des Lehrer-Tabs „Klassenraum".
//
// Mountet den Reducer-Context und rendert den Step, der gerade aktiv ist.
// Wörterbuch-Stil: Container limitiert auf 680px (Setup/Lobby).

import { TeacherClassroomProvider, useTeacherClassroom, STEPS } from './TeacherClassroomContext'
import TabHeader          from '../../TabHeader'
import ClassroomIndexStep from './steps/ClassroomIndexStep'
import HowToStep       from './steps/HowToStep'
import JoinStep        from './steps/JoinStep'
import SessionListStep from './steps/SessionListStep'
import SetupStep       from './steps/SetupStep'
import LobbyStep       from './steps/LobbyStep'
import LiveStep        from './steps/LiveStep'
import EndStep         from './steps/EndStep'
import './TeacherClassroomTab.css'

// Unterseiten, die als Vollbild-Takeover rendern (eigener Zurück-Pfeil +
// zentrierter Titel, wie ein Modus-Klick auf der Spielmodi-Seite) — OHNE den
// großen App-Header. Der Rest läuft (noch) in der Landing-Shell.
const TAKEOVER = new Set([STEPS.HOWTO, STEPS.JOIN, STEPS.LIST, STEPS.SETUP, STEPS.LOBBY, STEPS.LIVE, STEPS.END])

function StepRouter() {
  const { state } = useTeacherClassroom()
  switch (state.currentStep) {
    case STEPS.HOWTO: return <HowToStep />
    case STEPS.JOIN:  return <JoinStep />
    case STEPS.LIST:  return <SessionListStep />
    case STEPS.SETUP: return <SetupStep />
    case STEPS.LOBBY: return <LobbyStep />
    case STEPS.LIVE:  return <LiveStep />
    case STEPS.END:   return <EndStep />
    case STEPS.INDEX:
    default:          return <ClassroomIndexStep />
  }
}

function TeacherClassroomBody() {
  const { state } = useTeacherClassroom()

  // Takeover-Unterseiten bringen ihre eigene Kopfzeile (Zurück + Titel) mit.
  if (TAKEOVER.has(state.currentStep)) {
    return (
      <div className="cr2-teacher" lang="de">
        <StepRouter />
      </div>
    )
  }

  // Landing-Shell mit geteiltem App-Header (Index + noch nicht umgebaute Steps).
  return (
    <div className="cr2-teacher cr2-teacher--landing" lang="de">
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
  )
}

export default function TeacherClassroomTab() {
  return (
    <TeacherClassroomProvider>
      <TeacherClassroomBody />
    </TeacherClassroomProvider>
  )
}
