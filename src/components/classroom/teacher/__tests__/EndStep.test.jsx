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
  getSessionResults: vi.fn(),
  searchLemmata: vi.fn(),
}))

import EndStep from '../steps/EndStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, getSessionResults } from '../hooks/useTeacherSession'

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

describe('EndStep (W2-T4)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('rendert Lemma-Karten, auffälligste Fragen und beide CTA-Buttons', async () => {
    getSessionResults.mockResolvedValue({
      session: { id: 's1', status: 'finished', title: null, finishedAt: 1 },
      totals: { participants: 2, submissions: 3 },
      hasSubmissions: true,
      byLemma: [
        {
          assignmentId: 'a1', mode: 'kollokationen', position: 0,
          lemmaId: 'lemma-1', lemma: 'Wasser',
          participants: 2, submissions: 2, hitRatePct: 63, avgScore: 6.3, maxScore: 10,
          topDistractor: { label: 'weit', count: 2 },
        },
      ],
      trickiest: [
        { assignmentId: 'a1', mode: 'kollokationen', lemmaId: 'lemma-1', lemma: 'Wasser', hitRatePct: 63 },
      ],
    })
    getDashboard.mockResolvedValue({ participants: [{ id: 'p1', displayName: 'Alex' }] })

    renderEnd()
    await waitFor(() => {
      expect(screen.getByTestId('cr2-end-cards')).toBeTruthy()
    })
    // Kein „Neue Session"-Button mehr auf der Ergebnisseite (Wunsch: nur der
    // Zurück-Pfeil oben). Der Zurück-Button der Subscreen-Hülle bleibt.
    expect(screen.queryByTestId('cr2-end-new')).toBeNull()
    expect(screen.getByTestId('cr2-subscreen-back')).toBeTruthy()
    expect(screen.getByTestId('cr2-end-trickiest')).toBeTruthy()
    // Lemma-Headword + Distraktor sichtbar
    expect(screen.getAllByText('Wasser').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('weit')).toBeTruthy()
  })

  it('zeigt die Antwortverteilung pro Lemma (aufklappbar)', async () => {
    getSessionResults.mockResolvedValue({
      session: { id: 's1', status: 'finished', title: null, finishedAt: 1 },
      totals: { participants: 4, submissions: 4 },
      hasSubmissions: true,
      byLemma: [
        {
          assignmentId: 'a1', mode: 'kollokationen', position: 0,
          lemmaId: 'lemma-1', lemma: 'Wasser',
          participants: 4, submissions: 4, hitRatePct: 70, avgScore: 7, maxScore: 10,
          topDistractor: { label: 'weit', count: 3 },
          distribution: [
            { label: 'klar', rang: 1, correct: true, count: 4, pct: 100, kind: 'option' },
            { label: 'weit', rang: 8, correct: false, count: 3, pct: 75, kind: 'option' },
          ],
        },
      ],
      trickiest: [],
    })
    getDashboard.mockResolvedValue({ participants: [] })

    renderEnd()
    await waitFor(() => {
      expect(screen.getByTestId('cr2-end-dist')).toBeTruthy()
    })
    // Optionen + Anteile sind im DOM (auch wenn das <details> zugeklappt ist).
    // „klar" erscheint in der Lösungszeile UND in der Verteilung → getAllByText.
    expect(screen.getAllByText('klar').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('100 %')).toBeTruthy()
    expect(screen.getByText('75 %')).toBeTruthy()
  })

  it('zeigt einen Empty State, wenn keine Submissions vorliegen', async () => {
    getSessionResults.mockResolvedValue({
      session: { id: 's1', status: 'finished', title: null, finishedAt: 1 },
      totals: { participants: 0, submissions: 0 },
      hasSubmissions: false,
      byLemma: [],
      trickiest: [],
    })
    getDashboard.mockResolvedValue({ participants: [] })

    renderEnd()
    await waitFor(() => {
      expect(screen.getByTestId('cr2-end-empty')).toBeTruthy()
    })
    expect(screen.queryByTestId('cr2-end-cards')).toBeNull()
  })

  it('„Namen zeigen" ist standardmäßig off (kein Name sichtbar)', async () => {
    getSessionResults.mockResolvedValue({
      session: { id: 's1', status: 'finished', title: null, finishedAt: 1 },
      totals: { participants: 1, submissions: 1 },
      hasSubmissions: true,
      byLemma: [],
      trickiest: [],
    })
    getDashboard.mockResolvedValue({ participants: [{ id: 'p1', displayName: 'Alex' }] })

    renderEnd()
    await waitFor(() => {
      expect(screen.getByText(/Namen zeigen/i)).toBeTruthy()
    })
    expect(screen.queryByText('Alex')).toBeNull()
  })
})
