// @vitest-environment happy-dom
//
// Smoke + Submit-Flow fuer den ClassroomGameWrapper.
// Wir geben einen `onSubmitOverride` rein, der den HTTP-Call ersetzt —
// dadurch koennen wir den SUBMITTED-Dispatch in den Context pruefen.

import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'

vi.mock('../kioskFetch', () => ({
  joinSession:   vi.fn(),
  fetchView:     vi.fn(),
  submitAnswer:  vi.fn(),
  sendHeartbeat: vi.fn(),
  leaveSession:  vi.fn(),
  KioskApiError: class KioskApiError extends Error {},
}))

import {
  StudentKioskProvider,
  useStudentKiosk,
  KIOSK_STATES,
  initialState,
} from '../StudentKioskContext'
import ClassroomGameWrapper from '../components/ClassroomGameWrapper'

function ContextProbe({ onState }) {
  const { state } = useStudentKiosk()
  // Effekt nicht noetig — Probe wird in jedem Render aufgerufen, das reicht.
  onState(state)
  return null
}

function renderWith(stateOverride, props = {}) {
  let lastState = null
  const utils = render(
    <StudentKioskProvider initialOverride={stateOverride}>
      <ClassroomGameWrapper {...props} />
      <ContextProbe onState={(s) => { lastState = s }} />
    </StudentKioskProvider>,
  )
  return { ...utils, getState: () => lastState }
}

describe('ClassroomGameWrapper (T-5.5)', () => {
  afterEach(() => cleanup())

  it('rendert Kollokationen-Spiel mit 3 Wörtern und disabled Submit ohne Pick', () => {
    const s = {
      ...initialState('morgentau'),
      currentState:  KIOSK_STATES.PLAYING,
      token:         'tok-1',
      assignment:    { id: 'a1', mode: 'kollokationen', lemmaCount: 1 },
      currentLemma:  {
        id: 'l1',
        lemma: 'Lärm',
        ipa: 'lɛʁm',
        prompt: { words: ['ohrenbetäubend', 'höllisch', 'leise'], definition: 'unangenehmer Schall' },
      },
    }
    renderWith(s)
    expect(screen.getByTestId('classroom-kiosk-game-kollokationen')).toBeTruthy()
    // Echte Quiz-Engine: Optionen als .option-Buttons (Wort als Text), Abgabe
    // erst bei 3 Auswahlen aktiv.
    expect(screen.getByText('ohrenbetäubend')).toBeTruthy()
    const submit = screen.getByRole('button', { name: 'Abgeben' })
    expect(submit.disabled).toBe(true)
  })

  it('beim Klick auf Submit nach Pick wird onSubmitOverride mit rawAnswer aufgerufen', async () => {
    const fakeSubmit = vi.fn().mockResolvedValue({ score: 5, maxScore: 10, correct: 1 })
    const s = {
      ...initialState('morgentau'),
      currentState:  KIOSK_STATES.PLAYING,
      token:         'tok-1',
      assignment:    { id: 'a1', mode: 'kollokationen', lemmaCount: 1 },
      currentLemma:  {
        id: 'l1',
        lemma: 'Lärm',
        ipa: '',
        prompt: { words: ['ohrenbetäubend', 'leise', 'höllisch'], definition: '' },
      },
    }
    const { getState } = renderWith(s, { onSubmitOverride: fakeSubmit })

    // Echte Quiz-Engine: Abgabe erst bei genau 3 Auswahlen aktiv.
    for (const w of ['ohrenbetäubend', 'leise', 'höllisch']) {
      await act(async () => { fireEvent.click(screen.getByText(w)) })
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abgeben' }))
    })

    await waitFor(() => {
      expect(fakeSubmit).toHaveBeenCalledTimes(1)
    })

    const [token, payload] = fakeSubmit.mock.calls[0]
    expect(token).toBe('tok-1')
    expect(payload.assignmentId).toBe('a1')
    expect(payload.lemmaId).toBe('l1')
    expect(payload.rawAnswer.selected).toEqual(
      expect.arrayContaining(['ohrenbetäubend', 'leise', 'höllisch']),
    )
    expect(payload.rawAnswer.selected).toHaveLength(3)

    // Context-State wechselt nach SUBMITTED
    await waitFor(() => {
      expect(getState().currentState).toBe(KIOSK_STATES.SUBMITTED)
    })
    expect(getState().submittedResult).toEqual({ score: 5, maxScore: 10, correct: 1 })
  })

  it('rendert WortZwilling-Variante mit Zonen', () => {
    const s = {
      ...initialState('morgentau'),
      currentState: KIOSK_STATES.PLAYING,
      token:        'tok-1',
      assignment:   { id: 'a1', mode: 'wortzwilling', lemmaCount: 1 },
      currentLemma: {
        id: 'l1', lemma: 'X', ipa: '',
        prompt: { wortA: 'A', wortB: 'B', words: ['eins', 'zwei'] },
      },
    }
    renderWith(s)
    expect(screen.getByTestId('classroom-kiosk-game-wortzwilling')).toBeTruthy()
    // Echte Drag-and-Drop-Engine: Zonen tragen die Wort-Labels, Wörter in der Bank.
    expect(screen.getAllByText('A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('B').length).toBeGreaterThan(0)
    expect(screen.getByText('eins')).toBeTruthy()
    expect(screen.getByText('zwei')).toBeTruthy()
  })

  it('rendert Zeitenwende-Karte mit Buttons', () => {
    const s = {
      ...initialState('morgentau'),
      currentState: KIOSK_STATES.PLAYING,
      token:        'tok-1',
      assignment:   { id: 'a1', mode: 'zeitenwende', lemmaCount: 1 },
      currentLemma: {
        id: 'l1', lemma: 'Y', ipa: '',
        prompt: { words: ['Wort1'] },
      },
    }
    renderWith(s)
    expect(screen.getByTestId('classroom-kiosk-game-zeitenwende')).toBeTruthy()
    // Nutzt jetzt die echte Zeitenwende-Engine (Swipe + Karten): Choice-Buttons
    // per aria-label, Wort auf der Karte.
    expect(screen.getByLabelText('Vor 2000')).toBeTruthy()
    expect(screen.getByLabelText('Nach 2000')).toBeTruthy()
    expect(screen.getByText('Wort1')).toBeTruthy()
  })

  it('rendert Lueckenfueller (choice-Runde) mit Optionen', () => {
    const s = {
      ...initialState('morgentau'),
      currentState: KIOSK_STATES.PLAYING,
      token:        'tok-1',
      assignment:   { id: 'a1', mode: 'lueckenfueller', lemmaCount: 1 },
      currentLemma: {
        id: 'l1', lemma: 'Z', ipa: '',
        prompt: {
          currentRound: { type: 'choice', sentence: 'Er war ___ schnell.', options: ['sehr', 'kaum'] },
          roundIndex:   0,
        },
      },
    }
    renderWith(s)
    expect(screen.getByTestId('classroom-kiosk-game-lueckenfueller')).toBeTruthy()
    expect(screen.getByTestId('classroom-kiosk-lf-choice-sehr')).toBeTruthy()
  })
})
