// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSwipeHint, HINTS_DISABLED_KEY } from './useSwipeHint'

function makeMatchMedia(matches) {
  return {
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

describe('useSwipeHint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    localStorage.clear()
    window.matchMedia = vi.fn(() => makeMatchMedia(true))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('zeigt den Hinweis beim Mount (mobil, nicht deaktiviert, in dieser Sitzung noch nicht gesehen)', () => {
    const { result } = renderHook(() => useSwipeHint('spielmodi'))
    expect(result.current.show).toBe(true)
    expect(result.current.fade).toBe(false)
  })

  it('blendet nach 8s automatisch aus und merkt sich das für die Sitzung', () => {
    const { result } = renderHook(() => useSwipeHint('spielmodi'))
    expect(result.current.show).toBe(true)

    act(() => { vi.advanceTimersByTime(8000) })
    expect(result.current.fade).toBe(true)
    expect(sessionStorage.getItem('sig_hint_seen_spielmodi')).toBe('1')

    act(() => { vi.advanceTimersByTime(400) })
    expect(result.current.show).toBe(false)
  })

  it('onInteract blendet sofort aus, ohne auf die 8s zu warten', () => {
    const { result } = renderHook(() => useSwipeHint('kurs'))
    act(() => { result.current.onInteract() })
    expect(result.current.fade).toBe(true)
    expect(sessionStorage.getItem('sig_hint_seen_kurs')).toBe('1')
  })

  it('zeigt sich nicht erneut, wenn in dieser Sitzung schon gesehen', () => {
    sessionStorage.setItem('sig_hint_seen_spielmodi', '1')
    const { result } = renderHook(() => useSwipeHint('spielmodi'))
    expect(result.current.show).toBe(false)
  })

  it('zeigt sich nicht, wenn Hinweise in den Einstellungen dauerhaft deaktiviert sind', () => {
    localStorage.setItem(HINTS_DISABLED_KEY, '1')
    const { result } = renderHook(() => useSwipeHint('spielmodi'))
    expect(result.current.show).toBe(false)
  })

  it('zeigt sich nicht auf Desktop (matchMedia matches=false)', () => {
    window.matchMedia = vi.fn(() => makeMatchMedia(false))
    const { result } = renderHook(() => useSwipeHint('spielmodi'))
    expect(result.current.show).toBe(false)
  })

  it('zeigt sich nicht, wenn enabled=false übergeben wird (z. B. Vollroute /c)', () => {
    const { result } = renderHook(() => useSwipeHint('klassenraum-student', false))
    expect(result.current.show).toBe(false)
  })
})
