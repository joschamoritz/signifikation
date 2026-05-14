import { TeacherSessionCard, TeacherLiveCard, TeacherProtocolCard } from './ClassroomCards'
import { GAME_LABELS, ROUND_GAME_NAME, formatDateTime, formatElapsed, formatStagnation, mapSessionState } from './classroomUtils'
import Sheet from '../ui/Sheet'

export default function TeacherClassroomEntries({
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
  pendingFinish,
  confirmFinish,
  cancelFinish,
  timerTick,
  dashboard,
  requestingExport,
  requestExport,
  exportsError,
  exportsList,
  activeSessionId,
  api,
}) {
  return (
    <>
      <Sheet
        open={pendingFinish}
        onClose={cancelFinish}
        variant="center"
        dismissible={false}
        aria-label="Session beenden bestätigen"
      >
        <Sheet.Body>
          <p className="classroom-confirm-text">Keine Teilnehmenden verbunden. Trotzdem beenden?</p>
        </Sheet.Body>
        <Sheet.Footer>
          <button className="btn-ghost" type="button" onClick={confirmFinish}>Ja, beenden</button>
          <button className="btn-ghost" type="button" onClick={cancelFinish}>Abbrechen</button>
        </Sheet.Footer>
      </Sheet>
      <TeacherSessionCard
        sessionNameInput={sessionNameInput}
        setSessionNameInput={setSessionNameInput}
        createSession={createSession}
        creating={creating}
        createNotice={createNotice}
        lastJoinCode={lastJoinCode}
        codeCopied={codeCopied}
        onCopyJoinCode={copyJoinCode}
        activeSession={activeSession}
        mapSessionState={mapSessionState}
        formatDateTime={formatDateTime}
        updateSessionState={updateSessionState}
      />

      <TeacherLiveCard
        activeSession={activeSession}
        timerTick={timerTick}
        formatElapsed={formatElapsed}
        dashboard={dashboard}
        formatStagnation={formatStagnation}
        roundGameName={ROUND_GAME_NAME}
        gameLabels={GAME_LABELS}
      />

      <TeacherProtocolCard
        activeSession={activeSession}
        dashboard={dashboard}
        requestingExport={requestingExport}
        requestExport={requestExport}
        exportsError={exportsError}
        exportsList={exportsList}
        formatDateTime={formatDateTime}
        activeSessionId={activeSessionId}
        api={api}
      />
    </>
  )
}
