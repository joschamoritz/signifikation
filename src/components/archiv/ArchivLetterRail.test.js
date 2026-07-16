import { describe, expect, it } from 'vitest'
import { buildRail } from './ArchivLetterRail'

const A_TO_Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

describe('buildRail — verdichtetes Buchstaben-Register', () => {
  it('zeigt alle Buchstaben ungekürzt, wenn sie in die Zeilen passen', () => {
    const letters = ['A', 'F', 'M', 'Z']
    const rail = buildRail(letters, 20)
    expect(rail.map((r) => r.label)).toEqual(letters)
    expect(rail.every((r) => r.kind === 'letter')).toBe(true)
    // Jedes Item springt zu genau seinem eigenen Buchstaben.
    expect(rail.map((r) => r.target)).toEqual(letters)
  })

  it('dünnt bei Platzmangel aus und behält die Randbuchstaben', () => {
    const rail = buildRail(A_TO_Z, 10)
    expect(rail.length).toBeLessThanOrEqual(10)
    expect(rail.length).toBeLessThan(A_TO_Z.length)
    // Erster und letzter Buchstabe bleiben immer sichtbare Marken.
    expect(rail[0]).toMatchObject({ kind: 'letter', label: 'A' })
    const last = rail[rail.length - 1]
    expect(last).toMatchObject({ kind: 'letter', label: 'Z' })
  })

  it('setzt · Sammelpunkte zwischen die Buchstaben', () => {
    const rail = buildRail(A_TO_Z, 10)
    expect(rail.some((r) => r.kind === 'dot')).toBe(true)
    // Auch Punkte sind ansteuerbar (tragen ein echtes Buchstaben-Ziel).
    expect(rail.every((r) => typeof r.target === 'string' && r.target.length === 1)).toBe(true)
  })

  it('liefert monoton aufsteigende, doppelfreie Ziele', () => {
    const rail = buildRail(A_TO_Z, 12)
    const targets = rail.map((r) => r.target)
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i] > targets[i - 1]).toBe(true) // streng steigend ⇒ keine Duplikate
    }
  })

  it('kommt mit sehr wenigen Zeilen zurecht (Randfall)', () => {
    const rail = buildRail(A_TO_Z, 2)
    expect(rail.map((r) => r.label)).toEqual(['A', 'Z'])
  })
})
