// @vitest-environment happy-dom
// A11y-Bausteine (Bündel A): Aufgaben-Badge als Überschrift (Desktop-Navigation)
// und dauerhaft gemountete Feedback-Live-Region.
import { render, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TaskHead, FeedbackRegion, FeedbackBlock } from './TaskShell'

afterEach(cleanup)

const TASK = { prompt: 'Frage', metasprache: ['Kollokation'], feedback: { onCorrect: 'Stark.' } }

describe('TaskShell – A11y', () => {
  it('TaskHead rendert das Badge als <h3> (Screenreader-Navigation)', () => {
    render(<TaskHead task={TASK} index="1 a)" />)
    const h = document.querySelector('h3.course-task-format')
    expect(h).toBeTruthy()
    expect(h.textContent).toBe('Aufgabe 1 a)')
  })

  it('TaskHead unterdrückt das Badge bei index=false (Pager liefert eigene Überschrift)', () => {
    render(<TaskHead task={TASK} index={false} />)
    expect(document.querySelector('.course-task-format')).toBeNull()
  })

  it('FeedbackRegion ist auch leer gemountet und trägt aria-live', () => {
    render(<FeedbackRegion>{false}</FeedbackRegion>)
    const region = document.querySelector('.course-feedback-live')
    expect(region).toBeTruthy()
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('role')).toBe('status')
    expect(region.children.length).toBe(0) // leer, aber im DOM
  })

  it('FeedbackBlock trägt selbst KEIN role/aria-live (die Region ist die Live-Region)', () => {
    render(<FeedbackRegion><FeedbackBlock task={TASK} correct={true} /></FeedbackRegion>)
    const fb = document.querySelector('.course-feedback')
    expect(fb.getAttribute('aria-live')).toBeNull()
    expect(fb.getAttribute('role')).toBeNull()
    // genau eine Live-Region (kein verschachteltes role=status)
    expect(document.querySelectorAll('[aria-live]').length).toBe(1)
  })
})
