// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Zeitenwende from './Zeitenwende'

// ── Fixtures ───────────────────────────────────────────────────────────────
// Zeitenwende erwartet exakt 10 Wörter (TOTAL = 10).
function makeData() {
  return {
    lemma: 'Wandel',
    ipa: 'ˈvan.dl̩',
    definitionen: ['Veränderung'],
    notiz: '',
    link: '',
    words: [
      { wort: 'w1',  periode: 'pre'  },
      { wort: 'w2',  periode: 'post' },
      { wort: 'w3',  periode: 'pre'  },
      { wort: 'w4',  periode: 'post' },
      { wort: 'w5',  periode: 'pre'  },
      { wort: 'w6',  periode: 'post' },
      { wort: 'w7',  periode: 'pre'  },
      { wort: 'w8',  periode: 'post' },
      { wort: 'w9',  periode: 'pre'  },
      { wort: 'w10', periode: 'post' },
    ],
  }
}

describe('Zeitenwende – Smoketest', () => {
  beforeEach(() => {
    // Belege-Endpoint wird nach jeder Entscheidung gefetcht
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mountet mit Fixture ohne Crash und zeigt erstes Wort + Fortschritt', () => {
    render(
      <Zeitenwende
        data={makeData()}
        onBack={vi.fn()}
        onFinish={vi.fn()}
      />
    )

    expect(document.querySelector('.zw-lemma').textContent).toBe('Wandel')
    expect(document.querySelector('.zw-word-card').textContent).toContain('w1')
    expect(document.querySelector('.zw-progress-count').textContent).toContain('1 / 10')
  })

  it('rendert direkt Ergebnisansicht wenn savedResult vorhanden', () => {
    render(
      <Zeitenwende
        data={makeData()}
        onBack={vi.fn()}
        onFinish={vi.fn()}
        savedResult={{
          score: 5,
          answers: ['pre', 'post', 'pre', 'post', 'pre', 'post', 'pre', 'post', 'pre', 'post'],
        }}
      />
    )

    expect(document.querySelector('.zw-results-list')).toBeTruthy()
    expect(document.querySelector('.zw-word-card')).toBeNull()
  })

  it('Click-Auswahl: Klick auf "Vor 2000" zeigt Feedback für pre-Wort', () => {
    render(
      <Zeitenwende
        data={makeData()}
        onBack={vi.fn()}
        onFinish={vi.fn()}
      />
    )

    // w1 = 'pre' → Klick auf "Vor 2000" sollte korrekt sein
    fireEvent.click(screen.getByRole('button', { name: 'Vor 2000' }))
    expect(document.querySelector('.zw-feedback-label--correct')).toBeTruthy()
  })

  it('Submit-Pfad: 10 Runden via Tastatur durchspielen → onFinish mit score=10', () => {
    const onFinish = vi.fn()
    const data = makeData()
    render(
      <Zeitenwende
        data={data}
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    for (let i = 0; i < 10; i++) {
      const key = data.words[i].periode === 'pre' ? 'ArrowLeft' : 'ArrowRight'
      fireEvent.keyDown(window, { key })
      // Feedback-Phase → Enter zum Weiterschalten
      fireEvent.keyDown(window, { key: 'Enter' })
    }

    expect(onFinish).toHaveBeenCalledOnce()
    const arg = onFinish.mock.calls[0][0]
    expect(arg.score).toBe(10)
    expect(arg.answers).toHaveLength(10)
  })

  it('Submit-Pfad: alle Antworten falsch → onFinish mit score=0', () => {
    const onFinish = vi.fn()
    const data = makeData()
    render(
      <Zeitenwende
        data={data}
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    for (let i = 0; i < 10; i++) {
      // Gegenteil der korrekten Antwort
      const key = data.words[i].periode === 'pre' ? 'ArrowRight' : 'ArrowLeft'
      fireEvent.keyDown(window, { key })
      fireEvent.keyDown(window, { key: 'Enter' })
    }

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0].score).toBe(0)
  })
})
