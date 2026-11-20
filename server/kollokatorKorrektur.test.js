import { describe, it, expect } from 'vitest'
import { schreibweise, partizipFormen, korrigiere, istFachsprache, fuehreZusammen } from './kollokatorKorrektur.js'

describe('korrigiere', () => {
  it('ersetzt gebeugte Formen durch das Lemma', () => {
    expect(korrigiere('verleihen', 'preisen', 'Substantiv')).toEqual({ lemma: 'Preis', pos: 'Substantiv' })
    expect(korrigiere('Kind', 'elter', 'Substantiv')).toEqual({ lemma: 'Eltern', pos: 'Substantiv' })
    expect(korrigiere('Wende', 'eingeleiten', 'Verb')).toEqual({ lemma: 'einleiten', pos: 'Verb' })
  })

  it('ersetzt nur in der passenden Wortart (hängen als Verb bleibt)', () => {
    expect(korrigiere('steil', 'hängen', 'Substantiv').lemma).toBe('Hang')
    expect(korrigiere('Bild', 'hängen', 'Verb').lemma).toBe('hängen')
  })

  it('sperrt Parserreste', () => {
    expect(korrigiere('grüßen', 'du', 'Substantiv')).toBeNull()
    expect(korrigiere('prägen', 'pfarren', 'Verb')).toBeNull()
  })

  it('korrigiert Paare nur bei ihrer Basis', () => {
    expect(korrigiere('speichern', 'datum', 'Substantiv').lemma).toBe('Daten')
    expect(korrigiere('festlegen', 'datum', 'Substantiv').lemma).toBe('datum')
    expect(korrigiere('erklären', 'herr', 'Substantiv')).toBeNull()
    expect(korrigiere('vornehm', 'herr', 'Substantiv').lemma).toBe('herr')
  })

  it('sperrt Inhalte, die nicht in ein Schulspiel gehören', () => {
    expect(korrigiere('Schrift', 'kinderpornographisch', 'Adjektiv')).toBeNull()
    expect(korrigiere('verstecken', 'jude', 'Substantiv')).toBeNull()
    expect(korrigiere('Herkunft', 'jüdisch', 'Adjektiv').lemma).toBe('jüdisch')
  })

  it('lässt unauffällige Kollokatoren unverändert', () => {
    expect(korrigiere('Kaffee', 'stark', 'Adjektiv')).toEqual({ lemma: 'stark', pos: 'Adjektiv' })
  })
})

describe('schreibweise', () => {
  it('schreibt Substantive groß und Abkürzungen in Großbuchstaben', () => {
    expect(schreibweise('roboter', 'Substantiv')).toBe('Roboter')
    expect(schreibweise('us-präsident', 'Substantiv')).toBe('US-Präsident')
    expect(schreibweise('ip-adresse', 'Substantiv')).toBe('IP-Adresse')
    expect(schreibweise('u-bahn', 'Substantiv')).toBe('U-Bahn')
    expect(schreibweise('d-mark', 'Substantiv')).toBe('D-Mark')
    expect(schreibweise('cd-rom', 'Substantiv')).toBe('CD-ROM')
    expect(schreibweise('ddr-bürger', 'Substantiv')).toBe('DDR-Bürger')
  })

  it('lässt Adjektiv-Komposita klein, außer der Abkürzung', () => {
    expect(schreibweise('us-amerikanisch', 'Adjektiv')).toBe('US-amerikanisch')
    expect(schreibweise('deutsch-französisch', 'Adjektiv')).toBe('deutsch-französisch')
  })

  it('schreibt Einheiten klein und lässt die Stadt Rom in Ruhe', () => {
    expect(schreibweise('cm', 'Substantiv')).toBe('cm')
    expect(schreibweise('rom', 'Substantiv')).toBe('Rom')
  })

  it('schreibt Ortsadjektive groß, wenn der Aufrufer sie erkennt', () => {
    const istOrtsadjektiv = (w) => ['berliner', 'weimarer', 'sauer'].includes(w)
    expect(schreibweise('berliner', 'Adjektiv', { istOrtsadjektiv })).toBe('Berliner')
    expect(schreibweise('weimarer', 'Adjektiv', { istOrtsadjektiv })).toBe('Weimarer')
    // „sauer“ steht auf der Liste echter Adjektive, auch wenn es „Sau“ als Substantiv gibt
    expect(schreibweise('sauer', 'Adjektiv', { istOrtsadjektiv })).toBe('sauer')
    expect(schreibweise('berliner', 'Adjektiv')).toBe('berliner')
  })
})

