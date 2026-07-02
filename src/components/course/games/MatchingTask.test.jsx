// @vitest-environment happy-dom
// Zuordnen (MatchingTask): Tap-Fallback (Karte wählen → Feld antippen) und die
// A11y-Ansagen der Zuordnungen (aria-live). Pointer-Drag ist in happy-dom nicht
// sinnvoll simulierbar; die Tastatur-/Tap-Pfade decken dieselbe assign-Logik ab.
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MatchingTask from './MatchingTask'

afterEach(cleanup)

const poolCards = () => [...document.querySelectorAll('.course-match-chip--pool')]
const poolByText = (t) => poolCards().find((el) => el.textContent.replace(/\s+/g, ' ').trim().startsWith(t))
const anchors = () => [...document.querySelectorAll('.course-match-anchor')]
const anchorByLabel = (t) => anchors().find((el) => el.querySelector('.course-match-anchor-label')?.textContent.trim() === t)
const placedChips = () => [...document.querySelectorAll('.course-match-chip--placed')]
const status = () => document.querySelector('.sr-only[role="status"]')
const checkBtn = () => document.querySelector('.course-check-btn')

const TASK = {
  id: 'm1',
  level: 'DaZ',
  payload: {
    anchors: [{ id: 'a1', label: 'Hund' }, { id: 'a2', label: 'Katze' }],
    candidates: [{ id: 'c1', label: 'bellen' }, { id: 'c2', label: 'miauen' }],
  },
  solution: { map: { a1: ['c1'], a2: ['c2'] } },
  feedback: { onCorrect: 'Gut.' },
  display: { metric: 'none' },
}

// Tap-Fallback: Pool-Karte per Tastatur auswählen, dann Anker anklicken.
function tapAssign(cardText, anchorLabel) {
  fireEvent.keyDown(poolByText(cardText), { key: 'Enter' })
  fireEvent.click(anchorByLabel(anchorLabel))
}

describe('MatchingTask – Zuordnung + A11y-Ansagen', () => {
  it('sagt eine Zuordnung über aria-live an', () => {
    render(<MatchingTask task={TASK} index="1" onChecked={vi.fn()} />)
    expect(status().textContent).toBe('') // dauerhaft gemountet, anfangs leer
    tapAssign('bellen', 'Hund')
    expect(status().textContent).toBe('bellen zu „Hund" zugeordnet.')
  })

  it('sagt das Lösen einer Zuordnung an', () => {
    render(<MatchingTask task={TASK} index="1" onChecked={vi.fn()} />)
    tapAssign('bellen', 'Hund')
    fireEvent.click(placedChips()[0]) // platzierte Karte antippen = lösen
    expect(status().textContent).toBe('bellen – Zuordnung gelöst.')
  })

  it('korrekte Zuordnung aller Partner → onChecked(true)', () => {
    const onChecked = vi.fn()
    render(<MatchingTask task={TASK} index="1" onChecked={onChecked} />)
    tapAssign('bellen', 'Hund')
    tapAssign('miauen', 'Katze')
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(true)
  })

  it('falsche Zuordnung → onChecked(false)', () => {
    const onChecked = vi.fn()
    render(<MatchingTask task={TASK} index="1" onChecked={onChecked} />)
    tapAssign('bellen', 'Katze') // falsch
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(false)
  })
})
