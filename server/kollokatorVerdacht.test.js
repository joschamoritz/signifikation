import { describe, it, expect } from 'vitest'
import { pruefeVerdacht, singularKandidaten, verbOhneGe } from './kollokatorVerdacht.js'

// Korpusvorkommen je (lemma, Wortart) und Quellenprofile wie aus lemma_corpus_freq
const FREQ = {
  'wasserräder|Substantiv': 900, 'wasserrad|Substantiv': 9000,
  'krieger|Substantiv': 40000, 'krieg|Substantiv': 900000,
  'eingeleiten|Verb': 300, 'einleiten|Verb': 50000,
  'mann|Substantiv': 800000, 'man|Substantiv': 40,
  'nachnam|Substantiv': 300, 'nachname|Substantiv': 60000,
  'schwatzten|Verb': 100, 'schwatzen|Verb': 9000,
  'vermeintliche|Adjektiv': 500, 'vermeintlich|Adjektiv': 80000,
  'hereinenbringen|Verb': 50, 'hereinbringen|Verb': 9000,
}
const posFreq = (l, p) => FREQ[`${l}|${p}`] ?? 0
const MODERN = { summe: 100000, modern: 0.9, topQuelle: 'deu_news', topAnteil: 0.4 }
const QUELLEN = {
  weib: { summe: 50000, modern: 0.1, topQuelle: 'dta_kern', topAnteil: 0.5 },
  zahnrad: { summe: 8000, modern: 0.95, topQuelle: 'bpatg', topAnteil: 0.7 },
  krone: { summe: 80000, modern: 0.9, topQuelle: 'wikipedia', topAnteil: 0.8 },
}
const quellen = (l) => QUELLEN[l] ?? MODERN
const lookup = { posFreq, quellen }
const pruefe = (eintrag, basis = 'Haus', basisPos = 'Substantiv') =>
  pruefeVerdacht({ basis, basisPos, eintrag: { frequenz: 500, ...eintrag } }, lookup)
const codes = (v) => (v?.gruende ?? []).map((g) => g.code)

describe('singularKandidaten / verbOhneGe', () => {
  it('bildet Singulare, „-er“ nur mit Umlaut', () => {
    expect(singularKandidaten('Wasserräder')).toContain('wasserrad')
    expect(singularKandidaten('Bohrlöcher')).toContain('bohrloch')
    expect(singularKandidaten('Oden')).toContain('ode')
    expect(singularKandidaten('Seminarräume')).toContain('seminarraum')
    expect(singularKandidaten('Krieger')).not.toContain('krieg')
  })

  it('erkennt Präfix + ge + Verb', () => {
    expect(verbOhneGe('eingeleiten')).toBe('einleiten')
    expect(verbOhneGe('niedergedrücken')).toBe('niederdrücken')
    expect(verbOhneGe('einladen')).toBeNull()
    expect(verbOhneGe('gehen')).toBeNull()
    expect(verbOhneGe('hereinenbringen')).toBe('hereinbringen')
    expect(verbOhneGe('fortgefahren')).toBe('fortfahren')
  })
})

