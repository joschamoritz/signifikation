// @vitest-environment happy-dom
import { render, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WortZwilling from './WortZwilling'

// ── Fixtures ───────────────────────────────────────────────────────────────
function makeData() {
  return {
    wortA: 'Tag',
    wortB: 'Nacht',
    pos: 'Substantiv',
    kollokatoren: [
      { wort: 'a1', zuordnung: 'A' },
      { wort: 'a2', zuordnung: 'A' },
      { wort: 'a3', zuordnung: 'A' },
      { wort: 'a4', zuordnung: 'A' },
      { wort: 'a5', zuordnung: 'A' },
      { wort: 'b1', zuordnung: 'B' },
      { wort: 'b2', zuordnung: 'B' },
      { wort: 'b3', zuordnung: 'B' },
      { wort: 'b4', zuordnung: 'B' },
      { wort: 'b5', zuordnung: 'B' },
    ],
    notiz: '',
    link: '',
  }
}

// Chip in der Bank finden (Bank-Chips haben kein .wz-chip--placed)
function getBankChip(text) {
  const chips = document.querySelectorAll('.wz-bank .wz-chip')
  return [...chips].find(el => el.textContent === text)
}

function getZone(zone /* 'A' | 'B' */) {
  const zones = document.querySelectorAll('.wz-zones .wz-zone')
  return zone === 'A' ? zones[0] : zones[1]
}

describe('WortZwilling – Smoketest', () => {
  beforeEach(() => {
    // IPA-Endpoint (useEffect feuert sofort) – leeres Ergebnis
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mountet mit Fixture ohne Crash und zeigt beide Wörter + 10 Chips', () => {
    render(
      <WortZwilling
        data={makeData()}
        onBack={vi.fn()}
        onFinish={vi.fn()}
      />
    )

    const titles = document.querySelectorAll('.wz-title')
    expect(titles[0].textContent).toBe('Tag')
    expect(titles[1].textContent).toBe('Nacht')
    expect(document.querySelectorAll('.wz-bank .wz-chip')).toHaveLength(10)

    // Auswerten-Button initial deaktiviert
    const submit = document.querySelector('.quiz-cta')
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toContain('Noch 10')
  })

  it('rendert direkt Ergebnisansicht wenn savedResult vorhanden', () => {
    render(
      <WortZwilling
        data={makeData()}
        onBack={vi.fn()}
        onFinish={vi.fn()}
        savedResult={{
          score: 10,
          zoneA: ['a1', 'a2', 'a3', 'a4', 'a5'],
          zoneB: ['b1', 'b2', 'b3', 'b4', 'b5'],
        }}
      />
    )

    // Ergebnisansicht statt Spielfläche – keine Wortbank
    expect(document.querySelector('.wz-bank')).toBeNull()
  })

  it('Submit-Pfad: alle Chips korrekt zuordnen → onFinish mit score=10', () => {
    const onFinish = vi.fn()
    render(
      <WortZwilling
        data={makeData()}
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    // Click-Flow: Chip wählen → Zone klicken
    function placeInZone(word, zone) {
      const chip = getBankChip(word)
      expect(chip).toBeTruthy()
      fireEvent.click(chip)
      fireEvent.click(getZone(zone))
    }

    for (const w of ['a1', 'a2', 'a3', 'a4', 'a5']) placeInZone(w, 'A')
    for (const w of ['b1', 'b2', 'b3', 'b4', 'b5']) placeInZone(w, 'B')

    // Bank ist leer
    expect(document.querySelectorAll('.wz-bank .wz-chip')).toHaveLength(0)

    // Auswerten klickbar
    const submit = document.querySelector('.quiz-cta')
    expect(submit.disabled).toBe(false)
    expect(submit.textContent).toContain('Auswerten')
    fireEvent.click(submit)

    expect(onFinish).toHaveBeenCalledOnce()
    const arg = onFinish.mock.calls[0][0]
    expect(arg.score).toBe(10)
    expect(arg.zoneA.sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
    expect(arg.zoneB.sort()).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
  })

  it('Submit-Pfad: alle Chips vertauscht zuordnen → onFinish mit score=0', () => {
    const onFinish = vi.fn()
    render(
      <WortZwilling
        data={makeData()}
        onBack={vi.fn()}
        onFinish={onFinish}
      />
    )

    function placeInZone(word, zone) {
      fireEvent.click(getBankChip(word))
      fireEvent.click(getZone(zone))
    }

    // A-Wörter in B, B-Wörter in A → 0 Treffer
    for (const w of ['a1', 'a2', 'a3', 'a4', 'a5']) placeInZone(w, 'B')
    for (const w of ['b1', 'b2', 'b3', 'b4', 'b5']) placeInZone(w, 'A')

    fireEvent.click(document.querySelector('.quiz-cta'))

    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish.mock.calls[0][0].score).toBe(0)
  })
})
