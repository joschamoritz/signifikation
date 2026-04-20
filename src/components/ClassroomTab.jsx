import { useMemo, useRef } from 'react'
import { API } from '../config'
import {
  WEEKDAYS, MONTHS,
  localDateStr, computeStreak,
} from '../utils/homeUtils'
import {
  ClassroomExplanationCard,
  TeacherSessionCard,
  StudentJoinCard,
  TeacherLiveCard,
  StudentSubmissionsCard,
  TeacherProtocolCard,
} from './classroom/ClassroomCards'
import {
  GAME_LABELS,
  ROUND_GAME_NAME,
  formatDateTime,
  formatElapsed,
  formatStagnation,
  mapSessionState,
  sanitizeJoinCodeInput,
} from './classroom/classroomUtils'
import ClassroomSnapNav from './classroom/ClassroomSnapNav'
import { useClassroomAccount } from './classroom/useClassroomAccount'
import { getClassroomRasterStatus } from './classroom/classroomViewModel'
import { useClassroomSnapNav } from './classroom/useClassroomSnapNav'
import { useTeacherClassroom } from './classroom/useTeacherClassroom'
import { useStudentClassroom } from './classroom/useStudentClassroom'

export default function ClassroomTab({ onLiveChange = () => {}, submitRef = null, onInSessionChange = () => {}, getRetroResultsRef = null }) {
  const streak = computeStreak()
  const today = new Date()
  const dateStr = localDateStr(today)
  const entriesRef = useRef(null)

  const { account, loadingAccount, teacherError, setTeacherError } = useClassroomAccount()
  const isTeacher = account?.role === 'teacher'

  const {
    sessions,
    activeSessionId,
    creating,
    createNotice,
    lastJoinCode,
    codeCopied,
    sessionNameInput,
    setSessionNameInput,
    timerTick,
    dashboard,
    exportsList,
    exportsError,
    requestingExport,
    activeSession,
    createSession,
    updateSessionState,
    requestExport,
    copyJoinCode,
  } = useTeacherClassroom({ isTeacher, setTeacherError })

  const {
    joinCodeInput,
    setJoinCodeInput,
    joinNotice,
    participantSession,
    participantInfo,
    joining,
    submittedGames,
    socketConnected,
    socketError,
    hostCountdown,
    joinSession,
    requestJoinRefresh,
    leaveSession,
  } = useStudentClassroom({
    sessions,
    loadingAccount,
    isTeacher,
    submitRef,
    getRetroResultsRef,
    onLiveChange,
    onInSessionChange,
    activeSession,
  })

  const { activeCard, scrollToCard, handleSnapKeyDown } = useClassroomSnapNav({
    entriesRef,
    isTeacher,
    loadingAccount,
  })

  const rasterStatus = useMemo(() => getClassroomRasterStatus({
    loadingAccount,
    isTeacher,
    activeSession,
    dashboard,
    participantSession,
    participantInfo,
    socketConnected,
    submittedGames,
  }), [loadingAccount, isTeacher, activeSession, dashboard, participantSession, participantInfo, socketConnected, submittedGames])

  return (
    <div className="tab-placeholder classroom-tab">
      <header className="test-title-section" role="banner">
        <p className="test-overline">Tägliches Wortspiel · Linguistik</p>
        <h1 className="test-title">Signifikation</h1>
        <p className="test-subtitle">
          <time dateTime={dateStr}>
            {`${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
          </time>
        </p>
        {streak > 0 && (
          <span className="test-title-streak" aria-label={`${streak} Tage Streak`}>
            🔥 {streak}
          </span>
        )}
      </header>

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

        <ul className="classroom-entries" ref={entriesRef} onKeyDown={handleSnapKeyDown}>
          <ClassroomExplanationCard />

          {isTeacher ? (
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
          ) : (
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
          )}

          {isTeacher ? (
            <TeacherLiveCard
              activeSession={activeSession}
              timerTick={timerTick}
              formatElapsed={formatElapsed}
              dashboard={dashboard}
              formatStagnation={formatStagnation}
              roundGameName={ROUND_GAME_NAME}
              gameLabels={GAME_LABELS}
            />
          ) : (
            <StudentSubmissionsCard
              participantInfo={participantInfo}
              participantSession={participantSession}
              submittedGames={submittedGames}
              gameLabels={GAME_LABELS}
            />
          )}

          {isTeacher && (
            <TeacherProtocolCard
              activeSession={activeSession}
              dashboard={dashboard}
              requestingExport={requestingExport}
              requestExport={requestExport}
              exportsError={exportsError}
              exportsList={exportsList}
              formatDateTime={formatDateTime}
              activeSessionId={activeSessionId}
              api={API}
            />
          )}
        </ul>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Für Unterrichtssitzungen und Lerngruppen.</span>
        </div>
      </div>

      <ClassroomSnapNav isTeacher={isTeacher} activeCard={activeCard} onSelect={scrollToCard} />
    </div>
  )
}
