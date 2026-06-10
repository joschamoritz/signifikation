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

  it('propagiert das customLemma-Kontingent aus der Server-Antwort', async () => {
    mockFetch({ gesamtausgabe: { unlocked: false }, customLemma: { unlimited: false, allowance: 1, remaining: 1 } })

    const { result } = renderHook(() => useEntitlements())
    await waitFor(() => expect(result.current.customLemma).toEqual({ unlimited: false, allowance: 1, remaining: 1 }))

    expect(result.current.gesamtausgabeUnlocked).toBe(false)
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
