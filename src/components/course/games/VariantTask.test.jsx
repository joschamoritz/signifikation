// @vitest-environment happy-dom
// Bündel B: F3/F4/F5 nutzen native <input type="radio"> statt role="radio"-
// Buttons → echtes Tastaturmodell (Pfeiltasten) + SR-Semantik vom Browser.
// Pfeiltasten-Navigation ist nativ und wird hier nicht simuliert (happy-dom);
// geprüft wird, dass echte Radios emittiert werden + Auswahl/Sperre greifen.
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VariantTask from './VariantTask'

afterEach(cleanup)

const TASK = {
  id: 'tv1',
  payload: { frame: 'eine ___ Entscheidung', variants: [
    { id: 'v1', label: 'schwere' },
    { id: 'v2', label: 'gewichtige' },
  ] },
  solution: { preferred: ['v1'] },
  feedback: { onCorrect: 'Stark.' },
  display: { metric: 'none' },
}

const radios = () => [...document.querySelectorAll('input[type="radio"].course-radio-input')]
const checkBtn = () => document.querySelector('.course-check-btn')

describe('VariantTask – native Radios (F3)', () => {
  it('rendert native Radios mit gemeinsamem name', () => {
    render(<VariantTask task={TASK} index="1" onChecked={vi.fn()} />)
    const r = radios()
    expect(r).toHaveLength(2)
    expect(r.every((el) => el.name === 'variant-tv1')).toBe(true)
    expect(r.some((el) => el.checked)).toBe(false)
  })

  it('Auswahl setzt checked + aktiviert „Prüfen"', () => {
    render(<VariantTask task={TASK} index="1" onChecked={vi.fn()} />)
    expect(checkBtn().disabled).toBe(true)
    fireEvent.click(radios()[0])
    expect(radios()[0].checked).toBe(true)
    expect(checkBtn().disabled).toBe(false)
  })

  it('nach „Prüfen" sind die Radios gesperrt (disabled)', () => {
    const onChecked = vi.fn()
    render(<VariantTask task={TASK} index="1" onChecked={onChecked} />)
    fireEvent.click(radios()[0])
    fireEvent.click(checkBtn())
    expect(radios().every((el) => el.disabled)).toBe(true)
    expect(onChecked).toHaveBeenCalledWith(true) // v1 ist preferred
  })
})
