import ClassroomHeader from './classroom/ClassroomHeader'
import ClassroomEntries from './classroom/ClassroomEntries'
import ClassroomSnapNav from './classroom/ClassroomSnapNav'
import { useClassroomTabState } from './classroom/useClassroomTabState'

export default function ClassroomTab({ onLiveChange = () => {}, submitRef = null, onInSessionChange = () => {}, getRetroResultsRef = null }) {
  const {
    entriesRef,
    isTeacher,
    loadingAccount,
    teacherError,
    rasterStatus,
    api,
    teacherState,
    studentState,
    snapNav,
  } = useClassroomTabState({
    onLiveChange,
    submitRef,
    onInSessionChange,
    getRetroResultsRef,
  })

  return (
    <div className="tab-placeholder classroom-tab">
      <ClassroomHeader />

      <nav className="cr-raster" aria-label="Klassenraum-Übersicht">
        <div className="cr-raster-content">
          <span className="cr-raster-label" aria-hidden="true">Klassenraum</span>
          <span
            className={`cr-raster-center${rasterStatus.isRunning ? ' cr-raster-center--running' : ''}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {rasterStatus.center}
          </span>
          <span className="cr-raster-right">{rasterStatus.right}</span>
        </div>
      </nav>

      <div className="tab-placeholder-inner classroom-inner">
        {loadingAccount && <p className="cr-loading">Konto wird geladen …</p>}
        {!loadingAccount && teacherError && <p className="cr-error">{teacherError}</p>}

        <ClassroomEntries
          entriesRef={entriesRef}
          handleSnapKeyDown={snapNav.handleSnapKeyDown}
          isTeacher={isTeacher}
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
          timerTick={teacherState.timerTick}
          dashboard={teacherState.dashboard}
          submittedGames={studentState.submittedGames}
          requestingExport={teacherState.requestingExport}
          requestExport={teacherState.requestExport}
          exportsError={teacherState.exportsError}
          exportsList={teacherState.exportsList}
          activeSessionId={teacherState.activeSessionId}
          api={api}
        />

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Für Unterrichtssitzungen und Lerngruppen.</span>
        </div>
      </div>

      <ClassroomSnapNav isTeacher={isTeacher} activeCard={snapNav.activeCard} onSelect={snapNav.scrollToCard} />
    </div>
  )
}
