import { ClassroomExplanationCard } from './ClassroomCards'
import TeacherClassroomEntries from './TeacherClassroomEntries'
import StudentClassroomEntries from './StudentClassroomEntries'

export default function ClassroomEntries({
  entriesRef,
  handleSnapKeyDown,
  isTeacher,
  sessionNameInput,
  setSessionNameInput,
  createSession,
  creating,
  createNotice,
  lastJoinCode,
  codeCopied,
  copyJoinCode,
  activeSession,
  updateSessionState,
  participantInfo,
  joinSession,
  joining,
  joinCodeInput,
  setJoinCodeInput,
  joinNotice,
  participantSession,
  socketConnected,
  requestJoinRefresh,
  socketError,
  hostCountdown,
  leaveSession,
  timerTick,
  dashboard,
  submittedGames,
  requestingExport,
  requestExport,
  exportsError,
  exportsList,
  activeSessionId,
  api,
}) {
  return (
    <ul className="classroom-entries" ref={entriesRef} onKeyDown={handleSnapKeyDown}>
      <ClassroomExplanationCard />

      {isTeacher ? (
        <TeacherClassroomEntries
          sessionNameInput={sessionNameInput}
          setSessionNameInput={setSessionNameInput}
          createSession={createSession}
          creating={creating}
          createNotice={createNotice}
          lastJoinCode={lastJoinCode}
          codeCopied={codeCopied}
          copyJoinCode={copyJoinCode}
          activeSession={activeSession}
          updateSessionState={updateSessionState}
          timerTick={timerTick}
          dashboard={dashboard}
          requestingExport={requestingExport}
          requestExport={requestExport}
          exportsError={exportsError}
          exportsList={exportsList}
          activeSessionId={activeSessionId}
          api={api}
        />
      ) : (
        <StudentClassroomEntries
          participantInfo={participantInfo}
          joinSession={joinSession}
          joining={joining}
          joinCodeInput={joinCodeInput}
          setJoinCodeInput={setJoinCodeInput}
          joinNotice={joinNotice}
          participantSession={participantSession}
          socketConnected={socketConnected}
          requestJoinRefresh={requestJoinRefresh}
          socketError={socketError}
          hostCountdown={hostCountdown}
          leaveSession={leaveSession}
          submittedGames={submittedGames}
        />
      )}
    </ul>
  )
}
