// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../hooks/useTeacherSession', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  addAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  startSession: vi.fn(),
  finishSession: vi.fn(),
  getDashboard: vi.fn(),
  searchLemmata: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}))

import SetupStep from '../steps/SetupStep'
import { TeacherClassroomProvider } from '../TeacherClassroomContext'

function renderSetup() {
  return render(
    <TeacherClassroomProvider>
      <SetupStep />
    </TeacherClassroomProvider>,
  )
}

describe('SetupStep (T-4.4)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('rendert die drei Stepper-Abschnitte', () => {
    renderSetup()
    expect(screen.getByText(/A · Spielmodus/i)).toBeTruthy()
    expect(screen.getByText(/B · Lemmata/i)).toBeTruthy()
    expect(screen.getByText(/C · Details/i)).toBeTruthy()
  })

  it('CTA „Lobby öffnen" ist disabled wenn weder Modus noch Lemma gewählt sind', () => {
    renderSetup()
    const btn = screen.getByTestId('cr2-setup-submit')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('Auswahl eines Modus allein reicht NICHT (Lemmata fehlen) — CTA bleibt disabled', () => {
    renderSetup()
    fireEvent.click(screen.getByTestId('cr2-mode-kollokationen'))
    expect(screen.getByTestId('cr2-setup-submit').hasAttribute('disabled')).toBe(true)
  })
})
