// @vitest-environment happy-dom
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// useTeacherSession ist die einzige Aussenkante, die wir mocken.
// useSessionsList ruft listSessions intern auf — wir mocken den Export.
// useQuickStartSession ruft getTodayLemmata/createSession/addAssignments auf.
vi.mock('../hooks/useTeacherSession', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  addAssignment: vi.fn(),
  addAssignments: vi.fn(),
  removeAssignment: vi.fn(),
  startSession: vi.fn(),
  finishSession: vi.fn(),
  getDashboard: vi.fn(),
  searchLemmata: vi.fn(),
  deleteSession: vi.fn(),
  duplicateSession: vi.fn(),
  getTodayLemmata: vi.fn(() => Promise.resolve({ items: [] })),
}))

import SessionListStep from '../steps/SessionListStep'
import { TeacherClassroomProvider } from '../TeacherClassroomContext'
import { listSessions, getTodayLemmata, createSession, addAssignments } from '../hooks/useTeacherSession'

function renderInProvider() {
  return render(
    <TeacherClassroomProvider>
      <SessionListStep />
    </TeacherClassroomProvider>,
  )
}

describe('SessionListStep (T-4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => { cleanup() })

  it('rendert ohne Crash und zeigt Loading-Indikator', () => {
    listSessions.mockReturnValue(new Promise(() => {})) // pending
    renderInProvider()
    expect(screen.getByText(/sitzungen werden geladen/i)).toBeTruthy()
  })

  it('zeigt Empty-State wenn keine Sessions vorhanden', async () => {
    listSessions.mockResolvedValue({ sessions: [] })
    renderInProvider()
    await waitFor(() => {
      expect(screen.getByText(/noch keine sitzungen/i)).toBeTruthy()
    })
    // Ornament statt Einzelbuchstaben-Drop-Cap
    expect(document.querySelector('.classroom-empty__ornament')).toBeTruthy()
  })

  it('rendert eine Session-Karte und den Floating-CTA „+ Neue Session“', async () => {
    listSessions.mockResolvedValue({
      sessions: [{
        id: 's1',
        code: 'morgentau',
        title: 'Klasse A',
        status: 'lobby',
        settings: { mode: 'kollokationen' },
        createdAt: Date.now(),
      }],
    })
    renderInProvider()
    await waitFor(() => {
      expect(screen.getByText('Klasse A')).toBeTruthy()
    })
    expect(screen.getByTestId('classroom-new-session')).toBeTruthy()
  })

  it('First-Run: Schnellstart erscheint bei Tageswörtern und legt damit eine Sitzung an', async () => {
    listSessions.mockResolvedValue({ sessions: [] })
    getTodayLemmata.mockResolvedValue({ items: [{ id: 'l1', lemma: 'Debatte' }] })
    createSession.mockResolvedValue({ id: 'new1', code: 'abc', status: 'lobby' })
    addAssignments.mockResolvedValue({ assignments: [{ id: 'a1' }] })
    renderInProvider()
    const btn = await screen.findByTestId('classroom-quickstart')
    fireEvent.click(btn)
    await waitFor(() => expect(createSession).toHaveBeenCalled())
    expect(addAssignments).toHaveBeenCalledWith('new1', {
      blocks: [{ mode: 'kollokationen', lemmaIds: ['l1'] }],
    })
  })

  it('First-Run: kein Schnellstart ohne Tageswörter', async () => {
    listSessions.mockResolvedValue({ sessions: [] })
    getTodayLemmata.mockResolvedValue({ items: [] })
    renderInProvider()
    await waitFor(() => expect(screen.getByText(/noch keine sitzungen/i)).toBeTruthy())
    expect(screen.queryByTestId('classroom-quickstart')).toBeNull()
  })
})
