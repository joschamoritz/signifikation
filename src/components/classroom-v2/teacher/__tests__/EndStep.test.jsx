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
  getDashboard: vi.fn(),
  searchLemmata: vi.fn(),
}))

import EndStep from '../steps/EndStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard } from '../hooks/useTeacherSession'

function WithSession({ children }) {
  const { state, dispatch } = useTeacherClassroom()
  useEffect(() => {
    if (state.currentStep !== 'end') {
      dispatch({ type: 'RESUME_SESSION', sessionId: 's1', step: 'end' })
    }
  }, [dispatch, state.currentStep])
  return state.currentStep === 'end' ? children : null
}

function renderEnd() {
  return render(
    <TeacherClassroomProvider>
      <WithSession>
        <EndStep />
      </WithSession>
    </TeacherClassroomProvider>,
  )
}

describe('EndStep (T-4.7)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('rendert die Aggregat-Übersicht und beide CTA-Buttons', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', status: 'finished' },
      assignment: { mode: 'kollokationen' },
      participants: [{ id: 'p1', displayName: 'Alex' }],
      aggregate: {
        totalParticipants: 1,
        connectedCount: 0,
        submittedTotal: 2,
        perLemma: [
          { lemmaId: 'lemma-1', submitted: 1, correctPct: 60 },
          { lemmaId: 'lemma-2', submitted: 1, correctPct: 20 },
        ],
      },
    })
    renderEnd()
    await waitFor(() => {
      expect(screen.getByTestId('cr2-end-new')).toBeTruthy()
    })
    expect(screen.getByTestId('cr2-end-close')).toBeTruthy()
    expect(screen.getByText(/auffälligster distraktor/i)).toBeTruthy()
  })

  it('„Namen zeigen" ist standardmäßig off (kein Name sichtbar)', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', status: 'finished' },
      participants: [{ id: 'p1', displayName: 'Alex' }],
      aggregate: { totalParticipants: 1, connectedCount: 0, submittedTotal: 0, perLemma: [] },
    })
    renderEnd()
    await waitFor(() => {
      expect(screen.getByTestId('cr2-end-new')).toBeTruthy()
    })
    expect(screen.queryByText('Alex')).toBeNull()
  })
})
