import { describe, it, expect, afterEach } from 'vitest'
import {
  schreibweise, partizipFormen, korrigiere, istFachsprache, fuehreZusammen,
  setzeDbKorrekturen, grundbestand, schluesselFuer, zerlegeSchluessel, korrigiereRueckfall,
} from './kollokatorKorrektur.js'

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
    expect(korrigiere('heiraten', 'anna', 'Substantiv')).toBeNull()
    expect(korrigiere('Wolf', 'bös', 'Adjektiv').lemma).toBe('böse')
    expect(korrigiere('blind', 'könig', 'Substantiv')).toBeNull()
    expect(korrigiere('Krone', 'könig', 'Substantiv').lemma).toBe('könig')
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

describe('Überlagerung aus der Datenbank (setzeDbKorrekturen)', () => {
  afterEach(() => setzeDbKorrekturen([]))

  it('ersetzt und sperrt Lemmata zusätzlich zum Grundbestand', () => {
    setzeDbKorrekturen([
      { art: 'lemma', schluessel: 'Substantiv:wassermühlen', ersatz: 'Wassermühle' },
      { art: 'lemma', schluessel: 'Verb:quaken', ersatz: null },
    ])
    expect(korrigiere('Bach', 'wassermühlen', 'Substantiv')).toEqual({ lemma: 'Wassermühle', pos: 'Substantiv' })
    expect(korrigiere('Frosch', 'quaken', 'Verb')).toBeNull()
    // Grundbestand gilt weiter
    expect(korrigiere('verleihen', 'preisen', 'Substantiv')).toEqual({ lemma: 'Preis', pos: 'Substantiv' })
  })

  it('übersteuert einen Code-Eintrag; Ersatz = das Wort selbst hebt ihn auf', () => {
    setzeDbKorrekturen([
      { art: 'lemma', schluessel: 'Substantiv:preisen', ersatz: 'Preise' },
      { art: 'lemma', schluessel: 'Substantiv:titeln', ersatz: 'Titeln' },
      { art: 'lemma', schluessel: 'Verb:vergewaltigen', ersatz: 'vergewaltigen' },
    ])
    expect(korrigiere('x', 'preisen', 'Substantiv').lemma).toBe('Preise')
    expect(korrigiere('x', 'titeln', 'Substantiv').lemma).toBe('titeln')
    expect(korrigiere('x', 'vergewaltigen', 'Verb')).toEqual({ lemma: 'vergewaltigen', pos: 'Verb' })
  })

  it('sperrt ein Lemma, das der Code ersetzt (Ersatz null)', () => {
    setzeDbKorrekturen([{ art: 'lemma', schluessel: 'Adjektiv:bös', ersatz: null }])
    expect(korrigiere('Wolf', 'bös', 'Adjektiv')).toBeNull()
  })

  it('Paare: sperren, ersetzen, Code-Sperre aufheben', () => {
    setzeDbKorrekturen([
      { art: 'paar', schluessel: 'see|ross', ersatz: null },
      { art: 'paar', schluessel: 'lesen|blättern', ersatz: 'Blätter' },
      { art: 'paar', schluessel: 'heiraten|anna', ersatz: 'anna' },
    ])
    expect(korrigiere('See', 'ross', 'Substantiv')).toBeNull()
    expect(korrigiere('Pferd', 'ross', 'Substantiv')).toEqual({ lemma: 'ross', pos: 'Substantiv' })
    // Paar vor Lemma: der Code ersetzt „blättern“ sonst überall durch „Blatt“
    expect(korrigiere('lesen', 'blättern', 'Substantiv').lemma).toBe('Blätter')
    expect(korrigiere('heiraten', 'anna', 'Substantiv')).toEqual({ lemma: 'anna', pos: 'Substantiv' })
  })

  it('Schreibweise und Abkürzung (auch im Bindestrich-Wort)', () => {
    setzeDbKorrekturen([
      { art: 'schreibung', schluessel: 'e-mail', ersatz: 'E-Mail' },
      { art: 'abkuerzung', schluessel: 'ard', ersatz: 'ARD' },
      { art: 'abkuerzung', schluessel: 'tv', ersatz: 'tv' }, // hebt die Code-Abkürzung auf
    ])
    expect(schreibweise('e-mail', 'Substantiv')).toBe('E-Mail')
    expect(schreibweise('ard', 'Substantiv')).toBe('ARD')
    expect(schreibweise('ard-moderator', 'Substantiv')).toBe('ARD-Moderator')
    expect(schreibweise('tv', 'Substantiv')).toBe('Tv')
  })

  it('starkes Partizip führt ins Verb', () => {
    const liste = [
      { lemma: 'schwimmen', pos: 'Verb', f: 100, d: 8 },
      { lemma: 'geschwommen', pos: 'Adjektiv', f: 50, d: 9 },
    ]
    expect(fuehreZusammen(liste)).toHaveLength(2)
    setzeDbKorrekturen([{ art: 'partizip', schluessel: 'geschwommen', ersatz: 'Schwimmen' }])
    expect(fuehreZusammen(liste)).toEqual([{ lemma: 'schwimmen', pos: 'Verb', f: 150, d: 9 }])
  })

  it('eine neue Überlagerung ersetzt die alte vollständig', () => {
    setzeDbKorrekturen([{ art: 'lemma', schluessel: 'Verb:quaken', ersatz: null }])
    setzeDbKorrekturen([])
    expect(korrigiere('Frosch', 'quaken', 'Verb')).toEqual({ lemma: 'quaken', pos: 'Verb' })
  })

  it('Grundbestand und Schlüssel', () => {
    const g = grundbestand()
    expect(g).toContainEqual({ art: 'lemma', schluessel: 'Substantiv:preisen', ersatz: 'Preis' })
    expect(g).toContainEqual({ art: 'lemma', schluessel: 'Verb:vergewaltigen', ersatz: null })
    expect(g).toContainEqual({ art: 'paar', schluessel: 'heiraten|anna', ersatz: null })
    expect(g).toContainEqual({ art: 'abkuerzung', schluessel: 'us', ersatz: 'US' })
    expect(schluesselFuer('lemma', { wortart: 'Substantiv', kollokator: ' Preisen ' })).toBe('Substantiv:preisen')
    expect(schluesselFuer('paar', { basis: 'Heiraten', kollokator: 'Anna' })).toBe('heiraten|anna')
    expect(schluesselFuer('abkuerzung', { kollokator: 'ARD' })).toBe('ard')
    expect(zerlegeSchluessel('paar', 'heiraten|anna')).toEqual({ wortart: null, basis: 'heiraten', kollokator: 'anna' })
    expect(zerlegeSchluessel('lemma', 'Verb:quaken')).toEqual({ wortart: 'Verb', basis: null, kollokator: 'quaken' })
  })
})

