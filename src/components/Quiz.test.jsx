// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Quiz from './Quiz'

// ── Fixtures ───────────────────────────────────────────────────────────────
function makeLemma(overrides = {}) {
  return {
    id: 'lemma-test',
    lemma: 'Wandel',
    pos: 'Substantiv',
    definition: 'Veränderung',
    ipa: 'ˈvan.dl̩',
    runden: {
      kollokatoren: [
        { wort: 'eins',   rang: 1,  log_dice: 12.0 },
        { wort: 'zwei',   rang: 2,  log_dice: 11.5 },
        { wort: 'drei',   rang: 3,  log_dice: 11.0 },
        { wort: 'vier',   rang: 4,  log_dice: 9.0  },
        { wort: 'fuenf',  rang: 5,  log_dice: 8.5  },
        { wort: 'sechs',  rang: 6,  log_dice: 7.0  },
        { wort: 'sieben', rang: 7,  log_dice: 6.5  },
        { wort: 'acht',   rang: 8,  log_dice: 6.0  },
        { wort: 'neun',   rang: 9,  log_dice: 5.5  },
        { wort: 'zehn',   rang: 10, log_dice: 5.0  },
      ],
    },
    rundenInfo: [],
    ...overrides,
  }
}

// Liefert die <button> innerhalb von .options-grid (Belege-Buttons o.ä. ausschließen)
function getOption(wort) {
  const options = document.querySelectorAll('.options-grid .option')
  return [...options].find(el => el.textContent.includes(wort))
}

describe('Quiz – Smoketest', () => {
  beforeEach(() => {
    // fetch nie aufgerufen werden (useBelege wird nur nach Klick auf Option
    // im submitted-State aktiv) – Stub als Sicherheitsnetz
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mountet mit Fixture ohne Crash und zeigt Lemma + Optionen', () => {
    const onRoundComplete = vi.fn()
    render(
      <Quiz
        lemma={makeLemma()}
        currentRound={0}
        onRoundComplete={onRoundComplete}
      />
    )

    expect(document.querySelector('.quiz-lemma-word').textContent).toBe('Wandel')
    expect(screen.getByText('Kollokationen')).toBeTruthy()
    expect(document.querySelectorAll('.options-grid .option')).toHaveLength(10)
    expect(onRoundComplete).not.toHaveBeenCalled()
  })

  it('überspringt Runde mit 0 Punkten wenn keine Kollokatoren vorhanden', () => {
    const onRoundComplete = vi.fn()
    render(
      <Quiz
        lemma={makeLemma({ runden: { kollokatoren: [] } })}
        currentRound={0}
        onRoundComplete={onRoundComplete}
      />
    )

    expect(onRoundComplete).toHaveBeenCalledWith(0)
  })

  it('Submit-Pfad: alle Top-3 gewählt → onRoundComplete(10)', () => {
    const onRoundComplete = vi.fn()
    render(
      <Quiz
        lemma={makeLemma()}
        currentRound={0}
        onRoundComplete={onRoundComplete}
      />
    )

    // 3 + 3 + 3 + Bonus = 10 (Klick-Reihenfolge spielt keine Rolle)
    fireEvent.click(getOption('eins'))
    fireEvent.click(getOption('zwei'))
    fireEvent.click(getOption('drei'))

    const auswerten = screen.getByRole('button', { name: 'Auswerten' })
    expect(auswerten.disabled).toBe(false)
    fireEvent.click(auswerten)

    // onRoundComplete erst nach Weiter
    expect(onRoundComplete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))

    expect(onRoundComplete).toHaveBeenCalledOnce()
    expect(onRoundComplete).toHaveBeenCalledWith(10)
  })

  it('Submit-Pfad: gemischte Picks (nearPool + midPool) → Teilpunkte', () => {
    const onRoundComplete = vi.fn()
    render(
      <Quiz
        lemma={makeLemma()}
        currentRound={0}
        onRoundComplete={onRoundComplete}
      />
    )

    // sechs(Rang 6)=2 + sieben(Rang 7)=2 + acht(Rang 8)=1 = 5
    fireEvent.click(getOption('sechs'))
    fireEvent.click(getOption('sieben'))
    fireEvent.click(getOption('acht'))

    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))

    expect(onRoundComplete).toHaveBeenCalledWith(5)
  })

  it('Auswerten ist deaktiviert bevor 3 Wörter gewählt sind', () => {
    render(
      <Quiz
        lemma={makeLemma()}
        currentRound={0}
        onRoundComplete={vi.fn()}
      />
    )

    const auswerten = screen.getByRole('button', { name: 'Auswerten' })
    expect(auswerten.disabled).toBe(true)

    fireEvent.click(getOption('eins'))
    fireEvent.click(getOption('zwei'))
    expect(auswerten.disabled).toBe(true)

    fireEvent.click(getOption('drei'))
    expect(auswerten.disabled).toBe(false)
  })
})