describe('pruefeVerdacht', () => {
  it('lässt unauffällige Kollokatoren in Ruhe', () => {
    expect(pruefe({ wort: 'Dach', dbLemma: 'dach', pos: 'Substantiv' })).toBeNull()
    expect(pruefe({ wort: 'Mann', dbLemma: 'mann', pos: 'Substantiv' })).toBeNull()
    expect(pruefe({ wort: 'Krieger', dbLemma: 'krieger', pos: 'Substantiv' })).toBeNull()
  })

  it('Plural als Lemma mit Vorschlag', () => {
    const v = pruefe({ wort: 'Wasserräder', dbLemma: 'wasserräder', pos: 'Substantiv' })
    expect(codes(v)).toEqual(['plural'])
    expect(v.ersatz).toBe('Wasserrad')
    expect(v.gruende[0].text).toContain('Wasserrad')
  })

  it('kein Plural-Fund, wenn die Korrekturschicht schon ersetzt hat', () => {
    expect(pruefe({ wort: 'Wasserrad', dbLemma: 'wasserräder', pos: 'Substantiv' })).toBeNull()
  })

  it('kaputte Verbform mit Vorschlag', () => {
    const v = pruefe({ wort: 'eingeleiten', dbLemma: 'eingeleiten', pos: 'Verb' }, 'Verfahren')
    expect(codes(v)).toEqual(['verbform'])
    expect(v.ersatz).toBe('einleiten')
  })

  it('Partizip der Basis', () => {
    expect(codes(pruefe({ wort: 'gebaut', dbLemma: 'gebaut', pos: 'Adjektiv' }, 'bauen', 'Verb'))).toEqual(['partizip'])
  })

  it('historisch, eine Fachquelle, aber keine breite Quelle', () => {
    expect(codes(pruefe({ wort: 'Weib', dbLemma: 'weib', pos: 'Substantiv' }))).toEqual(['historisch'])
    const fach = pruefe({ wort: 'Zahnrad', dbLemma: 'zahnrad', pos: 'Substantiv' })
    expect(codes(fach)).toEqual(['eine_quelle'])
    expect(fach.gruende[0].text).toContain('bpatg')
    expect(pruefe({ wort: 'Krone', dbLemma: 'krone', pos: 'Substantiv' })).toBeNull()
  })

  it('Vorname, wenige Belege, auffällige Schreibung', () => {
    expect(codes(pruefe({ wort: 'Anna', dbLemma: 'anna', pos: 'Substantiv' }, 'heiraten', 'Verb'))).toEqual(['vorname'])
    const selten = pruefe({ wort: 'Dach', dbLemma: 'dach', pos: 'Substantiv', frequenz: 12 })
    expect(codes(selten)).toEqual(['wenige_belege'])
    expect(selten.gruende[0].text).toContain('12')
    const schreib = pruefe({ wort: 'Ip-adresse', dbLemma: 'ip-adresse', pos: 'Substantiv' })
    expect(codes(schreib)).toEqual(['schreibung'])
    expect(schreib.schreibung).toBe('Ip-Adresse')
    expect(codes(pruefe({ wort: 'A4', dbLemma: 'a4', pos: 'Substantiv' }))).toEqual(['schreibung'])
  })

  it('abgeschnittenes Substantiv, Präteritum als Verb, gebeugtes Adjektiv', () => {
    const nachnam = pruefe({ wort: 'Nachnam', dbLemma: 'nachnam', pos: 'Substantiv' }, 'buchstabieren', 'Verb')
    expect(codes(nachnam)).toEqual(['abgeschnitten'])
    expect(nachnam.ersatz).toBe('Nachname')
    const schwatzten = pruefe({ wort: 'schwatzten', dbLemma: 'schwatzten', pos: 'Verb' }, 'spuken', 'Verb')
    expect(codes(schwatzten)).toEqual(['verbform'])
    expect(schwatzten.ersatz).toBe('schwatzen')
    const verm = pruefe({ wort: 'vermeintliche', dbLemma: 'vermeintliche', pos: 'Adjektiv' }, 'Schnäppchen')
    expect(codes(verm)).toEqual(['adjektivform'])
    expect(verm.ersatz).toBe('vermeintlich')
    expect(codes(pruefe({ wort: 'hereinenbringen', dbLemma: 'hereinenbringen', pos: 'Verb' }))).toEqual(['verbform'])
  })

  it('im logDice-Rückfall kein Hinweis auf wenige Belege', () => {
    const v = pruefeVerdacht({ basis: 'Radium', basisPos: 'Substantiv', eintrag: { wort: 'Radon', dbLemma: 'radon', pos: 'Substantiv', frequenz: 10 } }, lookup, { wenigeBelege: false })
    expect(v).toBeNull()
  })
})
