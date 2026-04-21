import { useMemo, useRef } from 'react'
import { API } from '../../config'
import { getClassroomRasterStatus } from './classroomViewModel'
import { useClassroomAccount } from './useClassroomAccount'
import { useClassroomSnapNav } from './useClassroomSnapNav'
import { useStudentClassroom } from './useStudentClassroom'
import { useTeacherClassroom } from './useTeacherClassroom'

export function useClassroomTabState({
  onLiveChange,
  submitRef,
  onInSessionChange,
  getRetroResultsRef,
}) {
  const entriesRef = useRef(null)

  const { account, loadingAccount, teacherError, setTeacherError } = useClassroomAccount()
  const isTeacher = account?.role === 'teacher'

  const teacherState = useTeacherClassroom({ isTeacher, setTeacherError })

  const studentState = useStudentClassroom({
    sessions: teacherState.sessions,
    loadingAccount,
    isTeacher,
    submitRef,
    getRetroResultsRef,
    onLiveChange,
    onInSessionChange,
    activeSession: teacherState.activeSession,
  })

  const snapNav = useClassroomSnapNav({
    entriesRef,
    isTeacher,
    loadingAccount,
  })

  const rasterStatus = useMemo(() => getClassroomRasterStatus({
    loadingAccount,
    isTeacher,
    activeSession: teacherState.activeSession,
    dashboard: teacherState.dashboard,
    participantSession: studentState.participantSession,
    participantInfo: studentState.participantInfo,
    socketConnected: studentState.socketConnected,
    submittedGames: studentState.submittedGames,
  }), [
    isTeacher,
    loadingAccount,
    studentState.participantInfo,
    studentState.participantSession,
    studentState.socketConnected,
    studentState.submittedGames,
    teacherState.activeSession,
    teacherState.dashboard,
  ])

  return {
    entriesRef,
    isTeacher,
    loadingAccount,
    teacherError,
    rasterStatus,
    api: API,
    teacherState,
    studentState,
    snapNav,
  }
}
