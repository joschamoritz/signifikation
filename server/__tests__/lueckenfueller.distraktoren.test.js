/**
 * Lückenfüller: Distraktor-Auswahl. Fälle aus der Messung vom 30.10.2026 (88 Auswahlrunden der
 * geplanten Tage 23.11.–31.01.): Varianten desselben Worts als zwei Optionen, Lösungen früherer
 * Runden als Distraktor, Kunstformen der Endungsregel.
 */
import { describe, expect, it, vi } from 'vitest'

// Pool für „Transistor“ (ATTR-Adjektive), mit Varianten wie im echten Wortprofil
const LEMMATA = ['bipolar', 'parasitär', 'geschaltet', 'diskret', 'schaltend', 'bipolarer',
  'selbstsperrend', 'regelnd', 'pseudomorph', 'mehrfingrig', 'zweistufig', 'rauscharm', 'ic']
const POOL = LEMMATA.map((lemma, i) => ({ lemma, pos: 'Adjektiv', logDice: String(12 - i * 0.5) }))

// Als Wort belegt: jede e-Form, außer „pseudomorphe“ (steht für „biebereren“, „hocheren“)
const BELEGT = new Set(LEMMATA.filter(l => l !== 'pseudomorph').map(l => `${l}e`))

vi.mock('../wortprofil.js', () => ({
  fetchRelation: vi.fn(async (_l, _p, rel) => (rel === 'ATTR' ? POOL : [])),
  lemmaZeilen: vi.fn(() => 0),
}))
vi.mock('../belege.js', () => ({
  fetchSaetze: vi.fn(() => []),
  fetchBelegeRaw: vi.fn((_l, koll) => [{ satz: `Die Schaltung enthält zwei ${koll}e Transistoren, die parallel arbeiten und viel Strom führen.`, quelle: 'Test' }]),
  zaehlePhrase: vi.fn(woerter => (woerter.length === 1 && BELEGT.has(String(woerter[0]).toLowerCase()) ? 10 : 0)),
}))
vi.mock('../belegPruefung/details.js', () => ({ gepruefteDetails: vi.fn(() => null) }))

const { buildLueckenfueller, lueckenfuellerPool, gleichesWort } = await import('../lueckenfueller.js')

describe('gleichesWort', () => {
  it('erkennt Flexion, Steigerung und alte Schreibung', () => {
    for (const [a, b] of [['Bipolare', 'Bipolarer'], ['Mikroskop', 'Mikroskope'], ['oscillirenden', 'oszillierenden'],
      ['Sizilische', 'Sicilische'], ['kostbaren', 'kostbarsten'], ['zweicylindrig', 'zweizylindrig'],
      ['Thäler', 'Tal'], ['Nadelholz', 'Nadelhölzer'], ['tapfer', 'tapferst']]) {
      expect(gleichesWort(a, b), `${a} / ${b}`).toBe(true)
    }
  })

  it('trennt verschiedene Wörter', () => {
    for (const [a, b] of [['wachsend', 'steigend'], ['einzylindrig', 'zweizylindrig'], ['Knappe', 'Knecht'],
      ['Teleskop', 'Spiegelteleskop'], ['rot', 'rotierend'], ['hoch', 'hochstämmig']]) {
      expect(gleichesWort(a, b), `${a} / ${b}`).toBe(false)
    }
  })
})

describe('Distraktoren', () => {
  it('der Pool behält von zwei Varianten nur die stärkere, ohne Parser-Reste unter drei Buchstaben', async () => {
    const pool = (await lueckenfuellerPool('Transistor', 'Substantiv')).map(p => p.lemma)
    expect(pool).toContain('bipolar')
    expect(pool).not.toContain('bipolarer')
    expect(pool).not.toContain('ic')
  })

  it('keine Runde zeigt zwei Formen desselben Worts, keine unbelegte Form', async () => {
    const runden = await buildLueckenfueller('Transistor', 'Substantiv')
    expect(runden.length).toBeGreaterThanOrEqual(5)
    for (const r of runden.filter(x => x.optionen)) {
      expect(r.optionen.some(o => /pseudomorph/i.test(o))).toBe(false)
      for (let i = 0; i < r.optionen.length; i++) {
        for (let j = i + 1; j < r.optionen.length; j++) {
          expect(gleichesWort(r.optionen[i], r.optionen[j]), `${r.optionen[i]} / ${r.optionen[j]}`).toBe(false)
        }
      }
    }
  })

  it('Lösungen früherer Runden kommen nicht als Distraktor wieder', async () => {
    const runden = await buildLueckenfueller('Transistor', 'Substantiv')
    const choice = runden.filter(r => r.type === 'choice')
    choice.forEach((r, i) => {
      const frueher = choice.slice(0, i).map(x => x.kollokator)
      const falsche = r.optionen.filter(o => o !== r.kollokator)
      for (const f of falsche) expect(frueher.some(l => gleichesWort(l, f)), `${f} in Runde ${i + 1}`).toBe(false)
    })
  })
})
