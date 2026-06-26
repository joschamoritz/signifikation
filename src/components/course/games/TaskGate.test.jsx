// @vitest-environment happy-dom
// Sichert die Sperr-Logik von TaskGate (Nutzerentscheidung 2026-06-25):
// kuratierte Aufgaben sind nach Abgabe gesperrt, „Eigenes Lemma" bleibt frei.
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskGate from './TaskGate'

afterEach(cleanup)

// Unbekanntes Format → TaskPlayer-Fallback (.course-task, kein --locked),
// reicht für die Verzweigungs-Tests (kein echtes Widget nötig).
const TASK = { id: 't1', format: 'FX', prompt: 'Aufgabe', feedback: { merksatz: 'Merke' } }

const lockedCard = () => document.querySelector('.course-task--locked')
const interactive = () => document.querySelector('.course-task:not(.course-task--locked)')

describe('TaskGate', () => {
  it('ohne Ergebnis → Aufgabe spielbar (keine Sperrkarte)', () => {
    render(<TaskGate task={TASK} index="1" result={null} onResult={vi.fn()} />)
    expect(lockedCard()).toBeNull()
    expect(interactive()).toBeTruthy()
  })

  it('mit geladenem Ergebnis (richtig) → Sperrkarte „Gelöst"', () => {
    render(<TaskGate task={TASK} index="1" result={{ correct: true, attempts: 1 }} onResult={vi.fn()} />)
    expect(lockedCard()).toBeTruthy()
    expect(lockedCard().textContent).toContain('Gelöst')
  })

  it('mit geladenem Ergebnis (falsch) → Sperrkarte „Nicht gelöst"', () => {
    render(<TaskGate task={TASK} index="1" result={{ correct: false, attempts: 1 }} onResult={vi.fn()} />)
    expect(lockedCard().textContent).toContain('Nicht gelöst')
  })

  it('Eigenes Lemma → frei spielbar, auch wenn ein Ergebnis vorliegt', () => {
    render(<TaskGate task={TASK} index="1" lemma="Wort" result={{ correct: true, attempts: 1 }} onResult={vi.fn()} />)
    expect(lockedCard()).toBeNull()
    expect(interactive()).toBeTruthy()
  })

  it('meldet bereits gesperrte Aufgaben dem Pager (onChecked)', () => {
    const onChecked = vi.fn()
    render(<TaskGate task={TASK} index="1" result={{ correct: true, attempts: 1 }} onResult={vi.fn()} onChecked={onChecked} />)
    expect(onChecked).toHaveBeenCalled()
  })
})
