// @vitest-environment happy-dom
//
// Backlog 2026-07-14 (Nachbesserung): Kurs-Fortschritt-Reset sitzt jetzt in der
// Anm./Manicula (KursNote) neben der Niveau-Auswahl, nicht mehr im Konto-Tab.
// Nur für Eingeloggte sichtbar (Fortschritt ist ans Konto gebunden).
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/apiFetch', () => ({ apiFetch: vi.fn() }))

import KursNote from './KursNote'
import { apiFetch } from '../utils/apiFetch'

describe('KursNote — Kurs-Fortschritt-Reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })
  afterEach(() => { cleanup() })

  it('zeigt die Niveau-Auswahl immer, den Reset aber nur eingeloggt', () => {
    render(<KursNote footnotesClass="fn" loggedIn={false} />)
    // Niveau-Auswahl da (Segment-Buttons). Das Label heisst seit dem
    // Terminologie-Register „Differenzierungsstufe" statt „Niveaustufe".
    expect(screen.getByRole('group', { name: /differenzierungsstufe/i })).toBeTruthy()
    // Reset NICHT da
    expect(screen.queryByRole('button', { name: /zurücksetzen/i })).toBeNull()
  })

  it('zeigt den Reset-Button, wenn eingeloggt', () => {
    render(<KursNote footnotesClass="fn" loggedIn />)
    expect(screen.getByRole('button', { name: /^zurücksetzen$/i })).toBeTruthy()
  })

  it('verlangt eine Bestätigung und ruft dann DELETE /course/progress auf', async () => {
    apiFetch.mockResolvedValue({ ok: true })
    render(<KursNote footnotesClass="fn" loggedIn />)

    fireEvent.click(screen.getByRole('button', { name: /^zurücksetzen$/i }))
    // Confirm-Schritt: zwei Buttons
    const confirm = screen.getByRole('button', { name: /wirklich zurücksetzen/i })
    expect(screen.getByRole('button', { name: /abbrechen/i })).toBeTruthy()

    fireEvent.click(confirm)
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1)
    })
    const [url, opts] = apiFetch.mock.calls[0]
    expect(url).toMatch(/\/course\/progress$/)
    expect(opts.method).toBe('DELETE')
    // Erfolgsmeldung
    await screen.findByText(/wieder spielbar/i)
  })

  it('zeigt eine Fehlermeldung, wenn der Reset fehlschlägt', async () => {
    apiFetch.mockResolvedValue({ ok: false })
    render(<KursNote footnotesClass="fn" loggedIn />)
    fireEvent.click(screen.getByRole('button', { name: /^zurücksetzen$/i }))
    fireEvent.click(screen.getByRole('button', { name: /wirklich zurücksetzen/i }))
    await screen.findByText(/fehlgeschlagen/i)
  })
})
