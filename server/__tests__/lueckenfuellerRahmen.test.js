/**
 * Lückenfüller: Lücke am Grundwort und Wortform der Distraktoren aus dem Satzrahmen.
 * Die Korpuszählung ist hier ein fester Katalog (`zaehler`), damit die Auswahlregeln
 * ohne belege_v2.db prüfbar sind; die Fälle stammen aus echten Runden vom 29.10.2026.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../belege.js', () => ({ fetchBelegeRaw: vi.fn(() => []), zaehlePhrase: vi.fn(() => 0) }))

const { rahmenDerLuecke, formKandidaten, formNachEndung, waehleForm } = await import('../lueckenfuellerRahmen.js')
const { blankCollocate } = await import('../lueckenfueller.js')

/** Zählfunktion aus einem Katalog „wortfolge → Treffer“; protokolliert jede Anfrage. */
function zaehler(katalog) {
  const anfragen = []
  const zaehle = (woerter) => {
    const schluessel = woerter.join(' ').toLowerCase()
    anfragen.push(schluessel)
    return katalog[schluessel] ?? 0
  }
  return Object.assign(zaehle, { anfragen })
}

describe('rahmenDerLuecke', () => {
  it('liefert das Wort davor und danach', () => {
    expect(rahmenDerLuecke('Er bringt einen _____ Wind in den Stock.')).toEqual({ links: 'einen', rechts: 'Wind', amSatzanfang: false })
  })

  it('kein Rahmen über ein Satzzeichen hinweg', () => {
    expect(rahmenDerLuecke('ohne _____, ohne Panik')).toEqual({ links: 'ohne', rechts: null, amSatzanfang: false })
    expect(rahmenDerLuecke('Panik, _____ und Angst')).toEqual({ links: null, rechts: 'und', amSatzanfang: false })
    expect(rahmenDerLuecke('_____ statt Urlaubsstimmung')).toEqual({ links: null, rechts: 'statt', amSatzanfang: true })
  })

  it('Satzanfang auch hinter Anführungszeichen', () => {
    expect(rahmenDerLuecke('„_____ Transistoren wurden …').amSatzanfang).toBe(true)
  })
})

describe('waehleForm: Fehler aus der Messung vom 30.10.2026', () => {
  it('Steigerung der Lösung macht ein anderes Adjektiv nicht zum Ortsadjektiv („geringeren“ → nicht „Hoch“)', () => {
    const zaehle = zaehler({ 'hoch zahl': 50 })
    const form = waehleForm({ lemma: 'hoch', pos: 'Adjektiv' }, { links: 'einer', rechts: 'Zahl', amSatzanfang: false },
      { token: 'geringeren', lemma: 'gering' }, zaehle)
    expect(form).toBe('hocheren')   // nicht belegt – das Wort fällt danach in waehleDistraktoren heraus
  })

  it('Ortsadjektiv als Lösung: Distraktoren klein und nach dem Rahmen gebeugt („den Prenzlauer Berg“ → „blauen“)', () => {
    const zaehle = zaehler({ 'den blauen berg': 7 })
    const form = waehleForm({ lemma: 'blau', pos: 'Adjektiv' }, { links: 'den', rechts: 'Berg', amSatzanfang: false },
      { token: 'Prenzlauer', lemma: 'prenzlauer' }, zaehle)
    expect(form).toBe('blauen')
  })

  it('Adjektiv mitten im Satz bleibt klein, auch wenn die Lösung großgeschrieben ist', () => {
    const zaehle = zaehler({})
    expect(waehleForm({ lemma: 'steil', pos: 'Adjektiv' }, { links: 'am', rechts: 'Berg', amSatzanfang: false },
      { token: 'Weißen', lemma: 'weiß' }, zaehle)).toBe('steilen')
    expect(waehleForm({ lemma: 'diskret', pos: 'Adjektiv' }, { links: null, rechts: 'Transistoren', amSatzanfang: true },
      { token: 'Bipolare', lemma: 'bipolar' }, zaehle)).toBe('Diskrete')
  })

  it('Nomen ohne Rahmen, Lösung im Plural: belegte Form mit passender Endung („Pappeln“, „Grafen“)', () => {
    const zaehle = zaehler({ pappeln: 900, pappels: 2 })
    expect(waehleForm({ lemma: 'Pappel', pos: 'Substantiv' }, { links: null, rechts: null },
      { token: 'Birken', lemma: 'Birke' }, zaehle)).toBe('Pappeln')
    const z2 = zaehler({ grafen: 5000, grafs: 40 })
    expect(waehleForm({ lemma: 'Graf', pos: 'Substantiv' }, { links: null, rechts: null },
      { token: 'Knappen', lemma: 'Knappe' }, z2)).toBe('Grafen')
  })

  it('Nomen ohne Rahmen, Lösung in der Grundform: Grundform bleibt', () => {
    const zaehle = zaehler({ pappeln: 900 })
    expect(waehleForm({ lemma: 'Pappel', pos: 'Substantiv' }, { links: null, rechts: null },
      { token: 'Birke', lemma: 'Birke' }, zaehle)).toBe('Pappel')
  })
})

