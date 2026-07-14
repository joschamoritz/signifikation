// @vitest-environment happy-dom
//
// Backlog 2026-07-14: „Beitreten" im Lehrer-Index brauchte bisher einen
// Extra-Klick zur separaten Beitritts-Seite (/c). Jetzt sitzt das Code-Formular
// (JoinCodeForm, geteilt mit StudentJoinEntry) direkt in der Karte.
import { render, screen, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../hooks/useTeacherSession', () => ({
  listSessions: vi.fn(),
}))

import ClassroomIndexStep from '../steps/ClassroomIndexStep'
import { TeacherClassroomProvider } from '../TeacherClassroomContext'
import { listSessions } from '../hooks/useTeacherSession'

function renderInProvider() {
  return render(
    <TeacherClassroomProvider>
      <ClassroomIndexStep />
    </TeacherClassroomProvider>,
  )
}

describe('ClassroomIndexStep — Beitreten-Karte (T-Backlog 2026-07-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSessions.mockResolvedValue({ sessions: [] })
  })
  afterEach(() => { cleanup() })

  it('zeigt das Code-Eingabeformular direkt in der Karte statt eines Links zur Beitritts-Seite', () => {
    renderInProvider()
    expect(screen.getByTestId('classroom-kiosk-code-input')).toBeTruthy()
    expect(screen.getByTestId('classroom-kiosk-code-submit')).toBeTruthy()
    expect(screen.getByTestId('classroom-kiosk-scan-btn')).toBeTruthy()
    expect(screen.queryByText(/zur beitritts-seite/i)).toBeNull()
  })

  it('Beitreten-Button ist deaktiviert, solange der Code zu kurz ist', () => {
    renderInProvider()
    expect(screen.getByTestId('classroom-kiosk-code-submit').disabled).toBe(true)
  })
})
