// @vitest-environment happy-dom
// Verifiziert den mobilen Aufgaben-Pager (eine Aufgabe pro Bildschirm,
// Weiter/Zurück, Fokus-Management, „Eigenes Lemma" als Schlussscreen).
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UebenPager } from './StationDetail'

afterEach(cleanup)

// Minimal-Tasks mit unbekanntem Format → TaskPlayer rendert seinen Fallback,
// ohne echte Payload zu brauchen. Der Pager kümmert sich nur um Navigation.
const TASKS = [
  { id: 't1', format: 'FX', prompt: 'Erste Aufgabe' },
  { id: 't2', format: 'FX', prompt: 'Zweite Aufgabe' },
]
const LABELS = ['1 a)', '1 b)']

function renderPager(props = {}) {
  return render(
    <UebenPager
      tasks={TASKS}
      labels={LABELS}
      niveau="sek2"
      lemma={null}
      lemmaLead={<p>Lemma-Lead</p>}
      lemmaBar={<div data-testid="lemma-bar">Lemma-Bar</div>}
      {...props}
    />,
  )
}

const heading = () => document.querySelector('.course-pager-heading')
const nextBtn = () => document.querySelector('.course-pager-btn--next')
const prevBtn = () => document.querySelector('.course-pager-btn--prev')
const progressLabel = () => document.querySelector('.course-progress-label')
const progressFill = () => document.querySelector('.course-progress-fill')

describe('UebenPager', () => {
  it('zeigt anfangs die erste Aufgabe; Zurück deaktiviert, Weiter aktiv', () => {
    renderPager()
    expect(heading().textContent).toContain('Aufgabe 1 a)')
    // sr-only-Positionsansage in der Überschrift
    expect(heading().textContent).toContain('Aufgabe 1 von 2')
    expect(progressLabel().textContent).toBe('Aufgabe 1 von 2')
    expect(progressFill().style.width).toBe('50%')
    expect(prevBtn().disabled).toBe(true)
    expect(nextBtn().disabled).toBe(false)
    expect(nextBtn().textContent).toBe('Weiter')
  })

  it('Fortschrittsleiste ist für AT versteckt (aria-hidden, kein progressbar)', () => {
    renderPager()
    expect(document.querySelector('.course-progress').getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('blättert vor und setzt den Fokus auf die neue Überschrift', () => {
    renderPager()
    act(() => { fireEvent.click(nextBtn()) })
    expect(heading().textContent).toContain('Aufgabe 1 b)')
    expect(progressLabel().textContent).toBe('Aufgabe 2 von 2')
    expect(progressFill().style.width).toBe('100%')
    // Fokus-Management: aktive Aufgaben-Überschrift hat den Fokus
    expect(document.activeElement).toBe(heading())
    // letzte Aufgabe → Weiter führt in den Lemma-Schritt
    expect(nextBtn().textContent).toBe('Eigenes Wort')
  })

  it('stiehlt den Fokus beim ersten Render NICHT', () => {
    renderPager()
    expect(document.activeElement).not.toBe(heading())
  })

  it('zeigt „Eigenes Lemma" als letzten Schritt; Weiter dann deaktiviert', () => {
    renderPager()
    act(() => { fireEvent.click(nextBtn()) }) // → Aufgabe 2
    act(() => { fireEvent.click(nextBtn()) }) // → Lemma
    expect(heading().textContent).toBe('Eigenes Wort einsetzen')
    expect(document.querySelector('[data-testid="lemma-bar"]')).toBeTruthy()
    expect(progressLabel().textContent).toBe('Eigenes Wort')
    expect(nextBtn().disabled).toBe(true)
    expect(prevBtn().disabled).toBe(false)
    expect(document.activeElement).toBe(heading())
  })

  it('Zurück führt vom Lemma-Schritt zur letzten Aufgabe zurück', () => {
    renderPager()
    act(() => { fireEvent.click(nextBtn()) })
    act(() => { fireEvent.click(nextBtn()) })
    act(() => { fireEvent.click(prevBtn()) })
    expect(heading().textContent).toContain('Aufgabe 1 b)')
  })

  it('Niveauwechsel setzt zurück auf die erste Aufgabe', () => {
    const { rerender } = renderPager()
    act(() => { fireEvent.click(nextBtn()) })
    expect(heading().textContent).toContain('Aufgabe 1 b)')
    act(() => {
      rerender(
        <UebenPager
          tasks={TASKS}
          labels={LABELS}
          niveau="lk"
          lemma={null}
          lemmaLead={<p>Lemma-Lead</p>}
          lemmaBar={<div data-testid="lemma-bar">Lemma-Bar</div>}
        />,
      )
    })
    expect(heading().textContent).toContain('Aufgabe 1 a)')
  })

  it('unterdrückt das doppelte Aufgaben-Badge im Pager (index=false)', () => {
    renderPager()
    // TaskHead-Badge entfällt; nur die Pager-Überschrift trägt die Nummer.
    expect(document.querySelector('.course-task-format')).toBeNull()
  })
})