describe('korrigiereRueckfall (logDice-Rückfall seltener Basen)', () => {
  afterEach(() => setzeDbKorrekturen([]))
  const item = (lemma, pos, frequency, logDice) => ({ lemma, pos, frequency, logDice: String(logDice), relation: 'KON' })

  it('ersetzt, sperrt, führt zusammen und sortiert nach logDice', () => {
    setzeDbKorrekturen([{ art: 'lemma', schluessel: 'Adjektiv:vermeintliche', ersatz: 'vermeintlich' }])
    const pool = korrigiereRueckfall([
      item('vermeintliche', 'Adjektiv', 5, 9.1),
      item('ergattern', 'Verb', 48, 8.0),
      item('vermeintlich', 'Adjektiv', 79, 7.5),
      item('Nachnam', 'Substantiv', 9, 7.0),
      item('zusammengeleben', 'Verb', 3, 6.0),
      item('jch', 'Substantiv', 4, 5.0),
    ], 'Schnäppchen')
    expect(pool.map((e) => e.lemma)).toEqual(['vermeintlich', 'ergattern', 'Nachname', 'zusammenleben'])
    expect(pool[0]).toMatchObject({ frequency: 84, logDice: '9.1000', dbLemma: 'vermeintliche', relation: 'KON' })
    expect(pool[2].dbLemma).toBe('nachnam')
  })

  it('Paar-Sperre aus dem Admin greift auch hier', () => {
    setzeDbKorrekturen([{ art: 'paar', schluessel: 'radium|diametrum', ersatz: null }])
    const pool = korrigiereRueckfall([item('Polonium', 'Substantiv', 19, 9), item('Diametrum', 'Substantiv', 6, 8)], 'Radium')
    expect(pool.map((e) => e.lemma)).toEqual(['Polonium'])
  })
})
