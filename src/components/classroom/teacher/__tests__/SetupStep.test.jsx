// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../hooks/useTeacherSession', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  addAssignment: vi.fn(),
  addAssignments: vi.fn(),
  nextAssignment: vi.fn(),
  previewAssignment: vi.fn().mockResolvedValue({
    mode: 'kollokationen',
    lemmata: [{ id: 'x1', lemma: 'Probe', ipa: '', definition: 'd', prompt: { words: ['a', 'b'], definition: 'd' } }],
  }),
  removeAssignment: vi.fn(),
  startSession: vi.fn(),
  finishSession: vi.fn(),
  getDashboard: vi.fn(),
  searchLemmata: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getTodayLemmata: vi.fn().mockResolvedValue({ items: [] }),
  getTodayWortzwilling: vi.fn().mockResolvedValue({ pair: null }),
}))

import { useEffect } from 'react'
import { searchLemmata, createSession, addAssignments } from '../hooks/useTeacherSession'
import SetupStep from '../steps/SetupStep'
import { TeacherClassroomProvider, useTeacherClassroom } from '../TeacherClassroomContext'

function renderSetup() {
  return render(
    <TeacherClassroomProvider>
      <SetupStep />
    </TeacherClassroomProvider>,
  )
}

// Prepare-Modus: dispatcht GO_TO_SETUP mit intent='prepare' beim Mount, bevor
// SetupStep gerendert wird (prepare wird pro Render aus dem Draft berechnet).
function PrepareSetup() {
  const { dispatch } = useTeacherClassroom()
  useEffect(() => { dispatch({ type: 'GO_TO_SETUP', draft: { intent: 'prepare' } }) }, [dispatch])
  return <SetupStep />
}

// Hilfsfunktion: ersten Block vollstaendig ausfuellen (Modus + Lemma).
async function fillFirstBlock() {
  const block = screen.getByTestId('classroom-block-0')
  fireEvent.click(within(block).getByTestId('classroom-mode-kollokationen'))
  fireEvent.change(within(block).getByLabelText('Lemma-Suche'), { target: { value: 'Pro' } })
  fireEvent.click(await within(block).findByTestId('classroom-lemma-x1'))
}

describe('SetupStep (T-4.4 / W2-T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchLemmata.mockResolvedValue({
      items: [{ id: 'x1', lemma: 'Probe', pos: 'Subst.', ipa: '', definition: 'd' }],
      total: 1,
    })
  })
  afterEach(() => { cleanup() })

  it('rendert die Modi- und Details-Abschnitte mit genau einem Block', () => {
    renderSetup()
    expect(screen.getByText(/Modi & Wörter/i)).toBeTruthy()
    expect(screen.getByText(/II · Details/i)).toBeTruthy()
    expect(screen.getByTestId('classroom-block-0')).toBeTruthy()
    expect(screen.queryByTestId('classroom-block-1')).toBeNull()
  })

  it('CTA „Lobby öffnen“ ist disabled ohne vollständigen Block', () => {
    renderSetup()
    expect(screen.getByTestId('classroom-setup-submit').hasAttribute('disabled')).toBe(true)
  })

  it('Auswahl nur eines Modus reicht NICHT — CTA bleibt disabled', () => {
    renderSetup()
    fireEvent.click(within(screen.getByTestId('classroom-block-0')).getByTestId('classroom-mode-kollokationen'))
    expect(screen.getByTestId('classroom-setup-submit').hasAttribute('disabled')).toBe(true)
  })

  it('„Schüleransicht testen“ je Block ist disabled ohne vollständige Auswahl', () => {
    renderSetup()
    expect(screen.getByTestId('classroom-block-preview-0').hasAttribute('disabled')).toBe(true)
  })

  it('aktiviert CTA + Vorschau, sobald der Block vollständig ist', async () => {
    renderSetup()
    await fillFirstBlock()
    expect(screen.getByTestId('classroom-setup-submit').hasAttribute('disabled')).toBe(false)
    const previewBtn = screen.getByTestId('classroom-block-preview-0')
    expect(previewBtn.hasAttribute('disabled')).toBe(false)
    fireEvent.click(previewBtn)
    expect(await screen.findByTestId('classroom-setup-preview')).toBeTruthy()
  })

  it('W2-T2: fügt einen zweiten Modus-Block hinzu und entfernt ihn wieder', () => {
    renderSetup()
    fireEvent.click(screen.getByTestId('classroom-block-add'))
    expect(screen.getByTestId('classroom-block-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('classroom-block-remove-1'))
    expect(screen.queryByTestId('classroom-block-1')).toBeNull()
  })

  it('Vorbereiten-Modus: CTA „Für später vorbereiten“ statt „Lobby öffnen“', () => {
    render(<TeacherClassroomProvider><PrepareSetup /></TeacherClassroomProvider>)
    expect(screen.getByTestId('classroom-setup-submit').textContent).toMatch(/Für später vorbereiten/)
    expect(screen.queryByText(/Lobby öffnen/)).toBeNull()
  })

  it('W2-T2: legt bei „Lobby öffnen“ alle Blöcke per bulk an', async () => {
    createSession.mockResolvedValue({ id: 'sess-1', code: 'abc', status: 'lobby' })
    addAssignments.mockResolvedValue({ assignments: [{ id: 'a0' }, { id: 'a1' }] })
    renderSetup()

    await fillFirstBlock()
    // zweiten Block hinzufügen + ausfüllen
    fireEvent.click(screen.getByTestId('classroom-block-add'))
    const block1 = screen.getByTestId('classroom-block-1')
    fireEvent.click(within(block1).getByTestId('classroom-mode-wortzwilling'))
    // Wort-Zwilling nutzt den Paar-Picker (zwei Wörter statt Lemma-Suche)
    fireEvent.change(within(block1).getByTestId('classroom-wz-a'), { target: { value: 'Wasser' } })
    fireEvent.change(within(block1).getByTestId('classroom-wz-b'), { target: { value: 'Feuer' } })

    fireEvent.click(screen.getByTestId('classroom-setup-submit'))

    // createSession + bulk-addAssignments mit zwei Blöcken in Reihenfolge
    await vi.waitFor(() => expect(addAssignments).toHaveBeenCalled())
    const [, payload] = addAssignments.mock.calls[0]
    expect(payload.blocks).toHaveLength(2)
    expect(payload.blocks[0].mode).toBe('kollokationen')
    expect(payload.blocks[1].mode).toBe('wortzwilling')
  })
})
