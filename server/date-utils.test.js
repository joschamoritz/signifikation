import { describe, expect, it } from 'vitest'
import { berlinTag, berlinMitternachtMs, plusTage, tageVonBis, tageZwischen } from './date-utils.js'

// Die Auswertung zählt in Kalendertagen der Berliner Zeit. Die Fälle zwischen 0 und 2 Uhr sind die kritischen:
// Dort liegt der UTC-Tag noch einen Tag zurück (Sommerzeit: bis 2 Uhr, Winterzeit: bis 1 Uhr).
describe('berlinTag', () => {
  it('Sommerzeit: 22:30 UTC ist schon der nächste Berliner Tag (00:30 Uhr)', () => {
    expect(berlinTag(Date.UTC(2026, 6, 14, 22, 30))).toBe('2026-07-15')
  })

  it('Sommerzeit: 21:59 UTC ist noch derselbe Tag (23:59 Uhr)', () => {
    expect(berlinTag(Date.UTC(2026, 6, 14, 21, 59, 59))).toBe('2026-07-14')
  })

  it('Winterzeit: 23:30 UTC ist schon der nächste Berliner Tag (00:30 Uhr)', () => {
    expect(berlinTag(Date.UTC(2026, 0, 14, 23, 30))).toBe('2026-01-15')
  })

  it('Winterzeit: 22:59 UTC ist noch derselbe Tag (23:59 Uhr)', () => {
    expect(berlinTag(Date.UTC(2026, 0, 14, 22, 59, 59))).toBe('2026-01-14')
  })

  it('Silvester um 23:30 UTC ist schon Neujahr in Berlin', () => {
    expect(berlinTag(Date.UTC(2026, 11, 31, 23, 30))).toBe('2027-01-01')
  })

  it('nimmt auch ein Date', () => {
    expect(berlinTag(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15')
  })
})

describe('berlinMitternachtMs', () => {
  it('Sommer: Mitternacht Berlin ist 22:00 UTC am Vortag', () => {
    expect(berlinMitternachtMs('2026-07-15')).toBe(Date.UTC(2026, 6, 14, 22))
  })

  it('Winter: Mitternacht Berlin ist 23:00 UTC am Vortag', () => {
    expect(berlinMitternachtMs('2026-01-15')).toBe(Date.UTC(2026, 0, 14, 23))
  })

  it('Umstellung auf Sommerzeit (29.03.2026, 2 Uhr): Mitternacht ist noch Winterzeit', () => {
    expect(berlinMitternachtMs('2026-03-29')).toBe(Date.UTC(2026, 2, 28, 23))
    // Der Tag danach beginnt schon in Sommerzeit
    expect(berlinMitternachtMs('2026-03-30')).toBe(Date.UTC(2026, 2, 29, 22))
  })

  it('Umstellung auf Winterzeit (25.10.2026, 3 Uhr): Mitternacht ist noch Sommerzeit', () => {
    expect(berlinMitternachtMs('2026-10-25')).toBe(Date.UTC(2026, 9, 24, 22))
    expect(berlinMitternachtMs('2026-10-26')).toBe(Date.UTC(2026, 9, 25, 23))
  })

  it('ist die Gegenstelle zu berlinTag: eine Millisekunde davor ist der Vortag', () => {
    for (const tag of ['2026-01-15', '2026-03-29', '2026-07-15', '2026-10-25', '2026-12-31']) {
      const ms = berlinMitternachtMs(tag)
      expect(berlinTag(ms)).toBe(tag)
      expect(berlinTag(ms - 1)).toBe(plusTage(tag, -1))
    }
  })
})

describe('Kalendertage rechnen', () => {
  it('plusTage über Monats-, Jahres- und Schaltjahrgrenzen', () => {
    expect(plusTage('2026-10-24', -29)).toBe('2026-09-25')
    expect(plusTage('2027-01-01', -1)).toBe('2026-12-31')
    expect(plusTage('2028-02-28', 1)).toBe('2028-02-29')
    expect(plusTage('2026-03-28', 2)).toBe('2026-03-30') // über die Sommerzeit-Umstellung
  })

  it('tageVonBis liefert jeden Tag einschließlich beider Enden', () => {
    expect(tageVonBis('2026-10-22', '2026-10-24')).toEqual(['2026-10-22', '2026-10-23', '2026-10-24'])
    expect(tageVonBis('2026-10-24', '2026-10-24')).toEqual(['2026-10-24'])
    expect(tageVonBis('2026-10-25', '2026-10-24')).toEqual([])
    expect(tageVonBis('2025-10-25', '2026-10-24')).toHaveLength(365)
  })

  it('tageZwischen ist unabhängig von der Sommerzeit', () => {
    expect(tageZwischen('2026-03-28', '2026-03-30')).toBe(2)
    expect(tageZwischen('2026-10-24', '2026-10-26')).toBe(2)
  })
})
