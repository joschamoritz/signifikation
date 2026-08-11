import { describe, it, expect } from 'vitest'
import {
  VALID_MODES,
  REQUIRED_FNS,
  getMode,
  hasMode,
  assertCompleteMode,
  scoreSubmission,
} from '../classroom/modes/index.js'

describe('classroom modes registry (P2)', () => {
  it('registriert genau die vier bekannten Modi', () => {
    expect([...VALID_MODES].sort()).toEqual(
      ['kollokationen', 'lueckenfueller', 'wortzwilling', 'zeitenwende'].sort(),
    )
  })

  it('jeder registrierte Modus implementiert alle Pflicht-Funktionen', () => {
    for (const id of VALID_MODES) {
      const mode = getMode(id)
      expect(mode).toBeTruthy()
      for (const fn of REQUIRED_FNS) {
        expect(typeof mode[fn]).toBe('function')
      }
    }
  })

  it('getMode/hasMode liefern null/false fuer unbekannten Modus', () => {
    expect(getMode('gibtsnicht')).toBeNull()
    expect(hasMode('gibtsnicht')).toBe(false)
    expect(hasMode('kollokationen')).toBe(true)
  })

  // Kern der Konsistenzpruefung: ein unvollstaendiger Modus schlaegt LAUT fehl,
  // statt still Leerdaten zu liefern.
  it('assertCompleteMode wirft bei fehlender Pflicht-Funktion', () => {
    const incomplete = { id: 'kaputt', score: () => {} } // alle anderen fns fehlen
    expect(() => assertCompleteMode(incomplete)).toThrow(/unvollstaendig/)
  })

  it('assertCompleteMode wirft bei fehlender id', () => {
    expect(() => assertCompleteMode({})).toThrow(/gueltige id/)
  })

  it('scoreSubmission dispatcht ueber die Registry und wirft bei unbekanntem Modus', () => {
    expect(() => scoreSubmission({ mode: 'gibtsnicht', contentSnapshot: {}, rawAnswer: {} }))
      .toThrow(/unbekannter Modus/)
  })
})

// Guideline 1.2: Schueler-Freitext kann als „Haeufigste Fehlantwort“ in der
// Nachbesprechung landen — ggf. am Beamer vor der Klasse. Der Lueckenfueller
// hat ZWEI Freitext-Runden: `free` (ein Feld) und `double` (zwei Felder).
// `double` war zunaechst ungefiltert; dieser Block haelt beide Pfade fest.
describe('lueckenfueller: Freitext-Distraktoren werden gefiltert', () => {
  const lf = getMode('lueckenfueller')

  function row(detail) {
    return { detail_json: JSON.stringify(detail), correct: 0 }
  }

  it('free: gesperrter Text wird ersetzt', () => {
    expect(lf.extractDistractors(row({ type: 'free', value: 'Arschloch' })))
      .toEqual(['[gefiltert]'])
  })

  it('free: harmlose Fehlantwort bleibt stehen', () => {
    expect(lf.extractDistractors(row({ type: 'free', value: 'werfen' })))
      .toEqual(['werfen'])
  })

  it('double: gesperrter Slot wird ersetzt, harmloser bleibt', () => {
    const detail = {
      type: 'double',
      slots: [
        { index: 0, expected: 'stellen', given: 'Arschloch', correct: false },
        { index: 1, expected: 'treffen', given: 'werfen', correct: false },
      ],
    }
    expect(lf.extractDistractors(row(detail))).toEqual(['[gefiltert]', 'werfen'])
  })

  it('double: Leetspeak und Trennzeichen werden mitgefangen', () => {
    const detail = {
      type: 'double',
      slots: [{ index: 0, expected: 'stellen', given: 'f.u.c.k', correct: false }],
    }
    expect(lf.extractDistractors(row(detail))).toEqual(['[gefiltert]'])
  })

  it('double: richtige Slots liefern gar keinen Distraktor', () => {
    const detail = {
      type: 'double',
      slots: [{ index: 0, expected: 'stellen', given: 'stellen', correct: true }],
    }
    expect(lf.extractDistractors(row(detail))).toEqual([])
  })
})
