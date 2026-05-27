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

vi.mock('../hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => ({ connected: false, error: null, socket: null }),
}))

import LobbyStep from '../steps/LobbyStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard } from '../hooks/useTeacherSession'

function WithSession({ children }) {
  const { state, dispatch } = useTeacherClassroom()
  useEffect(() => {
    if (state.currentStep !== 'lobby') {
      dispatch({ type: 'RESUME_SESSION', sessionId: 's1', step: 'lobby' })
    }
  }, [dispatch, state.currentStep])
  return state.currentStep === 'lobby' ? children : null
}

function renderLobby() {
  return render(
    <TeacherClassroomProvider>
      <WithSession>
        <LobbyStep />
      </WithSession>
    </TeacherClassroomProvider>,
  )
}

describe('LobbyStep (T-4.5)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('rendert ohne Crash, sobald die Lobby-Session aktiv ist', async () => {
    getDashboard.mockReturnValue(new Promise(() => {})) // pending
    renderLobby()
    await waitFor(() => {
      expect(screen.getByTestId('cr2-lobby')).toBeTruthy()
    })
  })

  it('Start-CTA ist disabled solange keine Teilnehmer da sind', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'lobby' },
      participants: [],
    })
    renderLobby()
    await waitFor(() => {
      const btn = screen.getByTestId('cr2-lobby-start')
      expect(btn.hasAttribute('disabled')).toBe(true)
    })
    expect(screen.getByText(/warte auf teilnehmer/i)).toBeTruthy()
  })
})
