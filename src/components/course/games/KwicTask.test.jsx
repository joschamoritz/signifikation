// @vitest-environment happy-dom
// Konkordanz lesen (KwicTask): echte Belegzeilen + Optionen; geschlossene
// Auswertung gegen solution.correctOptionId. Knoten-Wort wird hervorgehoben.
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KwicTask from './KwicTask'

afterEach(cleanup)

const opts = () => [...document.querySelectorAll('.course-kwic-opt')]
const optByText = (t) => opts().find((el) => el.textContent.trim().startsWith(t))
const checkBtn = () => document.querySelector('.course-check-btn')

const TASK = {
  id: 'tk1',
  level: 'DaZ',
  payload: {
    node: 'Regen',
    lines: [
      { satz: 'Bei dem Unwetter fiel strömender Regen.', quelle: 'Wikipedia' },
      { satz: 'Tagelang prasselte strömender Regen auf das Dach.', quelle: 'DTA' },
    ],
    options: [
      { id: 'c1', label: 'strömend' },
      { id: 'c2', label: 'blau' },
    ],
  },
  solution: { correctOptionId: 'c1' },
  feedback: { byLevel: { DaZ: { onCorrect: 'Genau.' } }, onCorrect: 'Genau.' },
  display: { metric: 'none' },
}

describe('KwicTask – Konkordanz lesen', () => {
  it('rendert Belegzeilen und hebt das Suchwort hervor', () => {
    render(<KwicTask task={TASK} index="1" />)
    expect(document.querySelectorAll('.course-kwic-line').length).toBe(2)
    expect(document.querySelector('.course-kwic-node')).toBeTruthy()
  })

  it('richtige Wahl → onChecked(true)', () => {
    const onChecked = vi.fn()
    render(<KwicTask task={TASK} index="1" onChecked={onChecked} />)
    fireEvent.click(optByText('strömend').querySelector('input'))
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(true)
  })

  it('falsche Wahl → onChecked(false)', () => {
    const onChecked = vi.fn()
    render(<KwicTask task={TASK} index="1" onChecked={onChecked} />)
    fireEvent.click(optByText('blau').querySelector('input'))
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(false)
  })
})
