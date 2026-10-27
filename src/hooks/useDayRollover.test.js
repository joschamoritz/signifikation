// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { berlinDatum, useDayRollover } from './useDayRollover'

// 2026-10-27 23:30 Berlin (MEZ, UTC+1) und 00:30 am Folgetag
const VOR_MITTERNACHT = new Date('2026-10-27T22:30:00Z')
const NACH_MITTERNACHT = new Date('2026-10-27T23:30:00Z')

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

afterEach(() => setVisibility('visible'))

describe('berlinDatum', () => {
  it('rechnet in der Zeitzone des Servers, nicht des Geräts', () => {
    expect(berlinDatum(VOR_MITTERNACHT)).toBe('2026-10-27')
    expect(berlinDatum(NACH_MITTERNACHT)).toBe('2026-10-28')
  })
})

describe('useDayRollover', () => {
  it('lädt nach, wenn die App am nächsten Tag wieder sichtbar wird', () => {
    let jetzt = VOR_MITTERNACHT
    const onNewDay = vi.fn()
    const now = () => jetzt
    renderHook(() => useDayRollover({ serverDatum: '2026-10-27', phase: 'home', onNewDay, now }))
    expect(onNewDay).not.toHaveBeenCalled()

    jetzt = NACH_MITTERNACHT
    act(() => {
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onNewDay).toHaveBeenCalledTimes(1)
  })

  it('wartet während eines Spiels und lädt nach der Rückkehr zur Startseite', () => {
    const onNewDay = vi.fn()
    const now = () => NACH_MITTERNACHT
    const { rerender } = renderHook(
      ({ phase }) => useDayRollover({ serverDatum: '2026-10-27', phase, onNewDay, now }),
      { initialProps: { phase: 'quiz' } },
    )
    expect(onNewDay).not.toHaveBeenCalled()
    rerender({ phase: 'home' })
    expect(onNewDay).toHaveBeenCalledTimes(1)
  })

  it('versucht es je Tageswechsel nur einmal (falsche Geräteuhr, Server noch auf dem Vortag)', () => {
    const onNewDay = vi.fn()
    const now = () => NACH_MITTERNACHT
    const { rerender } = renderHook(
      ({ phase }) => useDayRollover({ serverDatum: '2026-10-27', phase, onNewDay, now }),
      { initialProps: { phase: 'home' } },
    )
    rerender({ phase: 'quiz' })
    rerender({ phase: 'home' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(onNewDay).toHaveBeenCalledTimes(1)
  })

  it('tut nichts, solange noch kein Tagesinhalt geladen ist', () => {
    const onNewDay = vi.fn()
    renderHook(() => useDayRollover({ serverDatum: null, phase: 'home', onNewDay, now: () => NACH_MITTERNACHT }))
    expect(onNewDay).not.toHaveBeenCalled()
  })
})
