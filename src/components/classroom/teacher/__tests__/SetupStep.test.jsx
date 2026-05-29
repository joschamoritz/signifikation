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
}))

import { searchLemmata, createSession, addAssignments } from '../hooks/useTeacherSession'
import SetupStep from '../steps/SetupStep'
import { TeacherClassroomProvider } from '../TeacherClassroomContext'

function renderSetup() {
  return render(
    <TeacherClassroomProvider>
      <SetupStep />
    </TeacherClassroomProvider>,
  )
}

// Hilfsfunktion: ersten Block vollstaendig ausfuellen (Modus + Lemma).
async function fillFirstBlock() {
  const block = screen.getByTestId('cr2-block-0')
  fireEvent.click(within(block).getByTestId('cr2-mode-kollokationen'))
  fireEvent.change(within(block).getByLabelText('Lemma-Suche'), { target: { value: 'Pro' } })
  fireEvent.click(await within(block).findByTestId('cr2-lemma-x1'))
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
    expect(screen.getByText(/A · Modi nacheinander/i)).toBeTruthy()
    expect(screen.getByText(/B · Details/i)).toBeTruthy()
    expect(screen.getByTestId('cr2-block-0')).toBeTruthy()
    expect(screen.queryByTestId('cr2-block-1')).toBeNull()
  })

  it('CTA „Lobby öffnen" ist disabled ohne vollständigen Block', () => {
    renderSetup()
    expect(screen.getByTestId('cr2-setup-submit').hasAttribute('disabled')).toBe(true)
  })

  it('Auswahl nur eines Modus reicht NICHT — CTA bleibt disabled', () => {
    renderSetup()
    fireEvent.click(within(screen.getByTestId('cr2-block-0')).getByTestId('cr2-mode-kollokationen'))
    expect(screen.getByTestId('cr2-setup-submit').hasAttribute('disabled')).toBe(true)
  })

  it('„Schüleransicht testen" je Block ist disabled ohne vollständige Auswahl', () => {
    renderSetup()
    expect(screen.getByTestId('cr2-block-preview-0').hasAttribute('disabled')).toBe(true)
  })

  it('aktiviert CTA + Vorschau, sobald der Block vollständig ist', async () => {
    renderSetup()
    await fillFirstBlock()
    expect(screen.getByTestId('cr2-setup-submit').hasAttribute('disabled')).toBe(false)
    const previewBtn = screen.getByTestId('cr2-block-preview-0')
    expect(previewBtn.hasAttribute('disabled')).toBe(false)
    fireEvent.click(previewBtn)
    expect(await screen.findByTestId('cr2-setup-preview')).toBeTruthy()
  })

  it('W2-T2: fügt einen zweiten Modus-Block hinzu und entfernt ihn wieder', () => {
    renderSetup()
    fireEvent.click(screen.getByTestId('cr2-block-add'))
    expect(screen.getByTestId('cr2-block-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cr2-block-remove-1'))
    expect(screen.queryByTestId('cr2-block-1')).toBeNull()
  })

  it('W2-T2: legt bei „Lobby öffnen" alle Blöcke per bulk an', async () => {
    createSession.mockResolvedValue({ id: 'sess-1', code: 'abc', status: 'lobby' })
    addAssignments.mockResolvedValue({ assignments: [{ id: 'a0' }, { id: 'a1' }] })
    renderSetup()

    await fillFirstBlock()
    // zweiten Block hinzufügen + ausfüllen
    fireEvent.click(screen.getByTestId('cr2-block-add'))
    const block1 = screen.getByTestId('cr2-block-1')
    fireEvent.click(within(block1).getByTestId('cr2-mode-wortzwilling'))
    fireEvent.change(within(block1).getByLabelText('Lemma-Suche'), { target: { value: 'Pro' } })
    fireEvent.click(await within(block1).findByTestId('cr2-lemma-x1'))

    fireEvent.click(screen.getByTestId('cr2-setup-submit'))

    // createSession + bulk-addAssignments mit zwei Blöcken in Reihenfolge
    await vi.waitFor(() => expect(addAssignments).toHaveBeenCalled())
    const [, payload] = addAssignments.mock.calls[0]
    expect(payload.blocks).toHaveLength(2)
    expect(payload.blocks[0].mode).toBe('kollokationen')
    expect(payload.blocks[1].mode).toBe('wortzwilling')
  })
})
