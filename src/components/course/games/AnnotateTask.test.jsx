// @vitest-environment happy-dom
// Automatische Annotation (AnnotateTask): den Maschinenfehler antippen.
// Geschlossene Auswertung über das wrong-Flag der Annotation.
import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AnnotateTask from './AnnotateTask'

afterEach(cleanup)

const toks = () => [...document.querySelectorAll('.course-annotate-tok')]
const checkBtn = () => document.querySelector('.course-check-btn')

const TASK = {
  id: 'ta1',
  level: 'SekI',
  payload: {
    annotateTask: 'pos',
    annotations: [
      { text: 'Die', tag: 'Artikel' },
      { text: 'Bank', tag: 'Verb', wrong: true, correctTag: 'Substantiv' },
      { text: 'steht', tag: 'Verb' },
    ],
  },
  solution: {},
  feedback: { byLevel: { SekI: { onCorrect: 'Richtig.' } }, onCorrect: 'Richtig.' },
  display: { metric: 'none' },
}

describe('AnnotateTask – Maschinenfehler finden', () => {
  it('rendert ein Etikett je Wort', () => {
    render(<AnnotateTask task={TASK} index="1" />)
    expect(toks().length).toBe(3)
    expect(document.querySelectorAll('.course-annotate-tag').length).toBe(3)
  })

  it('falsch getaggtes Wort getippt → onChecked(true) + Korrektur sichtbar', () => {
    const onChecked = vi.fn()
    render(<AnnotateTask task={TASK} index="1" onChecked={onChecked} />)
    fireEvent.click(toks()[1]) // „Bank“
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(true)
    expect(document.querySelector('.course-annotate-tag--fix')?.textContent).toContain('Substantiv')
  })

  it('korrekt getaggtes Wort getippt → onChecked(false)', () => {
    const onChecked = vi.fn()
    render(<AnnotateTask task={TASK} index="1" onChecked={onChecked} />)
    fireEvent.click(toks()[2]) // „steht“ (richtig getaggt)
    fireEvent.click(checkBtn())
    expect(onChecked).toHaveBeenCalledWith(false)
  })
})
