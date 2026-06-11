// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useActiveSnapCard } from './useActiveSnapCard'

// ── matchMedia Mock ────────────────────────────────────────────────────────
function makeMatchMedia(matches) {
  const listeners = new Set()
  const mq = {
    matches,
    addEventListener: (_, cb) => listeners.add(cb),
    removeEventListener: (_, cb) => listeners.delete(cb),
    _fire: (newMatches) => {
      mq.matches = newMatches
      listeners.forEach(cb => cb({ matches: newMatches }))
    },
  }
  return mq
}

// ── IntersectionObserver Mock ──────────────────────────────────────────────
let observerCallback = null
let observedItems = []

const MockIntersectionObserver = vi.fn(function(cb) {
  observerCallback = cb
  this.observe = (el) => observedItems.push(el)
  this.disconnect = vi.fn(() => { observedItems = []; observerCallback = null })
})

// ── Helpers ────────────────────────────────────────────────────────────────
function buildContainer(cardCount = 3) {
  const container = document.createElement('ul')
  for (let i = 0; i < cardCount; i++) {
    const li = document.createElement('li')
    li.className = 'test-entry'
    container.appendChild(li)
  }
  document.body.appendChild(container)
  return container
}

function makeContainerRef(container) {
  const ref = { current: container }
  return ref
}

describe('useActiveSnapCard', () => {
  let mq

  beforeEach(() => {
    observedItems = []
    observerCallback = null
    MockIntersectionObserver.mockClear()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    mq = makeMatchMedia(true) // mobile by default
    vi.stubGlobal('matchMedia', () => mq)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('verbindet Observer auf Mobile', () => {
    const container = buildContainer(3)
    renderHook(() => useActiveSnapCard(makeContainerRef(container)))

    expect(MockIntersectionObserver).toHaveBeenCalledOnce()
    expect(observedItems).toHaveLength(3)
  })

  it('verbindet Observer NICHT auf Desktop', () => {
    mq = makeMatchMedia(false)
    vi.stubGlobal('matchMedia', () => mq)
    const container = buildContainer(3)
    renderHook(() => useActiveSnapCard(makeContainerRef(container)))

    expect(MockIntersectionObserver).not.toHaveBeenCalled()
  })

  it('setzt inert auf inaktive Karten (mobil)', () => {
    const container = buildContainer(3)
    renderHook(() => useActiveSnapCard(makeContainerRef(container)))

    const items = container.querySelectorAll('.test-entry')
    // Karte 0 ist aktiv → kein inert, 1 und 2 → inert
    expect(items[0].hasAttribute('inert')).toBe(false)
    expect(items[1].hasAttribute('inert')).toBe(true)
    expect(items[2].hasAttribute('inert')).toBe(true)
  })

  it('entfernt alle inert-Attribute bei Wechsel zu Desktop', () => {
    const container = buildContainer(3)
    renderHook(() => useActiveSnapCard(makeContainerRef(container)))

    const items = container.querySelectorAll('.test-entry')
    expect(items[1].hasAttribute('inert')).toBe(true)

    act(() => mq._fire(false)) // Breakpoint → Desktop

    expect(items[0].hasAttribute('inert')).toBe(false)
    expect(items[1].hasAttribute('inert')).toBe(false)
    expect(items[2].hasAttribute('inert')).toBe(false)
  })

  it('reconnect Observer bei Wechsel zurück zu Mobile', () => {
    mq = makeMatchMedia(false)
    vi.stubGlobal('matchMedia', () => mq)
    const container = buildContainer(3)
    renderHook(() => useActiveSnapCard(makeContainerRef(container)))

    expect(MockIntersectionObserver).not.toHaveBeenCalled()

    act(() => mq._fire(true)) // Desktop → Mobile

    expect(MockIntersectionObserver).toHaveBeenCalledOnce()
  })

  it('aktualisiert activeCard wenn Eintrag 50 % sichtbar wird', () => {
    const container = buildContainer(3)
    const { result } = renderHook(() => useActiveSnapCard(makeContainerRef(container)))

    const items = container.querySelectorAll('.test-entry')
    expect(result.current).toBe(0)

    act(() => {
      observerCallback([{ target: items[2], isIntersecting: true, intersectionRatio: 0.6 }])
    })

    expect(result.current).toBe(2)
  })

  it('bereinigt Observer bei Unmount', () => {
    const container = buildContainer(2)
    const { unmount } = renderHook(() => useActiveSnapCard(makeContainerRef(container)))
    const observer = MockIntersectionObserver.mock.instances[0]

    unmount()

    expect(observer.disconnect).toHaveBeenCalled()
  })
})