describe('partizipFormen', () => {
  it('bildet schwache, starke und trennbare Partizipien', () => {
    expect(partizipFormen('bauen').has('gebaut')).toBe(true)
    expect(partizipFormen('drücken').has('gedrückt')).toBe(true)
    expect(partizipFormen('abgeben').has('abgegeben')).toBe(true)
    expect(partizipFormen('veröffentlichen').has('veröffentlicht')).toBe(true)
    expect(partizipFormen('niederdrücken').has('niedergedrückt')).toBe(true)
    expect(partizipFormen('graben').has('gegraben')).toBe(true)
  })

  it('enthält das Verb selbst nicht', () => {
    expect(partizipFormen('bauen').has('bauen')).toBe(false)
  })
})

describe('istFachsprache', () => {
  it('erkennt Fachjargon aus Gerichts- und Patentkorpora ab 75 %', () => {
    expect(istFachsprache({ topQuelle: 'bpatg', topAnteil: 0.98 })).toBe(true)
    expect(istFachsprache({ topQuelle: 'bpatg', topAnteil: 0.73 })).toBe(false) // Marke
    expect(istFachsprache({ topQuelle: 'wikibooks', topAnteil: 0.99 })).toBe(false)
    expect(istFachsprache(null)).toBe(false)
  })
})

describe('fuehreZusammen', () => {
  it('addiert die Frequenz gleicher Wörter und behält das höhere logDice', () => {
    const out = fuehreZusammen([
      { lemma: 'Preis', pos: 'Substantiv', f: 100, d: 7 },
      { lemma: 'Preis', pos: 'Substantiv', f: 900, d: 9 },
    ])
    expect(out).toEqual([{ lemma: 'Preis', pos: 'Substantiv', f: 1000, d: 9 }])
  })

  it('führt Partizipien in ihr Verb, wenn beide in der Liste stehen', () => {
    const out = fuehreZusammen([
      { lemma: 'bauen', pos: 'Verb', f: 500, d: 8 },
      { lemma: 'gebaut', pos: 'Adjektiv', f: 300, d: 9 },
      { lemma: 'Klavier', pos: 'Substantiv', f: 400, d: 8 },
    ])
    expect(out.map((e) => e.lemma)).toEqual(['bauen', 'Klavier'])
    expect(out[0]).toMatchObject({ f: 800, d: 9 })
  })

  it('führt starke Partizipien in ihr Verb (erhoben → erheben)', () => {
    const out = fuehreZusammen([
      { lemma: 'erheben', pos: 'Verb', f: 6722, d: 7.2 },
      { lemma: 'erhoben', pos: 'Adjektiv', f: 843, d: 8.3 },
    ])
    expect(out).toEqual([{ lemma: 'erheben', pos: 'Verb', f: 7565, d: 8.3 }])
  })

  it('führt einen als Adjektiv getaggten Infinitiv ins Partizip (vereinbaren → vereinbart)', () => {
    const out = fuehreZusammen([
      { lemma: 'vereinbart', pos: 'Adjektiv', f: 233, d: 7.2 },
      { lemma: 'vereinbaren', pos: 'Adjektiv', f: 141, d: 7.0 },
      { lemma: 'golden', pos: 'Adjektiv', f: 50, d: 6 },
    ])
    expect(out.map((e) => e.lemma)).toEqual(['vereinbart', 'golden'])
    expect(out[0].f).toBe(374)
  })

  it('lässt ein Partizip stehen, wenn das Verb fehlt', () => {
    const out = fuehreZusammen([{ lemma: 'vereinbart', pos: 'Adjektiv', f: 233, d: 8 }])
    expect(out.map((e) => e.lemma)).toEqual(['vereinbart'])
  })
})
