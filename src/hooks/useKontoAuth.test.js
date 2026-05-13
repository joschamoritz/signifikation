// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useKontoAuth } from './useKontoAuth'

function mockSession(payload = null, { status = 200 } = {}) {
  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('get-session')) {
      return Promise.resolve({
        ok: !!payload && status < 300,
        status: payload ? status : 401,
        json: () => Promise.resolve(payload),
      })
    }
    if (url.includes('auth-options')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
    if (url.includes('account/me')) {
      return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve(null) })
    }
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) })
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  // URL-Search-Params zurücksetzen
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useKontoAuth – Initialisierung', () => {
  it('startet im login-Modus, isChecking=true bis Session geladen', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))

    expect(result.current.mode).toBe('login')
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isLoggedIn).toBe(false)
  })

  it('setzt isLoggedIn=true wenn Session mit User vorhanden', async () => {
    mockSession({ user: { id: 'u1', email: 'test@example.com' } })
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))

    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isLoggedIn).toBe(true)
    expect(result.current.sessionData?.user?.email).toBe('test@example.com')
  })

  it('erkennt Reset-Token in URL und wechselt zu reset-complete', async () => {
    mockSession(null)
    window.history.replaceState(null, '', '/?token=abc123')

    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))

    await waitFor(() => expect(result.current.mode).toBe('reset-complete'))
    expect(result.current.resetToken).toBe('abc123')
  })
})

describe('useKontoAuth – switchMode', () => {
  it('wechselt Modus und leert alle Felder', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    act(() => result.current.setEmail('test@example.com'))
    act(() => result.current.setPassword('geheim123'))
    act(() => result.current.switchMode('register'))

    expect(result.current.mode).toBe('register')
    expect(result.current.email).toBe('')
    expect(result.current.password).toBe('')
    expect(result.current.showNameField).toBe(true)
  })

  it('ignoriert switchMode wenn bereits in diesem Modus', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    act(() => result.current.setEmail('abc@example.com'))
    act(() => result.current.switchMode('login')) // bleibt login

    expect(result.current.email).toBe('abc@example.com') // nicht geleert
  })
})

describe('useKontoAuth – Fehlerübersetzung (über handleAuthSubmit)', () => {
  it('mappt "invalid email or password" auf deutschen Text', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    // Submit-Formular mit gültigen Feldern, aber Server antwortet mit Fehler
    act(() => result.current.setEmail('test@example.com'))
    act(() => result.current.setPassword('geheim123'))

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('sign-in/email')) {
        return Promise.resolve({
          ok: false, status: 401,
          json: () => Promise.resolve({ error: { message: 'Invalid email or password' } }),
        })
      }
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) })
    })

    await act(async () => {
      await result.current.handleAuthSubmit({ preventDefault: () => {} })
    })

    expect(result.current.notice?.text).toBe('E-Mail oder Passwort ist falsch.')
    expect(result.current.notice?.type).toBe('error')
  })

  it('mappt "user already exists" auf deutschen Text', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    act(() => result.current.switchMode('register'))
    act(() => result.current.setName('Max'))
    act(() => result.current.setEmail('test@example.com'))
    act(() => result.current.setPassword('geheim123'))

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('sign-up/email')) {
        return Promise.resolve({
          ok: false, status: 400,
          json: () => Promise.resolve({ error: { message: 'User already exists' } }),
        })
      }
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) })
    })

    await act(async () => {
      await result.current.handleAuthSubmit({ preventDefault: () => {} })
    })

    expect(result.current.notice?.text).toBe('Diese E-Mail ist bereits registriert.')
  })

  it('setzt notice bei ungültiger E-Mail-Fehlermeldung vom Server', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    act(() => result.current.setEmail('test@example.com'))
    act(() => result.current.setPassword('geheim123'))

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('sign-in/email')) {
        return Promise.resolve({
          ok: false, status: 400,
          json: () => Promise.resolve({ error: { message: 'Invalid email' } }),
        })
      }
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null) })
    })

    await act(async () => {
      await result.current.handleAuthSubmit({ preventDefault: () => {} })
    })

    // translateAuthError mappt "Invalid email" auf deutschen Text im notice
    expect(result.current.notice?.type).toBe('error')
    expect(result.current.notice?.text).toMatch(/E-Mail/)
  })
})

describe('useKontoAuth – Client-seitige Validierung', () => {
  it('verhindert Submit wenn E-Mail leer', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    global.fetch = vi.fn()
    act(() => result.current.setPassword('geheim123'))

    await act(async () => {
      await result.current.handleAuthSubmit({ preventDefault: () => {} })
    })

    // Fetch sollte nicht aufgerufen worden sein (nur Session-Calls im mount)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.fieldErrors.email.length).toBeGreaterThan(0)
  })

  it('verhindert Submit wenn Passwort zu kurz', async () => {
    mockSession(null)
    const { result } = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    global.fetch = vi.fn()
    act(() => result.current.setEmail('test@example.com'))
    act(() => result.current.setPassword('kurz'))

    await act(async () => {
      await result.current.handleAuthSubmit({ preventDefault: () => {} })
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.fieldErrors.password).toMatch(/8 Zeichen/)
  })
})
