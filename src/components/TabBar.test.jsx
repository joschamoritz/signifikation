// @vitest-environment happy-dom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar'

vi.mock('../utils/haptics', () => ({ hapticLight: vi.fn() }))
import { hapticLight } from '../utils/haptics'

// happy-dom liefert keinen ResizeObserver und feuert rAF nicht synchron –
// beides wird hier deterministisch ersetzt, damit useScrollEdge messbar ist.
let rafQueue = []
let resizeCallbacks = []

function flushRaf() {
  const queue = rafQueue
  rafQueue = []
  queue.forEach((cb) => cb(0))
}

/** Setzt Scrollhöhe/-position so, wie useScrollEdge sie liest. */
function setScroll({ scrollHeight, scrollY = 0 }) {
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
  window.scrollY = scrollY
}

beforeEach(() => {
  vi.clearAllMocks() // hapticLight ist ein vi.fn() aus der Modul-Factory
  rafQueue = []
  resizeCallbacks = []
  window.innerHeight = 800
  window.scrollY = 0
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.push(cb); return rafQueue.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { resizeCallbacks.push(cb) }
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup() // kein globals:true in vite.config.js -> kein Auto-Cleanup
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const bar = () => document.querySelector('.tab-bar')
const indicator = () => document.querySelector('.tab-bar-indicator')

describe('TabBar – Scroll-Edge', () => {
  it('ist flach, wenn die Seite nicht scrollbar ist', () => {
    setScroll({ scrollHeight: 800 })
    render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)
    expect(bar().classList.contains('tab-bar--flat')).toBe(true)
  })

  it('hebt sich ab, sobald Inhalt unter der Leiste durchläuft', () => {
    setScroll({ scrollHeight: 2800, scrollY: 300 })
    render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)
    expect(bar().classList.contains('tab-bar--flat')).toBe(false)
  })

  it('wird am Seitenende wieder flach', () => {
    setScroll({ scrollHeight: 2800, scrollY: 300 })
    render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)
    expect(bar().classList.contains('tab-bar--flat')).toBe(false)

    setScroll({ scrollHeight: 2800, scrollY: 2000 }) // 2800 - 800 = 2000 -> Ende
    act(() => {
      window.dispatchEvent(new Event('scroll'))
      flushRaf()
    })
    expect(bar().classList.contains('tab-bar--flat')).toBe(true)
  })

  it('misst nach einer Größenänderung des Inhalts neu (Tab-Wechsel, Lazy-Content)', () => {
    setScroll({ scrollHeight: 800 })
    render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)
    expect(bar().classList.contains('tab-bar--flat')).toBe(true)

    setScroll({ scrollHeight: 3000, scrollY: 0 })
    act(() => {
      resizeCallbacks.forEach((cb) => cb())
      flushRaf()
    })
    expect(bar().classList.contains('tab-bar--flat')).toBe(false)
  })
})

describe('TabBar – Morph-Animation', () => {
  it('animiert beim Erstmount nicht', () => {
    setScroll({ scrollHeight: 800 })
    render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)
    expect(indicator().style.animationName).toBe('none')
  })

  it('alterniert die Keyframes bei jedem Wechsel, damit die Animation neu startet', () => {
    setScroll({ scrollHeight: 800 })
    const { rerender } = render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)

    rerender(<TabBar activeTab="archiv" onTabChange={() => {}} />)
    expect(indicator().style.animationName).toBe('tabMorphA')

    rerender(<TabBar activeTab="kurs" onTabChange={() => {}} />)
    expect(indicator().style.animationName).toBe('tabMorphB')

    rerender(<TabBar activeTab="profil" onTabChange={() => {}} />)
    expect(indicator().style.animationName).toBe('tabMorphA')
  })

  it('setzt --active-index auf den sichtbaren Tab-Index', () => {
    setScroll({ scrollHeight: 800 })
    render(<TabBar activeTab="profil" onTabChange={() => {}} />)
    // ohne Klassenraum-Tab: spielmodi, archiv, kurs, profil -> Index 3
    expect(indicator().style.getPropertyValue('--active-index')).toBe('3')
  })

  it('blendet den Indikator aus, wenn kein Tab aktiv ist', () => {
    setScroll({ scrollHeight: 800 })
    render(<TabBar activeTab="unbekannt" onTabChange={() => {}} />)
    expect(indicator().style.opacity).toBe('0')
    expect(indicator().style.getPropertyValue('--active-index')).toBe('0')
  })
})

describe('TabBar – Haptik', () => {
  it('gibt beim Wechsel auf einen anderen Tab Feedback', () => {
    setScroll({ scrollHeight: 800 })
    const onTabChange = vi.fn()
    render(<TabBar activeTab="spielmodi" onTabChange={onTabChange} />)

    fireEvent.click(screen.getByLabelText('Archiv'))
    expect(hapticLight).toHaveBeenCalledTimes(1)
    expect(onTabChange).toHaveBeenCalledWith('archiv')
  })

  it('bleibt bei erneutem Tippen auf den aktiven Tab still', () => {
    setScroll({ scrollHeight: 800 })
    const onTabChange = vi.fn()
    render(<TabBar activeTab="spielmodi" onTabChange={onTabChange} />)

    fireEvent.click(screen.getByLabelText('Spielmodi'))
    expect(hapticLight).not.toHaveBeenCalled()
    expect(onTabChange).toHaveBeenCalledWith('spielmodi') // Navigation trotzdem melden
  })
})

describe('TabBar – Tab-Sichtbarkeit', () => {
  it('zeigt den Klassenraum-Tab nur für Lehrkräfte', () => {
    setScroll({ scrollHeight: 800 })
    const { rerender } = render(<TabBar activeTab="spielmodi" onTabChange={() => {}} />)
    expect(screen.queryByLabelText('Klassenraum')).toBeNull()

    rerender(<TabBar activeTab="spielmodi" onTabChange={() => {}} showClassroomTab />)
    expect(screen.getByLabelText('Klassenraum')).toBeTruthy()
  })
})