describe('Formkandidaten und Endungsregel', () => {
  it('bildet Adjektivformen auch von e-, el- und er-Stämmen', () => {
    expect(formKandidaten('leise', 'Adjektiv')).toEqual(expect.arrayContaining(['leise', 'leisen', 'leiser']))
    expect(formKandidaten('dunkel', 'Adjektiv')).toEqual(expect.arrayContaining(['dunklen', 'dunkle']))
    expect(formKandidaten('teuer', 'Adjektiv')).toContain('teuren')
    expect(formKandidaten('hoch', 'Adjektiv')).toContain('hohen')
  })

  it('überträgt die Endung der Lösung', () => {
    expect(formNachEndung('kalt', 'Adjektiv', 'starken', 'stark')).toBe('kalten')
    expect(formNachEndung('leise', 'Adjektiv', 'starken', 'stark')).toBe('leisen')
    expect(formNachEndung('kalt', 'Adjektiv', 'stark', 'stark')).toBe('kalt')
    // Lösung nicht als Lemma + Endung im Satz (Umlaut): keine Regel
    expect(formNachEndung('kalt', 'Adjektiv', 'Häuser', 'Haus')).toBeNull()
  })
})

describe('waehleForm', () => {
  const ziel = { token: 'starken', lemma: 'stark' }

  it('Adjektiv: Regel-Form im vollen Rahmen belegt → eine einzige Zählung', () => {
    const zaehle = zaehler({ 'einen kalten wind': 6 })
    expect(waehleForm({ lemma: 'kalt', pos: 'Adjektiv' }, { links: 'einen', rechts: 'Wind' }, ziel, zaehle)).toBe('kalten')
    expect(zaehle.anfragen).toEqual(['einen kalten wind'])
  })

  it('Adjektiv: der Rahmen korrigiert den Stamm, nicht die Endung', () => {
    const zaehle = zaehler({ 'einen dunklen wind': 2, 'einen dunkler wind': 9 })
    expect(waehleForm({ lemma: 'dunkel', pos: 'Adjektiv' }, { links: 'einen', rechts: 'Wind' }, ziel, zaehle)).toBe('dunklen')
  })

  it('Adjektiv: andere Endung im Rahmen belegt, gewinnt trotzdem die Regel („günstiger“ statt „günstigem“)', () => {
    const zaehle = zaehler({ 'besonders günstiger wind': 3 })
    const form = waehleForm({ lemma: 'günstig', pos: 'Adjektiv' }, { links: 'besonders', rechts: 'Wind' },
      { token: 'frischem', lemma: 'frisch' }, zaehle)
    expect(form).toBe('günstigem')
  })

  it('Adjektiv: ein halber Rahmen entscheidet nicht über die Endung („Abend produziert“)', () => {
    const zaehle = zaehler({ 'abend produziert': 40 })
    const form = waehleForm({ lemma: 'produziert', pos: 'Adjektiv' }, { links: 'Abend', rechts: 'Sat1' },
      { token: 'ausgestrahlten', lemma: 'ausgestrahlt' }, zaehle)
    expect(form).toBe('produzierten')
  })

  it('Adjektiv: unbeugbare Ortsadjektive behalten ihre Form („Landshuter Hochzeit“)', () => {
    const zaehle = zaehler({ 'landshuter hochzeit': 30 })
    const form = waehleForm({ lemma: 'landshuter', pos: 'Adjektiv' }, { links: 'der', rechts: 'Hochzeit' },
      { token: 'goldenen', lemma: 'golden' }, zaehle)
    expect(form).toBe('Landshuter')
  })

  it('Nomen: keine Endungsregel – ohne Rahmen-Treffer bleibt die Grundform', () => {
    const zaehle = zaehler({})
    const form = waehleForm({ lemma: 'Lyrik', pos: 'Substantiv' }, { links: 'Erzählungen', rechts: 'Märchen' },
      { token: 'Gedichten', lemma: 'Gedicht' }, zaehle)
    expect(form).toBe('Lyrik')
  })

  it('Nomen: die im Rahmen belegte Form, vom engsten Rahmen an', () => {
    const zaehle = zaehler({ 'in gedichte': 50, 'in dramen und': 3, 'in dramen': 80 })
    const form = waehleForm({ lemma: 'Drama', pos: 'Substantiv' }, { links: 'in', rechts: 'und' },
      { token: 'Romanen', lemma: 'Roman' }, zaehle)
    // „Dramen“ steckt nicht in den Kandidaten (Plural mit Stammwechsel) – dann bleibt die Grundform
    expect(form).toBe('Drama')
    const z2 = zaehler({ 'in märchen und': 4, 'in märchen': 90 })
    expect(waehleForm({ lemma: 'Märchen', pos: 'Substantiv' }, { links: 'in', rechts: 'und' },
      { token: 'Romanen', lemma: 'Roman' }, z2)).toBe('Märchen')
  })

  it('Schreibung: Nomen groß, Adjektive wie die Lösung', () => {
    const zaehle = zaehler({})
    expect(waehleForm({ lemma: 'kalt', pos: 'Adjektiv' }, { links: null, rechts: 'Wind' },
      { token: 'Starke', lemma: 'stark' }, zaehle)).toBe('Kalte')
    expect(waehleForm({ lemma: 'hysterie', pos: 'Substantiv' }, { links: null, rechts: null },
      { token: 'Angst', lemma: 'Angst' }, zaehle)).toBe('Hysterie')
  })
})

