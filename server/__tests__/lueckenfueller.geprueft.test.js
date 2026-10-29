/**
 * Lückenfüller mit Belegprüfung (Stufe 2): Sätze und Lücke kommen aus den geprüften Details,
 * geprüfte Wörter ohne Satz in der Relation fliegen aus dem Pool, ungeprüfte laufen wie bisher.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pool für „Traum“ (Substantiv): ATTR-Adjektive
const POOL = ['süß', 'kühn', 'seltsam', 'schwer', 'wach', 'bang', 'selig', 'leer', 'hold', 'streichen']
  .map((lemma, i) => ({ lemma, pos: 'Adjektiv', logDice: String(12 - i * 0.5) }))

const SAETZE = {}
const DETAILS = {}
let id = 100
for (const { lemma } of POOL.slice(0, 7)) {
  // Der Kollokator steht zweimal im Satz – nur das zweite Vorkommen hat der Parser dem Grundwort zugeordnet
  const vorne = `Ein ${lemma}er Gedanke kam auf, dann folgte nach langer Zeit ein `
  const satz = `${vorne}${lemma}er Traum, der die ganze Nacht über anhielt und nicht enden wollte.`
  SAETZE[id] = satz
  DETAILS[lemma] = { [id]: { rel: ['ATTR'], start: [...vorne].length, ende: [...vorne].length + lemma.length + 2 } }
  id++
}
DETAILS.streichen = {}   // geprüft, aber kein Satz in der Relation („gewaltig streichen“-Fall)

vi.mock('../wortprofil.js', () => ({
  fetchRelation: vi.fn(async (_l, _p, rel) => (rel === 'ATTR' ? POOL : [])),
  lemmaZeilen: vi.fn(() => 0),
}))
vi.mock('../belege.js', () => ({
  fetchSaetze: vi.fn(ids => ids.filter(i => SAETZE[i]).map(i => ({ id: i, satz: SAETZE[i], quelle: 'Test' }))),
  fetchBelegeRaw: vi.fn((_l, koll) => [{ satz: `Mir träumte ein ${koll}er Traum, der sehr lange anhielt und viel erzählte.`, quelle: 'Alt' }]),
  zaehlePhrase: vi.fn(() => 0),
}))
vi.mock('../belegPruefung/details.js', () => ({
  gepruefteDetails: vi.fn((_basis, koll) => DETAILS[koll] ?? null),
}))

const { buildLueckenfueller } = await import('../lueckenfueller.js')

describe('Lückenfüller mit geprüften Sätzen', () => {
  let runden
  beforeEach(async () => { runden = await buildLueckenfueller('Traum', 'Substantiv') })

  it('setzt die Lücke an die geprüfte Stelle, nicht an das erste Vorkommen', () => {
    const r = runden.find(x => x.type === 'choice' && x.kollokator === 'süßer')
    expect(r.satzMitLuecke).toBe('Ein süßer Gedanke kam auf, dann folgte nach langer Zeit ein _____ Traum, der die ganze Nacht über anhielt und nicht enden wollte.')
    expect(r.quelle).toBe('Test')
  })

  it('wirft geprüfte Wörter ohne Satz in der Relation aus dem Pool', () => {
    const alleOptionen = runden.flatMap(r => r.optionen ?? [r.kollokator])
    expect(alleOptionen.some(o => /streichen/i.test(o))).toBe(false)
  })

  it('nimmt für ungeprüfte Wörter den bisherigen Weg', () => {
    const ungeprueft = runden.filter(r => r.satzMitLuecke?.startsWith('Mir träumte'))
    const geprueft = runden.filter(r => r.satzMitLuecke?.startsWith('Ein '))
    expect(geprueft.length).toBeGreaterThan(0)
    for (const r of ungeprueft) expect(['bang', 'selig', 'leer', 'hold'].some(w => r.kollokator.startsWith(w))).toBe(true)
  })
})
