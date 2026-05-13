// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useEntitlements } from './useEntitlements'

function mockFetch(payload, { status = 200 } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('useEntitlements', () => {
  it('setzt gesamtausgabeUnlocked=false wenn kein localStorage-Eintrag und API antwortet mit unlocked=false', async () => {
    mockFetch({ gesamtausgabe: { unlocked: false } })

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(result.current.gesamtausgabeUnlocked).toBe(false)
    expect(result.current.gesamtausgabePermanent).toBe(false)
  })

  it('setzt gesamtausgabeUnlocked=true wenn API unlocked=true zurückgibt', async () => {
    mockFetch({ gesamtausgabe: { unlocked: true } })

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(result.current.gesamtausgabeUnlocked).toBe(true))

    expect(result.current.gesamtausgabePermanent).toBe(true)
    expect(localStorage.getItem('sig_gesamtausgabe')).toBe('1')
  })

  it('setzt freeAccessToday und freeAccessLabel aus Server-Antwort', async () => {
    mockFetch({ gesamtausgabe: { unlocked: false }, freeAccessToday: true, freeAccessLabel: 'Sonntag' })

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(result.current.freeAccessToday).toBe(true))

    expect(result.current.freeAccessLabel).toBe('Sonntag')
    expect(result.current.gesamtausgabeUnlocked).toBe(true)   // true wegen freeAccess
    expect(result.current.gesamtausgabePermanent).toBe(false)  // aber kein permanenter Kauf
  })

  it('entfernt localStorage bei device_limit (403)', async () => {
    localStorage.setItem('sig_gesamtausgabe', '1')
    mockFetch({ error: 'Gerätelimit erreicht' }, { status: 403 })

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(result.current.gesamtausgabeUnlocked).toBe(false))

    expect(localStorage.getItem('sig_gesamtausgabe')).toBeNull()
    expect(result.current.gesamtausgabePermanent).toBe(false)
  })

  it('fällt bei HTTP-Fehler auf localStorage-Wert zurück', async () => {
    localStorage.setItem('sig_gesamtausgabe', '1')
    mockFetch({}, { status: 500 })

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(result.current.gesamtausgabeUnlocked).toBe(true)
  })

  it('fällt bei Netzwerkfehler auf localStorage-Wert zurück', async () => {
    localStorage.setItem('sig_gesamtausgabe', '1')
    global.fetch = vi.fn().mockRejectedValue(new Error('Network'))

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(result.current.gesamtausgabeUnlocked).toBe(true)
  })

  it('refreshEntitlements aktualisiert State manuell', async () => {
    mockFetch({ gesamtausgabe: { unlocked: false } })
    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    mockFetch({ gesamtausgabe: { unlocked: true } })

    await act(async () => {
      await result.current.refreshEntitlements()
    })

    expect(result.current.gesamtausgabeUnlocked).toBe(true)
  })
})
