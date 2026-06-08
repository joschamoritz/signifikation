// @vitest-environment happy-dom
//
// Smoke-Tests fuer die State-Komponenten der Kiosk-Shell.
// Wir mocken kioskFetch komplett — die Render-Pfade selbst sind das, was
// geprueft wird (kein E2E).

import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../kioskFetch', () => ({
  joinSession:   vi.fn(),
  fetchView:     vi.fn().mockResolvedValue({ assignment: null, currentLemma: null, progress: { submittedCount: 0, totalLemmata: 0, done: false }, sessionStatus: 'lobby' }),
  submitAnswer:  vi.fn(),
  sendHeartbeat: vi.fn().mockResolvedValue({ ok: true }),
  leaveSession:  vi.fn(),
  KioskApiError: class KioskApiError extends Error {},
}))

// socket.io-client wird lazy importiert — wir verhindern den dynamic import,
// indem useStudentSocket nur bei token=null lebt (was bei initialOverride der Fall ist).
// happy-dom kennt BroadcastChannel, das genuegt fuer useKioskGuard.

import { StudentKioskProvider, KIOSK_STATES, initialState } from '../StudentKioskContext'
import NameState        from '../states/NameState'
import WaitingState     from '../states/WaitingState'
import SubmittedState   from '../states/SubmittedState'
import StudentJoinEntry from '../StudentJoinEntry'
import KioskShell       from '../KioskShell'

function renderWith(stateOverride) {
  return render(
    <StudentKioskProvider initialOverride={stateOverride}>
      {stateOverride.currentState === 'name'      && <NameState />}
      {stateOverride.currentState === 'waiting'   && <WaitingState />}
      {stateOverride.currentState === 'submitted' && <SubmittedState />}
      {stateOverride.currentState === 'ended'     && <SubmittedState />}
    </StudentKioskProvider>,
  )
}

describe('StudentJoinEntry (T-5.2)', () => {
  afterEach(() => cleanup())

  it('rendert Beitreten-Form, Submit ist initial disabled', () => {
    render(<StudentJoinEntry />)
    expect(screen.getByText(/klassenraum/i)).toBeTruthy()
    const btn = screen.getByTestId('cr2-kiosk-code-submit')
    expect(btn.disabled).toBe(true)
  })

  it('aktiviert Submit ab 4 Zeichen und normalisiert auf a-z0-9-', () => {
    render(<StudentJoinEntry />)
    const input = screen.getByTestId('cr2-kiosk-code-input')
    fireEvent.change(input, { target: { value: 'MORG!?ent au' } })
    expect(input.value).toBe('morgentau')
    expect(screen.getByTestId('cr2-kiosk-code-submit').disabled).toBe(false)
  })

  it('zeigt Hinweis bei initialNotice', () => {
    render(<StudentJoinEntry initialNotice="Code ungültig." />)
    expect(screen.getByText(/code ungültig/i)).toBeTruthy()
  })
})

describe('NameState (T-5.3)', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })
  afterEach(() => cleanup())

  it('rendert Pflicht-Hinweis + zeigt Code', () => {
    const s = { ...initialState('morgentau'), currentState: KIOSK_STATES.NAME }
    renderWith(s)
    expect(screen.getByText(/spitzname reicht/i)).toBeTruthy()
    expect(screen.getByText(/morgentau/i)).toBeTruthy()
  })

  it('Skip-Link rendert', () => {
    const s = { ...initialState('morgentau'), currentState: KIOSK_STATES.NAME }
    renderWith(s)
    expect(screen.getByTestId('cr2-kiosk-name-skip')).toBeTruthy()
  })
})

describe('WaitingState (T-5.4)', () => {
  afterEach(() => cleanup())

  it('rendert Drop-Cap W + Name-Chip wenn displayName gesetzt', () => {
    const s = {
      ...initialState('morgentau'),
      currentState: KIOSK_STATES.WAITING,
      displayName:  'Mira',
    }
    renderWith(s)
    expect(screen.getByText("Warte, gleich geht's los.")).toBeTruthy()
    expect(screen.getByTestId('cr2-kiosk-name-chip').textContent).toContain('Mira')
  })

  it('zeigt KEINE anderen Teilnehmer (sozialer Druck vermeiden)', () => {
    const s = { ...initialState('morgentau'), currentState: KIOSK_STATES.WAITING, displayName: 'Mira' }
    renderWith(s)
    // Erwartung: kein Element mit class "cr2-participant" (Lehrer-spezifisch).
    expect(document.querySelector('.cr2-participant')).toBeNull()
  })
})

