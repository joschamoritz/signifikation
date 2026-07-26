// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Lueckenfueller from './Lueckenfueller'

// ── Fixtures: drei Runden, eine je Typ ─────────────────────────────────────
function makeChoiceRound() {
  return {
    type: 'choice',
    satzMitLuecke: 'Das ist ein _____ Test.',
    kollokator: 'guter',
    token: 'guter',
    optionen: ['guter', 'schlechter', 'mittelmäßiger', 'unbekannter'],
    punkte: 3,
    quelle: 'Testkorpus',
  }
}

function makeDoubleRound() {
  return {
    type: 'double',
    sentences: [
      { satzMitLuecke: 'Erste Lücke _____', kollokator: 'alpha', token: 'alpha', quelle: 'Q1' },
      { satzMitLuecke: 'Zweite Lücke _____', kollokator: 'beta',  token: 'beta',  quelle: 'Q2' },
    ],
    optionen: ['alpha', 'beta', 'gamma', 'delta'],
    punkte: 2,
  }
}

function makeFreeRound() {
  return {
    type: 'free',
    satzMitLuecke: 'Eingabe _____ hier.',
    kollokator: 'antwort',
    token: 'antwort',
    punkte: 3,
    quelle: 'Testkorpus',
  }
}

describe('Lueckenfueller – Smoketest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mountet mit Fixture (alle drei Rundentypen) ohne Crash', () => {
    const data = [makeChoiceRound(), makeDoubleRound(), makeFreeRound()]
    render(
      <Lueckenfueller
        data={data}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={vi.fn()}
      />
    )

    expect(screen.getByText('Wandel')).toBeTruthy()
    expect(screen.getByText('Lückenfüller')).toBeTruthy()
    // Erste Runde ist Choice → Auswahl-Label
    expect(screen.getByText('Auswahl')).toBeTruthy()
    // 3 Runden-Dots
    expect(document.querySelectorAll('.round-dot')).toHaveLength(3)
  })

  it('rendert direkt Ergebnisansicht wenn savedResult vorhanden', () => {
    const data = [makeChoiceRound(), makeDoubleRound(), makeFreeRound()]
    render(
      <Lueckenfueller
        data={data}
        lemmaName="Wandel"
        onBack={vi.fn()}
        savedResult={{ scores: [3, 2, 3] }}
        onFinish={vi.fn()}
      />
    )

    // Ergebnisansicht zeigt Summary-Runden statt Spielfläche
    expect(document.querySelector('.lf-results-rounds')).toBeTruthy()
    expect(document.querySelector('.lf-options-grid')).toBeNull()
    // 8 / 8 → Gold-Banner
    expect(document.querySelector('.results-score-num').textContent).toBe('8')
  })

  it('mountet einzelne Choice-Runde und ruft onFinish bei korrekter Antwort', () => {
    const onFinish = vi.fn()
    render(
      <Lueckenfueller
        data={[makeChoiceRound()]}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'guter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Ergebnis ansehen/ }))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0]).toEqual({ score: 3, scores: [3] })
  })

  it('mountet einzelne Double-Runde und ruft onFinish bei korrekter Zuordnung', () => {
    const onFinish = vi.fn()
    render(
      <Lueckenfueller
        data={[makeDoubleRound()]}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    // activeSlot = 0 → 'alpha' füllt Lücke 1
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    // activeSlot = 1 → 'beta' füllt Lücke 2
    fireEvent.click(screen.getByRole('button', { name: 'beta' }))

    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0]).toEqual({ score: 2, scores: [2] })
  })

  it('mountet einzelne Free-Runde und ruft onFinish bei korrekter Eingabe', () => {
    const onFinish = vi.fn()
    render(
      <Lueckenfueller
        data={[makeFreeRound()]}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    const input = document.querySelector('.lf-free-input')
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'antwort' } })

    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Ergebnis ansehen/ }))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0]).toEqual({ score: 3, scores: [3] })
  })

  it('Free-Runde: falsche Eingabe → score=0', () => {
    const onFinish = vi.fn()
    render(
      <Lueckenfueller
        data={[makeFreeRound()]}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    fireEvent.change(document.querySelector('.lf-free-input'), {
      target: { value: 'voellig-falsch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Ergebnis ansehen/ }))

    expect(onFinish).toHaveBeenCalledWith({ score: 0, scores: [0] })
  })

  // Regression: die Mindestlaenge fuer die startsWith-Toleranz galt nur der
  // Loesung, nicht der Eingabe — bei kollokator „antwort“ zaehlte deshalb jedes
  // Praefix, auch ein einzelner Buchstabe.
  it.each(['a', 'an', 'ant'])('Free-Runde: Praefix „%s“ ist zu kurz → score=0', (eingabe) => {
    const onFinish = vi.fn()
    render(
      <Lueckenfueller
        data={[makeFreeRound()]}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    fireEvent.change(document.querySelector('.lf-free-input'), { target: { value: eingabe } })
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Ergebnis ansehen/ }))

    expect(onFinish).toHaveBeenCalledWith({ score: 0, scores: [0] })
  })

  it('Free-Runde: Flexionsform ab 4 Zeichen zaehlt weiterhin → volle Punkte', () => {
    const onFinish = vi.fn()
    render(
      <Lueckenfueller
        data={[makeFreeRound()]}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    // „antworten“ vs. Loesung „antwort“ — gemeinsamer Stamm >= 4 Zeichen
    fireEvent.change(document.querySelector('.lf-free-input'), { target: { value: 'antworten' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Ergebnis ansehen/ }))

    expect(onFinish).toHaveBeenCalledWith({ score: 3, scores: [3] })
  })

  it('Submit-Pfad: alle drei Rundentypen hintereinander → onFinish mit Gesamt-Score', () => {
    const onFinish = vi.fn()
    const data = [makeChoiceRound(), makeDoubleRound(), makeFreeRound()]
    render(
      <Lueckenfueller
        data={data}
        lemmaName="Wandel"
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    // Runde 1: Choice – korrekt
    fireEvent.click(screen.getByRole('button', { name: 'guter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))

    // Runde 2: Double – beide korrekt
    fireEvent.click(screen.getByRole('button', { name: 'alpha' }))
    fireEvent.click(screen.getByRole('button', { name: 'beta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }))

    // Runde 3: Free – korrekt (letzte Runde → "Ergebnis ansehen")
    fireEvent.change(document.querySelector('.lf-free-input'), {
      target: { value: 'antwort' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Auswerten' }))
    fireEvent.click(screen.getByRole('button', { name: /Ergebnis ansehen/ }))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0]).toEqual({ score: 8, scores: [3, 2, 3] })
  })
})
