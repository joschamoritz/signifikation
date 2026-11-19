import { describe, it, expect } from 'vitest'
import { kennzahlText, hatBelege, RANG_LEGENDE } from './kennzahlen'

describe('kennzahlText', () => {
  it('zeigt logDice mit Komma und die Belege mit Tausenderpunkt', () => {
    expect(kennzahlText(7.4, 8594)).toBe('7,4 · 8.594 Belege')
    expect(kennzahlText('7', 12)).toBe('7,0 · 12 Belege')
  })

  it('zeigt bei älteren Spieltagen ohne Frequenz nur logDice', () => {
    expect(kennzahlText(6.9)).toBe('6,9')
    expect(kennzahlText(6.9, null)).toBe('6,9')
  })

  it('liefert null ohne logDice', () => {
    expect(kennzahlText(null, 100)).toBeNull()
    expect(kennzahlText(undefined)).toBeNull()
    expect(kennzahlText('')).toBeNull()
  })
})

describe('hatBelege', () => {
  it('erkennt Spieltage mit der neuen Rangfolge an der Frequenz', () => {
    expect(hatBelege([{ wort: 'Titel', frequenz: 8594 }, { wort: 'Preis' }])).toBe(true)
    expect(hatBelege([{ wort: 'Titel', log_dice: 7.4 }])).toBe(false)
    expect(hatBelege(null)).toBe(false)
  })

  it('erklärt die Reihenfolge', () => {
    expect(RANG_LEGENDE).toContain('Häufigkeit × logDice')
  })
})
