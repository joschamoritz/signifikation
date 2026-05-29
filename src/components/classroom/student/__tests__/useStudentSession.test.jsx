// @vitest-environment happy-dom
//
// Recovery-Test fuer useStudentSession (T-5.8):
// Mount mit gefuelltem sessionStorage → JOINED dispatch + Persistenz intakt.

import { render, cleanup, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../kioskFetch', () => ({
  joinSession:   vi.fn(),
  fetchView:     vi.fn().mockResolvedValue({
    sessionId:     's1',
    sessionStatus: 'lobby',
    assignment:    null,
    currentLemma:  null,
    progress:      { submittedCount: 0, totalLemmata: 0, done: false },
  }),
  submitAnswer:  vi.fn(),
  sendHeartbeat: vi.fn().mockResolvedValue({ ok: true }),
  leaveSession:  vi.fn(),
  KioskApiError: class KioskApiError extends Error {},
}))

import {
  StudentKioskProvider,
  useStudentKiosk,
  initialState,
  KIOSK_STATES,
} from '../StudentKioskContext'
import { useStudentSession, __STORAGE_KEY } from '../hooks/useStudentSession'

function Probe({ onState }) {
  const { state } = useStudentKiosk()
  onState(state)
  useStudentSession({ socketConnected: false })
  return null
}

function mount(stateOverride, onState) {
  return render(
    <StudentKioskProvider initialOverride={stateOverride}>
      <Probe onState={onState} />
    </StudentKioskProvider>,
  )
}

describe('useStudentSession Recovery (T-5.8)', () => {
  beforeEach(() => { sessionStorage.clear() })
  afterEach(() => { cleanup(); sessionStorage.clear() })

  it('rehydratisiert Token/SessionId aus sessionStorage beim Mount', async () => {
    sessionStorage.setItem(__STORAGE_KEY, JSON.stringify({
      code:          'morgentau',
      sessionId:     's1',
      participantId: 'p1',
      token:         'tok-X',
      displayName:   'Mira',
    }))

    const states = []
    await act(async () => {
      mount({ ...initialState('morgentau'), currentState: KIOSK_STATES.NAME }, (s) => states.push(s))
      // microtask + view-resolve
      await Promise.resolve()
      await Promise.resolve()
    })

    const latest = states[states.length - 1]
    expect(latest.token).toBe('tok-X')
    expect(latest.sessionId).toBe('s1')
    expect(latest.participantId).toBe('p1')
    expect(latest.displayName).toBe('Mira')
    // State landet in waiting (kein currentLemma + assignment=null)
    expect(latest.currentState).toBe(KIOSK_STATES.WAITING)
  })

  it('ignoriert sessionStorage wenn der Code in der URL ein anderer ist', async () => {
    sessionStorage.setItem(__STORAGE_KEY, JSON.stringify({
      code: 'andererCode',
      sessionId: 's1', participantId: 'p1', token: 'tok-X', displayName: 'Mira',
    }))

    const states = []
    await act(async () => {
      mount({ ...initialState('morgentau'), currentState: KIOSK_STATES.NAME }, (s) => states.push(s))
      await Promise.resolve()
    })

    const latest = states[states.length - 1]
    expect(latest.token).toBeNull()
    // sessionStorage-Eintrag muss bereinigt sein
    expect(sessionStorage.getItem(__STORAGE_KEY)).toBeNull()
  })

  it('persistiert Token + Felder nach JOINED-Dispatch', async () => {
    const override = {
      ...initialState('morgentau'),
      currentState:  KIOSK_STATES.WAITING,
      sessionId:     's2',
      participantId: 'p2',
      token:         'tok-Y',
      displayName:   'Lara',
    }
    await act(async () => {
      mount(override, () => {})
      await Promise.resolve()
    })
    const raw = sessionStorage.getItem(__STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed).toMatchObject({
      sessionId: 's2', participantId: 'p2', token: 'tok-Y',
      displayName: 'Lara', code: 'morgentau',
    })
  })
})
