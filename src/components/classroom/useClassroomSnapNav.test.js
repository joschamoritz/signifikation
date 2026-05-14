// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClassroomSnapNav } from './useClassroomSnapNav'

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
let connectedObserver = null

const MockIntersectionObserver = vi.fn(function(cb) {
  observerCallback = cb
  this.observe = vi.fn()
  this.disconnect = vi.fn(() => { observerCallback = null; connectedObserver = null })
  connectedObserver = this
})

// ── Helpers ────────────────────────────────────────────────────────────────
function buildContainer(cardCount = 3) {
  const container = document.createElement('ul')
  for (let i = 0; i < cardCount; i++) {
    const li = document.createElement('li')
    li.className = 'test-entry'
    li.scrollIntoView = vi.fn()
    container.appendChild(li)
  }
  document.body.appendChild(container)
  return container
}

describe('useClassroomSnapNav', () => {
  let mq

  beforeEach(() => {
    observerCallback = null
    connectedObserver = null
    MockIntersectionObserver.mockClear()
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    mq = makeMatchMedia(true)
    vi.stubGlobal('matchMedia', () => mq)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('verbindet Observer auf Mobile', () => {
    const container = buildContainer(4)
    renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: true,
      loadingAccount: false,
    }))

    expect(MockIntersectionObserver).toHaveBeenCalledOnce()
  })

  it('verbindet Observer NICHT auf Desktop', () => {
    mq = makeMatchMedia(false)
    vi.stubGlobal('matchMedia', () => mq)
    const container = buildContainer(4)
    renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    expect(MockIntersectionObserver).not.toHaveBeenCalled()
  })

  it('setzt inert auf inaktive Karten', () => {
    const container = buildContainer(3)
    renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    const items = container.querySelectorAll('.test-entry')
    expect(items[0].hasAttribute('inert')).toBe(false)
    expect(items[1].hasAttribute('inert')).toBe(true)
    expect(items[2].hasAttribute('inert')).toBe(true)
  })

  it('entfernt alle inert-Attribute bei Wechsel zu Desktop', () => {
    const container = buildContainer(3)
    renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    const items = container.querySelectorAll('.test-entry')
    expect(items[1].hasAttribute('inert')).toBe(true)

    act(() => mq._fire(false))

    items.forEach(item => expect(item.hasAttribute('inert')).toBe(false))
  })

  it('scrollToCard ruft scrollIntoView auf dem richtigen Element auf', () => {
    const container = buildContainer(3)
    const { result } = renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    const items = container.querySelectorAll('.test-entry')
    act(() => result.current.scrollToCard(2))

    expect(items[2].scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('handleSnapKeyDown: ArrowDown scrollt zur nächsten Karte (mobil)', () => {
    const container = buildContainer(3)
    const { result } = renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    const items = container.querySelectorAll('.test-entry')
    act(() => result.current.handleSnapKeyDown({ key: 'ArrowDown' }))

    expect(items[1].scrollIntoView).toHaveBeenCalled()
  })

  it('handleSnapKeyDown: ArrowUp scrollt nicht unter 0', () => {
    const container = buildContainer(3)
    const { result } = renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    const items = container.querySelectorAll('.test-entry')
    act(() => result.current.handleSnapKeyDown({ key: 'ArrowUp' }))

    // activeCard ist 0, kann nicht unter 0 gehen
    expect(items[0].scrollIntoView).not.toHaveBeenCalled()
  })

  it('handleSnapKeyDown: ignoriert auf Desktop', () => {
    mq = makeMatchMedia(false)
    vi.stubGlobal('matchMedia', () => mq)
    const container = buildContainer(3)
    const { result } = renderHook(() => useClassroomSnapNav({
      entriesRef: { current: container },
      isTeacher: false,
      loadingAccount: false,
    }))

    const items = container.querySelectorAll('.test-entry')
    act(() => result.current.handleSnapKeyDown({ key: 'ArrowDown' }))

    expect(items[1].scrollIntoView).not.toHaveBeenCalled()
  })
})
