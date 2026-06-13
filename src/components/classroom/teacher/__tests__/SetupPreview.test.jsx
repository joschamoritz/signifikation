// @vitest-environment happy-dom
//
// W2-T1 — Teacher-Preview „Schüleransicht testen".
// Deckt ab: öffnet/schließt, sendet KEINE Submission, rendert pro Modus,
// schaltet lokal weiter (Lemma + Lückenfüller-Runden).

import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const previewAssignment = vi.fn()

vi.mock('../hooks/useTeacherSession', () => ({
  previewAssignment: (...args) => previewAssignment(...args),
}))

import SetupPreview from '../components/SetupPreview'

// Server-Antwort-Stub pro Modus (Form == POST /preview-Response).
function previewFor(mode, lemmaCount = 1) {
  const lemmata = []
  for (let i = 0; i < lemmaCount; i++) {
    const base = { id: `l${i}`, lemma: `Wort${i}`, ipa: 'ˈvɔʁt', definition: `Def ${i}` }
    if (mode === 'kollokationen') {
      lemmata.push({ ...base, prompt: { words: ['alpha', 'beta', 'gamma'], definition: `Def ${i}` } })
    } else if (mode === 'wortzwilling') {
      lemmata.push({ ...base, prompt: { wortA: 'links', wortB: 'rechts', words: ['eins', 'zwei'] } })
    } else if (mode === 'zeitenwende') {
      lemmata.push({ ...base, prompt: { words: ['anno', 'heute'] } })
    } else if (mode === 'lueckenfueller') {
      lemmata.push({
        ...base,
        prompt: {
          rounds: [
            { type: 'choice', sentence: 'Ein _____ Satz.', options: ['x', 'y'] },
            { type: 'free', sentence: 'Noch ein Satz.' },
          ],
        },
      })
    }
  }
  return { mode, lemmata }
}

describe('SetupPreview (W2-T1)', () => {
  beforeEach(() => {
    previewAssignment.mockReset()
    // Echtes Netz hart abklemmen — falls doch jemand fetch() ruft, fliegt es auf.
    global.fetch = vi.fn(() => Promise.reject(new Error('fetch darf in der Vorschau nicht aufgerufen werden')))
  })
  afterEach(() => { cleanup() })

  it('rendert die echte Spielkomponente pro Modus', async () => {
    for (const mode of ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']) {
      previewAssignment.mockResolvedValueOnce(previewFor(mode, 1))
      render(<SetupPreview mode={mode} lemmaIds={['l0']} onClose={() => {}} />)
      expect(await screen.findByTestId(`classroom-kiosk-game-${mode}`)).toBeTruthy()
      cleanup()
    }
  })

  it('zeigt den Vorschau-Hinweis und ein Dialog-Element', async () => {
    previewAssignment.mockResolvedValueOnce(previewFor('kollokationen', 1))
    render(<SetupPreview mode="kollokationen" lemmaIds={['l0']} onClose={() => {}} />)
    expect(await screen.findByTestId('classroom-kiosk-game-kollokationen')).toBeTruthy()
    expect(screen.getByTestId('classroom-setup-preview')).toBeTruthy()
    expect(screen.getByText(/Keine echte Session/i)).toBeTruthy()
  })

  it('Schließen ruft onClose', async () => {
    previewAssignment.mockResolvedValueOnce(previewFor('kollokationen', 1))
    const onClose = vi.fn()
    render(<SetupPreview mode="kollokationen" lemmaIds={['l0']} onClose={onClose} />)
    await screen.findByTestId('classroom-kiosk-game-kollokationen')
    fireEvent.click(screen.getByTestId('classroom-preview-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sendet KEINE Submission und schaltet lokal zum nächsten Lemma', async () => {
    previewAssignment.mockResolvedValueOnce(previewFor('kollokationen', 2))
    render(<SetupPreview mode="kollokationen" lemmaIds={['l0', 'l1']} onClose={() => {}} />)
    await screen.findByTestId('classroom-kiosk-game-kollokationen')

    expect(screen.getByTestId('classroom-preview-progress').textContent).toMatch(/Lemma 1 \/ 2/)

    // Echte Quiz-Engine: alle 3 Optionen waehlen, dann Abgeben (No-Op-Submit,
    // nur lokales Weiterschalten zum naechsten Lemma).
    fireEvent.click(screen.getByText('alpha'))
    fireEvent.click(screen.getByText('beta'))
    fireEvent.click(screen.getByText('gamma'))
    fireEvent.click(screen.getByRole('button', { name: 'Abgeben' }))

    await waitFor(() => {
      expect(screen.getByTestId('classroom-preview-progress').textContent).toMatch(/Lemma 2 \/ 2/)
    })

    // previewAssignment genau einmal (beim Laden), fetch NIE.
    expect(previewAssignment).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('Lückenfüller: schaltet lokal durch die Runden', async () => {
    previewAssignment.mockResolvedValueOnce(previewFor('lueckenfueller', 1))
    render(<SetupPreview mode="lueckenfueller" lemmaIds={['l0']} onClose={() => {}} />)
    await screen.findByTestId('classroom-kiosk-game-lueckenfueller')
    expect(screen.getByTestId('classroom-preview-progress').textContent).toMatch(/Runde 1 \/ 2/)

    // Runde 1 (choice): Option wählen + abgeben
    fireEvent.click(screen.getByTestId('classroom-kiosk-lf-choice-x'))
    fireEvent.click(screen.getByTestId('classroom-kiosk-lf-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('classroom-preview-progress').textContent).toMatch(/Runde 2 \/ 2/)
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('zeigt einen Fehler-State, wenn keine Inhalte zurückkommen', async () => {
    previewAssignment.mockResolvedValueOnce({ mode: 'kollokationen', lemmata: [] })
    render(<SetupPreview mode="kollokationen" lemmaIds={['l0']} onClose={() => {}} />)
    expect(await screen.findByTestId('classroom-preview-error')).toBeTruthy()
  })
})
