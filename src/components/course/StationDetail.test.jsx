// @vitest-environment happy-dom
// Verifiziert den mobilen Aufgaben-Pager: eine Aufgabe pro Bildschirm,
// Weiter/Zurück, Fokus-Management, Antwort-Erhalt (alle Screens gemountet) und
// Abschluss-Screen mit „erledigt/offen" + Sprung zur nächsten Station.
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
      {...props}
    />,
  )
}

// Alle Aufgaben sind gemountet; aussagekräftig ist nur der sichtbare Screen.
const heading = () => document.querySelector('.course-pager-screen:not([hidden]) .course-pager-heading')
const nextBtn = () => document.querySelector('.course-pager-btn--next')
const prevBtn = () => document.querySelector('.course-pager-btn--prev')
const progressFill = () => document.querySelector('.course-progress-fill')

describe('UebenPager', () => {
  it('zeigt anfangs die erste Aufgabe; Zurück deaktiviert, Weiter aktiv', () => {
    renderPager()
    expect(heading().textContent).toContain('Aufgabe 1 a)')
    // sr-only-Positionsansage in der Überschrift
    expect(heading().textContent).toContain('Aufgabe 1 von 2')
    expect(progressFill().style.width).toBe('50%')
    expect(prevBtn().disabled).toBe(true)
    expect(nextBtn().disabled).toBe(false)
    expect(nextBtn().textContent).toContain('Weiter')
  })

  it('hält alle Aufgaben gemountet (Antwort-Erhalt), inaktive via [hidden]', () => {
    renderPager()
    const screens = [...document.querySelectorAll('.course-pager-screen')]
    // 2 Aufgaben + 1 Abschluss-Screen
    expect(screens.length).toBe(3)
    // Genau einer ist sichtbar (Aufgabe 1), der Rest hidden
    expect(screens.filter(s => !s.hasAttribute('hidden')).length).toBe(1)
    // Beide TaskPlayer sind tatsächlich gerendert (gemountet) → Antworten
    // überstehen das Blättern, weil React-State erhalten bleibt.
    expect(document.querySelectorAll('.course-task').length).toBe(2)
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
    expect(progressFill().style.width).toBe('100%')
    // Fokus-Management: aktive Aufgaben-Überschrift hat den Fokus
    expect(document.activeElement).toBe(heading())
    // letzte Aufgabe → Weiter führt in den Abschluss-Screen
    expect(nextBtn().textContent).toContain('Abschluss')
  })

  it('stiehlt den Fokus beim ersten Render NICHT', () => {
    renderPager()
    expect(document.activeElement).not.toBe(heading())
  })

  it('zeigt den Abschluss-Screen als letzten Schritt; Weiter dann deaktiviert', () => {
    renderPager()
    act(() => { fireEvent.click(nextBtn()) }) // → Aufgabe 2
    act(() => { fireEvent.click(nextBtn()) }) // → Abschluss
    expect(heading().textContent).toBe('Station abgeschlossen')
    // „erledigt/offen": nichts geprüft → 0 von 2
    expect(document.querySelector('.course-pager-end-summary').textContent).toContain('0')
    expect(progressFill().style.width).toBe('100%')
    expect(nextBtn().disabled).toBe(true)
    expect(prevBtn().disabled).toBe(false)
    expect(document.activeElement).toBe(heading())
  })

  it('Abschluss-Screen: Sprung zur nächsten Station ruft Callback', () => {
    const onOpenNextStation = vi.fn()
    renderPager({ orderNo: 1, onOpenNextStation })
    act(() => { fireEvent.click(nextBtn()) })
    act(() => { fireEvent.click(nextBtn()) })
    const cta = document.querySelector('.course-next-station')
    expect(cta.textContent).toContain('Weiter zu Station')
    act(() => { fireEvent.click(cta) })
    expect(onOpenNextStation).toHaveBeenCalledOnce()
  })

  it('Abschluss-Screen ohne Folgestation → Zurück zur Übersicht', () => {
    const onBack = vi.fn()
    renderPager({ orderNo: 5, onOpenNextStation: null, onBack })
    act(() => { fireEvent.click(nextBtn()) })
    act(() => { fireEvent.click(nextBtn()) })
    const cta = document.querySelector('.course-next-station--overview')
    expect(cta).toBeTruthy()
    act(() => { fireEvent.click(cta) })
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('Zurück führt vom Abschluss-Screen zur letzten Aufgabe zurück', () => {
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
