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
  getDashboard: vi.fn(),
  searchLemmata: vi.fn(),
}))

vi.mock('../hooks/useTeacherSocket', () => ({
  useTeacherSocket: () => ({ connected: false, error: null, socket: null }),
}))

import LobbyStep from '../steps/LobbyStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, startSession } from '../hooks/useTeacherSession'

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
      expect(screen.getByTestId('classroom-lobby')).toBeTruthy()
    })
  })

  it('Start-CTA ist disabled solange keine Teilnehmer da sind', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'lobby' },
      participants: [],
    })
    renderLobby()
    await waitFor(() => {
      const btn = screen.getByTestId('classroom-lobby-start')
      expect(btn.hasAttribute('disabled')).toBe(true)
    })
    expect(screen.getByText(/warte auf teilnehmer/i)).toBeTruthy()
  })

  it('Start erfordert 2-Tap-Bestätigung (kein versehentlicher Start)', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'lobby' },
      participants: [{ id: 'p1', displayName: 'Lena', connected: true, leftAt: null }],
    })
    startSession.mockResolvedValue({ status: 'running' })
    renderLobby()
    const btn = await screen.findByTestId('classroom-lobby-start')
    await waitFor(() => expect(btn.hasAttribute('disabled')).toBe(false))
    // Erster Tap → nur scharfschalten, noch kein Start
    fireEvent.click(btn)
    expect(startSession).not.toHaveBeenCalled()
    expect(screen.getByTestId('classroom-lobby-start').textContent).toMatch(/nochmal tippen/i)
    // Zweiter Tap → Start
    fireEvent.click(screen.getByTestId('classroom-lobby-start'))
    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1))
  })

  it('reicht den Spätbeitritt-Schalter an startSession durch', async () => {
    getDashboard.mockResolvedValue({
      session: { id: 's1', code: 'morgentau', status: 'lobby' },
      participants: [{ id: 'p1', displayName: 'Lena', connected: true, leftAt: null }],
    })
    startSession.mockResolvedValue({ status: 'running' })
    renderLobby()
    const toggle = await screen.findByTestId('classroom-lobby-latejoin')
    fireEvent.click(toggle) // Spätbeitritt AUS
    fireEvent.click(screen.getByTestId('classroom-lobby-start')) // arm
    fireEvent.click(screen.getByTestId('classroom-lobby-start')) // start
    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1))
    expect(startSession.mock.calls[0][1]).toEqual({ allowLateJoin: false })
  })
})
