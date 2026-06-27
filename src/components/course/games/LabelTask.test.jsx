// @vitest-environment happy-dom
// Funktion zuweisen (LabelTask): Palette wählen → Wörter antippen. Geprüft wird
// die exakte Auswertung über Token-Indizes (S-P-O) und die tolerante
// Wort→Label-Auswertung (Kopf/Dependent ohne Token-Indizes).
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LabelTask from './LabelTask'

afterEach(cleanup)

const chips = () => [...document.querySelectorAll('.course-label-chip')]
const tokens = () => [...document.querySelectorAll('.course-label-token')]
const checkBtn = () => document.querySelector('.course-check-btn')
const chipByText = (t) => chips().find((el) => el.textContent.trim() === t)

const SPO_TASK = {
  id: 'tl1',
  level: 'DaZ',
  payload: { sentence: 'Das Gericht trifft eine Entscheidung.', labels: ['S', 'P'], markTask: 'S-P-O' },
  solution: { spans: [
    { text: 'Das Gericht', tokenRange: [0, 2], label: 'S' },
    { text: 'trifft', tokenRange: [2, 3], label: 'P' },
  ] },
  feedback: { onCorrect: 'Gut.' },
  display: { metric: 'none' },
}

const DEP_TASK = {
  id: 'tl2',
  level: 'SekII',
  payload: {
    sentence: 'Das Gremium muss eine Entscheidung treffen.',
    labels: ['Kopf', 'Dependent'],
    markTask: 'kopf-dependent',
    labelWords: { Kopf: 'treffen', Dependent: 'Entscheidung' },
  },
  solution: { spans: [{ label: 'Kopf' }, { label: 'Dependent' }] },
  feedback: { onCorrect: 'Korrekt.' },
  display: { metric: 'none' },
}

describe('LabelTask – Funktion zuweisen', () => {
  it('S-P-O: korrekte Zuordnung über Token-Indizes → onChecked(true)', () => {
    const onChecked = vi.fn()
    render(<LabelTask task={SPO_TASK} index="1" onChecked={onChecked} />)
    // S auf „Das" + „Gericht"
    fireEvent.click(chipByText('S'))
    fireEvent.click(tokens()[0])
    fireEvent.click(tokens()[1])
    // P auf „trifft"
    fireEvent.click(chipByText('P'))
    fireEvent.click(tokens()[2])
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(true)
  })

  it('S-P-O: falsche Zuordnung → onChecked(false)', () => {
    const onChecked = vi.fn()
    render(<LabelTask task={SPO_TASK} index="1" onChecked={onChecked} />)
    fireEvent.click(chipByText('S'))
    fireEvent.click(tokens()[2]) // „trifft" fälschlich als S
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(false)
  })

  it('Kopf/Dependent: tolerante Wort→Label-Auswertung → onChecked(true)', () => {
    const onChecked = vi.fn()
    render(<LabelTask task={DEP_TASK} index="1" onChecked={onChecked} />)
    const idxOf = (w) => tokens().findIndex((el) => el.textContent.replace(/[^A-Za-zÄÖÜäöü]/g, '').startsWith(w))
    fireEvent.click(chipByText('Kopf'))
    fireEvent.click(tokens()[idxOf('treffen')])
    fireEvent.click(chipByText('Dependent'))
    fireEvent.click(tokens()[idxOf('Entscheidung')])
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(true)
  })
})
