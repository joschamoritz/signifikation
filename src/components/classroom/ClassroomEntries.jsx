import { ClassroomExplanationCard } from './ClassroomCards'
import TeacherClassroomEntries from './TeacherClassroomEntries'
import StudentClassroomEntries from './StudentClassroomEntries'

export default function ClassroomEntries({
  entriesRef,
  handleSnapKeyDown,
  isTeacher,
  teacherState,
  studentState,
  api,
}) {
  return (
    <ul className="classroom-entries" ref={entriesRef} onKeyDown={handleSnapKeyDown}>
      <ClassroomExplanationCard />

      {isTeacher ? (
        <TeacherClassroomEntries
          sessionNameInput={teacherState.sessionNameInput}
          setSessionNameInput={teacherState.setSessionNameInput}
          createSession={teacherState.createSession}
          creating={teacherState.creating}
          createNotice={teacherState.createNotice}
          lastJoinCode={teacherState.lastJoinCode}
          codeCopied={teacherState.codeCopied}
          copyJoinCode={teacherState.copyJoinCode}
          activeSession={teacherState.activeSession}
          updateSessionState={teacherState.updateSessionState}
          pendingFinish={teacherState.pendingFinish}
          confirmFinish={teacherState.confirmFinish}
          cancelFinish={teacherState.cancelFinish}
          timerTick={teacherState.timerTick}
          dashboard={teacherState.dashboard}
          requestingExport={teacherState.requestingExport}
          requestExport={teacherState.requestExport}
          exportsError={teacherState.exportsError}
          exportsList={teacherState.exportsList}
          activeSessionId={teacherState.activeSessionId}
          api={api}
        />
      ) : (
        <StudentClassroomEntries
          participantInfo={studentState.participantInfo}
          joinSession={studentState.joinSession}
          joining={studentState.joining}
          joinCodeInput={studentState.joinCodeInput}
          setJoinCodeInput={studentState.setJoinCodeInput}
          joinNotice={studentState.joinNotice}
          participantSession={studentState.participantSession}
          socketConnected={studentState.socketConnected}
          requestJoinRefresh={studentState.requestJoinRefresh}
          socketError={studentState.socketError}
          hostCountdown={studentState.hostCountdown}
          leaveSession={studentState.leaveSession}
          submittedGames={studentState.submittedGames}
        />
      )}
    </ul>
  )
}
