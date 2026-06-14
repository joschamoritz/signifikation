import { describe, it, expect } from 'vitest'
import { isBlockedNickname } from '../classroom/nickname-filter.js'

describe('nickname-filter (H2)', () => {
  it('blockt unmissverständliche Beleidigungen — auch mit Trennern/Leet', () => {
    const blocked = [
      'Arschloch', 'arsch loch', 'A.r.s.c.h.l.o.c.h', '@rschloch',
      'f u c k', 'FUCK', 'Hurensohn', 'Hur3nsohn', 'N3ger', 'wichser',
      'du HURE', 'spasti',
    ]
    for (const n of blocked) {
      expect(isBlockedNickname(n), `sollte blocken: ${n}`).toBe(true)
    }
  })

  it('lässt legitime Namen durch (kein Teilwort-Matching → keine False Positives)', () => {
    const allowed = [
      'Anna', 'Max M.', 'Cassie', 'Klassenfuchs', 'Assistent', 'Hans',
      'Marschall', 'Lena_42', 'Die Coole 7', '',
    ]
    for (const n of allowed) {
      expect(isBlockedNickname(n), `sollte durchlassen: ${n}`).toBe(false)
    }
  })

  it('behandelt leere/undefined Eingaben als nicht blockiert', () => {
    expect(isBlockedNickname(undefined)).toBe(false)
    expect(isBlockedNickname(null)).toBe(false)
    expect(isBlockedNickname('')).toBe(false)
  })
})
