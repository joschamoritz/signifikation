import { StudentJoinCard, StudentSubmissionsCard } from './ClassroomCards'
import { GAME_LABELS, sanitizeJoinCodeInput } from './classroomUtils'

export default function StudentClassroomEntries({
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
  submittedGames,
}) {
  return (
    <>
      <StudentJoinCard
        participantInfo={participantInfo}
        joinSession={joinSession}
        joining={joining}
        joinCodeInput={joinCodeInput}
        setJoinCodeInput={setJoinCodeInput}
        sanitizeJoinCodeInput={sanitizeJoinCodeInput}
        joinNotice={joinNotice}
        participantSession={participantSession}
        socketConnected={socketConnected}
        requestJoinRefresh={requestJoinRefresh}
        socketError={socketError}
        hostCountdown={hostCountdown}
        leaveSession={leaveSession}
      />

      <StudentSubmissionsCard
        participantInfo={participantInfo}
        participantSession={participantSession}
        submittedGames={submittedGames}
        gameLabels={GAME_LABELS}
      />
    </>
  )
}
