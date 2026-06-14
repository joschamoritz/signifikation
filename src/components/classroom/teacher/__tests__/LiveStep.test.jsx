// @vitest-environment happy-dom
import { useEffect } from 'react'
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../hooks/useTeacherSession', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  addAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  startSession: vi.fn(),
  finishSession: vi.fn(),
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  nextAssignment: vi.fn(),
  getDashboard: vi.fn(),
  searchLemmata: vi.fn(),
}))
vi.mock('../hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => ({ connected: false, error: null, socket: null }),
}))

import LiveStep from '../steps/LiveStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, nextAssignment } from '../hooks/useTeacherSession'

function WithSession({ children }) {
  const { state, dispatch } = useTeacherClassroom()
  useEffect(() => {
    if (state.currentStep !== 'live') {
      dispatch({ type: 'RESUME_SESSION', sessionId: 's1', step: 'live' })
    }
  }, [dispatch, state.currentStep])
  return state.currentStep === 'live' ? children : null
}

function renderLive() {
  return render(
    <TeacherClassroomProvider>
      <WithSession>
        <LiveStep />
      </WithSession>
    </TeacherClassroomProvider>,
  )
}

describe('LiveStep (T-4.6)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('rendert Fortschrittsbalken und „Auflösung freigeben"-CTA', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'running' },
      assignment: { id: 'a1', mode: 'kollokationen', contentSnapshot: { lemmata: [] }, lemmaIds: ['l1'] },
      participants: [],
      aggregate: { totalParticipants: 0, connectedCount: 0, submittedTotal: 0, perLemma: [] },
    })
    renderLive()
    await waitFor(() => {
      expect(screen.getByTestId('classroom-live-finish')).toBeTruthy()
    })
    expect(screen.getByText(/fertig/i)).toBeTruthy()
  })

  it('W2-T2: zeigt „Modus X von N" und „Nächster Modus" bei mehreren Blöcken', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'running' },
      assignment: { id: 'a1', mode: 'kollokationen', contentSnapshot: { lemmata: [] }, lemmaIds: ['l1'] },
      assignmentIndex: 0,
      assignmentTotal: 3,
      participants: [],
      aggregate: { totalParticipants: 0, connectedCount: 0, submittedTotal: 0, perLemma: [] },
    })
    nextAssignment.mockResolvedValue({ status: 'running', done: false, index: 1, total: 3 })
    renderLive()
    await waitFor(() => {
      expect(screen.getByTestId('classroom-live-next')).toBeTruthy()
    })
    expect(screen.getByTestId('classroom-live-step').textContent).toMatch(/Modus 1 von 3/)
    // beim letzten Block (kein hasNext) gäbe es stattdessen den Finish-Button
    expect(screen.queryByTestId('classroom-live-finish')).toBeNull()
  })

  it('zeigt „N offline" wenn Teilnehmer abwesend sind', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'running' },
      assignment: { id: 'a1', mode: 'kollokationen', contentSnapshot: { lemmata: [] }, lemmaIds: ['l1'] },
      participants: [
        { id: 'p1', displayName: 'Lena', connected: false, done: false, leftAt: null },
        { id: 'p2', displayName: 'Max', connected: true, done: false, leftAt: null },
      ],
      aggregate: { perLemma: [] },
    })
    renderLive()
    await waitFor(() => expect(screen.getByTestId('classroom-live-away')).toBeTruthy())
    expect(screen.getByTestId('classroom-live-away').textContent).toMatch(/1 offline/)
  })

  it('Back-Pfeil öffnet das „Sitzung verlassen"-Sheet statt still zu navigieren', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'running' },
      assignment: { id: 'a1', mode: 'kollokationen', contentSnapshot: { lemmata: [] }, lemmaIds: ['l1'] },
      participants: [],
      aggregate: { perLemma: [] },
    })
    renderLive()
    await waitFor(() => expect(screen.getByTestId('classroom-subscreen-back')).toBeTruthy())
    // Sheet zunächst geschlossen (rendert null)
    expect(screen.queryByTestId('classroom-live-leave-finish')).toBeNull()
    fireEvent.click(screen.getByTestId('classroom-subscreen-back'))
    await waitFor(() => expect(screen.getByTestId('classroom-live-leave-finish')).toBeTruthy())
    expect(screen.getByTestId('classroom-live-leave-background')).toBeTruthy()
  })
})
