// @vitest-environment happy-dom
import { useEffect } from 'react'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
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
  getDashboard: vi.fn(),
  searchLemmata: vi.fn(),
}))
vi.mock('../hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => ({ connected: false, error: null, socket: null }),
}))

import LiveStep from '../steps/LiveStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard } from '../hooks/useTeacherSession'

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
      expect(screen.getByTestId('cr2-live-finish')).toBeTruthy()
    })
    expect(screen.getByText(/abgegeben/i)).toBeTruthy()
  })
})