describe('SubmittedState (T-5.7)', () => {
  afterEach(() => cleanup())

  it('rendert „Abgegeben." vor Reveal', () => {
    const s = {
      ...initialState('morgentau'),
      currentState:    KIOSK_STATES.SUBMITTED,
      assignment:      { id: 'a1', mode: 'kollokationen', lemmaCount: 1 },
      currentLemma:    { id: 'l1', lemma: 'Test', ipa: '', prompt: { words: [] } },
      submittedAnswer: { selected: ['a', 'b', 'c'] },
      submittedResult: { score: 7, maxScore: 10, correct: 2 },
      revealed:        false,
    }
    renderWith(s)
    expect(screen.getByTestId('cr2-kiosk-submitted-title').textContent).toMatch(/eingereicht/i)
    expect(screen.queryByTestId('cr2-kiosk-reveal')).toBeNull()
  })

  it('zeigt Auflösung im ended-State + Link „Zur App"', () => {
    const s = {
      ...initialState('morgentau'),
      currentState:    KIOSK_STATES.ENDED,
      assignment:      { id: 'a1', mode: 'kollokationen', lemmaCount: 1 },
      currentLemma:    { id: 'l1', lemma: 'Test', ipa: '', prompt: { words: [] } },
      submittedAnswer: { selected: ['a', 'b', 'c'] },
      submittedResult: { score: 7, maxScore: 10, correct: 2 },
      revealed:        true,
      sessionStatus:   'finished',
    }
    renderWith(s)
    expect(screen.getByTestId('cr2-kiosk-reveal')).toBeTruthy()
    expect(screen.getByTestId('cr2-kiosk-to-app')).toBeTruthy()
  })

  it('zeigt nach Freigabe die item-genaue Auflösung (✓/✗ + Lösung)', () => {
    const s = {
      ...initialState('morgentau'),
      currentState:    KIOSK_STATES.ENDED,
      assignment:      { id: 'a1', mode: 'kollokationen', lemmaCount: 1 },
      currentLemma:    { id: 'l1', lemma: 'Test', ipa: '', prompt: { words: [] } },
      submittedAnswer: { selected: ['stark', 'weit', 'leise'] },
      submittedResult: { score: 6, maxScore: 10, correct: 1 },
      revealed:        true,
      sessionStatus:   'finished',
      revealData: {
        byKey: {
          'l1:0': {
            lemmaId: 'l1', roundIndex: 0, mode: 'kollokationen',
            score: 6, maxScore: 10,
            items: [
              { label: 'stark', you: 'stark', correct: true,  partial: false },
              { label: 'weit',  you: 'weit',  correct: false, partial: true  },
              { label: 'leise', you: 'leise', correct: false, partial: false },
            ],
            solution: 'stark, groß, klein',
          },
        },
      },
    }
    renderWith(s)
    expect(screen.getByTestId('cr2-kiosk-reveal-items')).toBeTruthy()
    // A11y: Live-Region kuendigt die Freigabe an (Phasenwechsel ohne Nutzeraktion).
    expect(screen.getByText(/Auflösung wurde freigegeben/)).toBeTruthy()
    // Lösung wird genannt.
    expect(screen.getByText(/stark, groß, klein/)).toBeTruthy()
    // Punkte aus der Reveal-Antwort.
    expect(screen.getByText(/6 \/ 10 Punkte/)).toBeTruthy()
  })

  it('zeigt „Session beendet" wenn kein Submit erfolgte', () => {
    const s = {
      ...initialState('morgentau'),
      currentState:  KIOSK_STATES.ENDED,
      sessionStatus: 'finished',
      revealed:      true,
    }
    renderWith(s)
    expect(screen.getByText(/session beendet/i)).toBeTruthy()
  })
})

describe('KioskShell Reconnect-Hinweis (W2-T5)', () => {
  afterEach(() => cleanup())

  it('zeigt den Hinweis NICHT, wenn reconnecting=false', () => {
    render(<KioskShell code="morgentau" reconnecting={false}><div>inhalt</div></KioskShell>)
    expect(screen.queryByTestId('cr2-kiosk-reconnect')).toBeNull()
    // Spielinhalt bleibt sichtbar.
    expect(screen.getByText('inhalt')).toBeTruthy()
  })

  it('zeigt den dezenten Hinweis, wenn reconnecting=true — Inhalt bleibt erhalten', () => {
    render(<KioskShell code="morgentau" reconnecting={true}><div>inhalt</div></KioskShell>)
    const banner = screen.getByTestId('cr2-kiosk-reconnect')
    expect(banner.textContent).toMatch(/verbindung wird wiederhergestellt/i)
    // Der Spielscreen wird NICHT ersetzt (Eingaben gehen nicht verloren).
    expect(screen.getByText('inhalt')).toBeTruthy()
  })
})