describe('blankCollocate', () => {
  it('nimmt das Vorkommen am Grundwort, nicht das erste im Satz', () => {
    const satz = 'Der starke Mann hielt bei starkem Wind das Segel fest.'
    const { satzMitLuecke, token } = blankCollocate(satz, 'stark', 'Wind')
    expect(satzMitLuecke).toBe('Der starke Mann hielt bei _____ Wind das Segel fest.')
    expect(token).toBe('starkem')
  })

  it('erkennt das Grundwort auch flektiert (öffnen → geöffnet)', () => {
    const satz = 'Das Tor stand offen, als sie das alte Tor zum Garten geöffnet hatten.'
    expect(blankCollocate(satz, 'Tor', 'öffnen').satzMitLuecke)
      .toBe('Das Tor stand offen, als sie das alte _____ zum Garten geöffnet hatten.')
  })

  it('lässt Satzzeichen am Wort stehen', () => {
    expect(blankCollocate('Sie sprachen über Panik und Hysterie.', 'Hysterie', 'Panik').satzMitLuecke)
      .toBe('Sie sprachen über Panik und _____.')
    expect(blankCollocate('„Hektik“ war das Wort zur Panik', 'Hektik', 'Panik').satzMitLuecke)
      .toBe('„_____“ war das Wort zur Panik')
  })

  it('ohne Grundwort im Satz wie bisher das erste Vorkommen, ohne Kollokator null', () => {
    expect(blankCollocate('Kalter Regen und kalter Schnee.', 'kalt', 'Wind').satzMitLuecke)
      .toBe('_____ Regen und kalter Schnee.')
    expect(blankCollocate('Nichts davon.', 'kalt', 'Wind')).toBeNull()
  })
})
