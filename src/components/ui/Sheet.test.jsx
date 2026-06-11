// @vitest-environment happy-dom
import { render, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sheet from './Sheet'

// ── Helpers ────────────────────────────────────────────────────────────────

function getPanel() {
  return document.querySelector('[role="dialog"]')
}

function fireTransitionEnd(element, propertyName = 'transform') {
  const event = new Event('transitionend', { bubbles: true })
  Object.defineProperty(event, 'propertyName', { value: propertyName })
  fireEvent(element, event)
}

function renderSheet(props = {}) {
  const onClose = props.onClose ?? vi.fn()
  const result = render(
    <Sheet open={true} onClose={onClose} aria-label="Test-Dialog" {...props}>
      <button>Aktion</button>
    </Sheet>
  )
  return { ...result, onClose }
}

describe('Sheet', () => {
  beforeEach(() => {
    // requestAnimationFrame sofort ausführen
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  // ── Rendering ────────────────────────────────────────────────────────────

  it('rendert nichts wenn geschlossen', () => {
    render(
      <Sheet open={false} onClose={vi.fn()} aria-label="Test">
        <button>X</button>
      </Sheet>
    )
    expect(getPanel()).toBeNull()
  })

  it('rendert Dialog-Content wenn geöffnet', () => {
    renderSheet()
    expect(getPanel()).toBeTruthy()
    expect(document.querySelector('.sheet-panel')).toBeTruthy()
  })

  it('setzt aria-label auf dem Panel', () => {
    renderSheet({ 'aria-label': 'Mein Dialog' })
    const panel = getPanel()
    expect(panel).toBeTruthy()
    expect(panel.getAttribute('aria-label')).toBe('Mein Dialog')
  })

  it('Dialog ist fuer assistive Technologien erreichbar (kein aria-hidden-Vorfahre)', () => {
    // Regression (Review 2026-06-11, F-H3): der Backdrop trug aria-hidden
    // und umschloss das role="dialog"-Panel — damit war der komplette
    // Dialog fuer Screenreader unsichtbar.
    renderSheet({ 'aria-label': 'Erreichbar' })
    let el = getPanel()
    expect(el).toBeTruthy()
    while (el) {
      expect(el.getAttribute?.('aria-hidden')).not.toBe('true')
      el = el.parentElement
    }
  })

  // ── data-state ───────────────────────────────────────────────────────────

  it('Panel hat data-state="open" nach dem Öffnen', () => {
    renderSheet()
    const panel = getPanel()
    expect(panel.getAttribute('data-state')).toBe('open')
  })

  it('Panel hat data-variant="bottom" als Standard', () => {
    renderSheet()
    expect(getPanel().getAttribute('data-variant')).toBe('bottom')
  })

  it('Panel hat data-variant="center" bei center-Variante', () => {
    renderSheet({ variant: 'center' })
    expect(getPanel().getAttribute('data-variant')).toBe('center')
  })

  // ── inert-Management ─────────────────────────────────────────────────────

  it('setzt inert auf alle body-Kinder außer dem Portal-Container', () => {
    const sibling = document.createElement('div')
    sibling.id = 'app-root'
    document.body.appendChild(sibling)

    renderSheet()

    expect(sibling.hasAttribute('inert')).toBe(true)
    const portal = document.getElementById('sheet-portal')
    expect(portal?.hasAttribute('inert')).toBeFalsy()
  })

  it('entfernt inert nach transitionend beim Schließen', async () => {
    const sibling = document.createElement('div')
    document.body.appendChild(sibling)

    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet open={true} onClose={onClose} aria-label="Test">
        <button>X</button>
      </Sheet>
    )

    expect(sibling.hasAttribute('inert')).toBe(true)

    rerender(
      <Sheet open={false} onClose={onClose} aria-label="Test">
        <button>X</button>
      </Sheet>
    )

    const panel = getPanel()
    act(() => fireTransitionEnd(panel, 'transform'))

    expect(sibling.hasAttribute('inert')).toBe(false)
  })

  // ── Schließen ─────────────────────────────────────────────────────────────

  it('ruft onClose nach transitionend auf', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet open={true} onClose={onClose} aria-label="Test">
        <button>X</button>
      </Sheet>
    )

    rerender(
      <Sheet open={false} onClose={onClose} aria-label="Test">
        <button>X</button>
      </Sheet>
    )

    const panel = getPanel()
    act(() => fireTransitionEnd(panel, 'transform'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('schließt bei Backdrop-Klick wenn dismissible=true', () => {
    const onClose = vi.fn()
    render(
      <Sheet open={true} onClose={onClose} aria-label="Test" dismissible={true}>
        <button>X</button>
      </Sheet>
    )

    const backdrop = document.querySelector('.sheet-backdrop')
    fireEvent.click(backdrop)

    const panel = getPanel()
    act(() => fireTransitionEnd(panel, 'transform'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('schließt NICHT bei Backdrop-Klick wenn dismissible=false', () => {
    const onClose = vi.fn()
    render(
      <Sheet open={true} onClose={onClose} aria-label="Test" dismissible={false}>
        <button>X</button>
      </Sheet>
    )

    const backdrop = document.querySelector('.sheet-backdrop')
    fireEvent.click(backdrop)

    expect(onClose).not.toHaveBeenCalled()
  })

  // ── Escape-Taste ──────────────────────────────────────────────────────────

  it('schließt bei Escape wenn dismissible=true', () => {
    const onClose = vi.fn()
    render(
      <Sheet open={true} onClose={onClose} aria-label="Test" dismissible={true}>
        <button>X</button>
      </Sheet>
    )

    act(() => fireEvent.keyDown(document, { key: 'Escape' }))

    const panel = getPanel()
    act(() => fireTransitionEnd(panel, 'transform'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('schließt NICHT bei Escape wenn dismissible=false', () => {
    const onClose = vi.fn()
    render(
      <Sheet open={true} onClose={onClose} aria-label="Test" dismissible={false}>
        <button>X</button>
      </Sheet>
    )

    act(() => fireEvent.keyDown(document, { key: 'Escape' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  // ── Fokus-Trap ────────────────────────────────────────────────────────────

  it('fokussiert ersten fokussierbaren Element beim Öffnen', async () => {
    render(
      <Sheet open={true} onClose={vi.fn()} aria-label="Test">
        <button id="btn-first">Erster</button>
        <button id="btn-second">Zweiter</button>
      </Sheet>
    )

    await waitFor(() => {
      expect(document.activeElement?.id).toBe('btn-first')
    })
  })

  it('Tab bleibt im Dialog (zirkuliert zum ersten Element)', async () => {
    const user = userEvent.setup()
    render(
      <Sheet open={true} onClose={vi.fn()} aria-label="Test">
        <button id="btn-a">A</button>
        <button id="btn-b">B</button>
      </Sheet>
    )

    await waitFor(() => expect(document.activeElement?.id).toBe('btn-a'))

    // Tab zum zweiten Button
    await user.tab()
    expect(document.activeElement?.id).toBe('btn-b')

    // Tab zirkuliert zurück zum ersten
    await user.tab()
    expect(document.activeElement?.id).toBe('btn-a')
  })

  it('Shift+Tab zirkuliert rückwärts zum letzten Element', async () => {
    const user = userEvent.setup()
    render(
      <Sheet open={true} onClose={vi.fn()} aria-label="Test">
        <button id="btn-a">A</button>
        <button id="btn-b">B</button>
      </Sheet>
    )

    await waitFor(() => expect(document.activeElement?.id).toBe('btn-a'))

    await user.tab({ shift: true })
    expect(document.activeElement?.id).toBe('btn-b')
  })

  // ── Return Focus ──────────────────────────────────────────────────────────

  it('gibt Fokus an auslösendes Element zurück nach Schließen', async () => {
    const trigger = document.createElement('button')
    trigger.id = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement?.id).toBe('trigger')

    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet open={true} onClose={onClose} aria-label="Test">
        <button>X</button>
      </Sheet>
    )

    rerender(
      <Sheet open={false} onClose={onClose} aria-label="Test">
        <button>X</button>
      </Sheet>
    )

    const panel = getPanel()
    act(() => fireTransitionEnd(panel, 'transform'))

    expect(document.activeElement?.id).toBe('trigger')
  })

  // ── Sub-Komponenten ───────────────────────────────────────────────────────

  it('Sheet.Header rendert Grip-Balken', () => {
    render(
      <Sheet open={true} onClose={vi.fn()} aria-label="Test">
        <Sheet.Header />
      </Sheet>
    )
    expect(document.querySelector('.sheet-grip')).toBeTruthy()
  })

  it('Sheet.Body rendert Inhalt', () => {
    render(
      <Sheet open={true} onClose={vi.fn()} aria-label="Test">
        <Sheet.Body><p>Inhalt</p></Sheet.Body>
      </Sheet>
    )
    expect(document.querySelector('.sheet-body')).toBeTruthy()
    expect(document.querySelector('.sheet-body').textContent).toContain('Inhalt')
  })

  it('Sheet.Footer rendert Inhalt', () => {
    render(
      <Sheet open={true} onClose={vi.fn()} aria-label="Test">
        <Sheet.Footer><button>OK</button></Sheet.Footer>
      </Sheet>
    )
    expect(document.querySelector('.sheet-footer')).toBeTruthy()
  })
})
