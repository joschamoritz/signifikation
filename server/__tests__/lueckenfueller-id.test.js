import { describe, expect, it } from 'vitest'
import { ermittleLueckenfuellerId, findeLueckenfuellerLemma } from '../lueckenfuellerAutoGen.js'
import { adminTagSchema } from '../middleware/validate.js'
import { toId } from '../wortprofil.js'

// Das Admin-Formular schickt das WORT, ältere Aufrufer die Kennung.
function index(lemmata = []) {
  return () => ({
    byId: new Map(lemmata.map((l) => [l.id, l])),
    byLemma: new Map(lemmata.map((l) => [l.lemma, l])),
  })
}

const ermittle = (eingabe, { lemmaEntries = [], lemmata = [], bisherigeKennung = '' } = {}) =>
  ermittleLueckenfuellerId({ eingabe, lemmaEntries, getLemmataIndex: index(lemmata), toId, bisherigeKennung })

describe('ermittleLueckenfuellerId', () => {
  it('lässt eine leere Eingabe leer', () => {
    expect(ermittle('')).toEqual({ kennung: '', mehrdeutig: false })
    expect(ermittle('   ').kennung).toBe('')
    expect(ermittle(undefined).kennung).toBe('')
  })

  it('wandelt ein Wort in die Kennung um (Umlaute, Groß-/Kleinschreibung)', () => {
    expect(ermittle('Lektüre').kennung).toBe('lektuere')
    expect(ermittle('  Film ').kennung).toBe('film')
    expect(ermittle('Straße').kennung).toBe('strasse')
  })

  it('lässt eine übergebene Kennung unverändert', () => {
    expect(ermittle('lektuere').kennung).toBe('lektuere')
    expect(ermittle('gibt-es-heute-nicht').kennung).toBe('gibt-es-heute-nicht')
  })

  it('bevorzugt die echte Kennung eines Wortes des Tages vor der Umwandlung', () => {
    const lemmaEntries = [{ id: 'Sonder_Id', lemma: 'Sonderwort', pos: 'Substantiv' }]
    expect(ermittle('Sonder_Id', { lemmaEntries }).kennung).toBe('Sonder_Id')
    expect(ermittle('Sonderwort', { lemmaEntries }).kennung).toBe('Sonder_Id')
  })

  it('findet ein vorhandenes Lemma über Kennung und Wortname, auch bei abweichender Kennung', () => {
    const lemmata = [{ id: 'alt-kennung-1', lemma: 'Hörsaal', pos: 'Substantiv' }]
    expect(ermittle('alt-kennung-1', { lemmata }).kennung).toBe('alt-kennung-1')
    expect(ermittle('Hörsaal', { lemmata }).kennung).toBe('alt-kennung-1')
  })

  it('behält eine Eingabe ohne verwertbare Zeichen, damit der Speicherweg „unbekannt“ meldet', () => {
    expect(ermittle('!!!').kennung).toBe('!!!')
  })

  it('bevorzugt die bisher für den Tag gespeicherte Kennung, wenn ihr Lemma so heißt wie die Eingabe', () => {
    // Zwei Lemmata gleichen Namens (z. B. verschiedene Wortart): byLemma liefert nur das letzte.
    const lemmata = [
      { id: 'tor-m', lemma: 'Tor', pos: 'Substantiv' },
      { id: 'tor-n', lemma: 'Tor', pos: 'Substantiv' },
    ]
    expect(ermittle('Tor', { lemmata }).kennung).toBe('tor-n')
    expect(ermittle('Tor', { lemmata, bisherigeKennung: 'tor-m' }).kennung).toBe('tor-m')
    // Anderer Name → die bisherige Kennung gilt nicht
    expect(ermittle('Hörsaal', { lemmata, bisherigeKennung: 'tor-m' }).kennung).toBe('hoersaal')
  })

  it('meldet Mehrdeutigkeit, wenn die abgeleitete Kennung zu einem Lemma mit anderem Namen gehört', () => {
    const lemmata = [{ id: 'essen', lemma: 'essen', pos: 'Verb' }]
    expect(ermittle('Essen', { lemmata })).toEqual({ kennung: '', mehrdeutig: true })
    // das vorhandene Wort selbst und seine Kennung bleiben eindeutig
    expect(ermittle('essen', { lemmata })).toEqual({ kennung: 'essen', mehrdeutig: false })
  })

  it('wertet einen Treffer der abgeleiteten Kennung auf ein Wort dieses Tages als dieses Wort (nicht mehrdeutig)', () => {
    // Der Speicherweg bricht bei abweichender Schreibung schon vorher ab; hier ist der Name konsistent.
    const lemmaEntries = [{ id: 'masse', lemma: 'Masse', pos: 'Substantiv' }]
    expect(ermittle('Maße', { lemmaEntries })).toEqual({ kennung: 'masse', mehrdeutig: false })
    expect(ermittle('masse', { lemmaEntries })).toEqual({ kennung: 'masse', mehrdeutig: false })
    expect(ermittle('Masse', { lemmaEntries })).toEqual({ kennung: 'masse', mehrdeutig: false })
    // Ein Lemma außerhalb des Tages mit anderem Namen bleibt mehrdeutig
    const lemmata = [{ id: 'masse', lemma: 'Masse', pos: 'Substantiv' }]
    expect(ermittle('Maße', { lemmata }).mehrdeutig).toBe(true)
  })
})

describe('findeLueckenfuellerLemma', () => {
  const lemmata = [{ id: 'essen', lemma: 'essen', pos: 'Verb' }, { id: 'alt-1', lemma: 'Hörsaal', pos: 'Substantiv' }]
  const finde = (name) => findeLueckenfuellerLemma({ name, getLemmataIndex: index(lemmata), toId })

  it('ordnet Wortname und Kennung dem vorhandenen Lemma zu', () => {
    expect(finde('Hörsaal').lemma.id).toBe('alt-1')
    expect(finde('alt-1').lemma.id).toBe('alt-1')
  })

  it('erkennt die Kollision der abgeleiteten Kennung mit einem Lemma anderen Namens', () => {
    const r = finde('Essen')
    expect(r.lemma).toBeNull()
    expect(r.kollision.id).toBe('essen')
  })

  it('findet nichts für ein neues Wort', () => {
    expect(finde('Film')).toEqual({ lemma: null, kollision: null })
  })
})

describe('adminTagSchema: Längen', () => {
  const basis = { datum: '2027-01-01', woerter: ['a', 'b', 'c'], zwilling_pos: 'Substantiv' }
  const lang = 'x'.repeat(101)

  it('begrenzt Wort-Zwilling-Wörter und Zeitenwende-Wort auf 100 Zeichen wie die Kollokationen', () => {
    expect(adminTagSchema.safeParse({ ...basis, zwilling_paar: [lang, 'b'] }).success).toBe(false)
    expect(adminTagSchema.safeParse({ ...basis, zeitenwende_lemma: lang }).success).toBe(false)
    expect(adminTagSchema.safeParse({ ...basis, zwilling_paar: ['x'.repeat(100), 'b'], zeitenwende_lemma: 'x'.repeat(100) }).success).toBe(true)
  })
})
