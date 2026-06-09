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
