import { afterEach, describe, expect, it } from 'vitest'
import {
  spielAnlegen, spielHolen, teamBeitreten, teamPerToken, ereignisSetzen, rundeFreigeben,
  abgabeSpeichern, standSpeichern, abrechnen, zustandFuerTeams, zustandFuerLeitung, teamsJeRaum,
  teamEntfernen, _alleLoeschen,
} from '../handelsreise/spiel.js'
import {
  abrechnungsKontext, neueFaktoren, risiko, neuesTeam, reiseAbrechnen, rundeAbschliessen, ziele, RUNDEN,
} from '../../public/unterricht/handelsreise-regeln.js'

afterEach(() => _alleLoeschen())

describe('Handelsreise – Klassenmarkt', () => {
  it('legt ein Spiel mit vierstelligem Code an', () => {
    const s = spielAnlegen()
    expect(s.code).toMatch(/^\d{4}$/)
    expect(spielHolen(s.code)).toBe(s)
    expect(s.status).toBe('lobby')
  })

  it('verteilt Teams gleichmäßig auf die drei Räume', () => {
    const s = spielAnlegen()
    for (let i = 0; i < 14; i++) teamBeitreten(s, { name: `Team ${i}`, haus: '' })
    const z = Object.values(teamsJeRaum(s))
    expect(Math.max(...z) - Math.min(...z)).toBeLessThanOrEqual(1)
    expect(z.reduce((a, b) => a + b, 0)).toBe(14)
  })

  it('findet Teams nur über ihr Token und gibt Tokens nicht an die Leitung', () => {
    const s = spielAnlegen()
    const { team } = teamBeitreten(s, { name: 'Lea und Tom', haus: 'Haus Morgenstern' })
    expect(teamPerToken(s, team.token)).toBe(team)
    expect(teamPerToken(s, 'falsch')).toBeNull()
    expect(JSON.stringify(zustandFuerLeitung(s))).not.toContain(team.token)
    expect(JSON.stringify(zustandFuerTeams(s))).not.toContain('Lea')
  })

  it('nimmt gleiche Vornamen und gleiches Haus vom selben Gerät als dasselbe Team (Doppeltipp)', () => {
    const s = spielAnlegen()
    const a = teamBeitreten(s, { name: 'Lea und Tom', haus: 'Haus Morgenstern', socketId: 'sock-1' })
    const b = teamBeitreten(s, { name: ' lea und tom ', haus: 'haus morgenstern', socketId: 'sock-1' })
    expect(b.team).toBe(a.team)
    expect(b.wieder).toBe(true)
    expect(s.teams.size).toBe(1)
    teamBeitreten(s, { name: 'Lea und Tom', haus: 'Haus Abendstern', socketId: 'sock-2' })
    expect(s.teams.size).toBe(2)
  })

  it('übernimmt ein gleichnamiges Team nur, wenn dessen Gerät getrennt ist – mit neuem Token', () => {
    const s = spielAnlegen()
    const { team } = teamBeitreten(s, { name: 'Mia', haus: 'Haus Salz', socketId: 'alt' })
    const altesToken = team.token
    // Gerät noch verbunden: ein anderes Gerät mit gleichem Namen bekommt ein eigenes Team
    const fremd = teamBeitreten(s, { name: 'Mia', haus: 'Haus Salz', socketId: 'neu' })
    expect(fremd.team).not.toBe(team)
    teamEntfernen(s, fremd.team.id)
    // Gerät getrennt (iPad zurückgesetzt): Wiedereinstieg mit neuem Token, altes Token ungültig
    team.verbunden = false
    const wieder = teamBeitreten(s, { name: 'Mia', haus: 'Haus Salz', socketId: 'neu' })
    expect(wieder.team).toBe(team)
    expect(team.token).not.toBe(altesToken)
    expect(teamPerToken(s, altesToken)).toBeNull()
  })

  it('weist präparierte Schlüssel wie constructor und hasOwnProperty ab', () => {
    const s = spielAnlegen()
    const { team } = teamBeitreten(s, { name: 'X', haus: '' })
    rundeFreigeben(s)
    expect(abgabeSpeichern(s, team, { runde: 1, ort: 'constructor', ziel: 'constructor' })).toBe(false)
    expect(abgabeSpeichern(s, team, { runde: 1, ort: team.ort, ziel: team.ort, ueber: '__proto__', verkaeufe: { hasOwnProperty: 3, toString: 2 } })).toBe(true)
    expect(team.abgaben[1].ueber).toBeNull()
    expect(team.abgaben[1].verkaeufe).toEqual({})
    expect(ereignisSetzen(s, 2, 'constructor', 'e1')).toBe(false)
    expect(ereignisSetzen(s, 2, 'seide', 'toString')).toBe(false)
    abrechnen(s)
    expect(typeof Object.prototype.hasOwnProperty).toBe('function')
    // Auch direkt im Regelmodul: Verkäufe an „constructor“ verändern nichts Globales
    neueFaktoren({}, [{ raum: 'hanse', ort: 'constructor', verkaeufe: { hasOwnProperty: 1 } }], { hanse: 1 })
    expect(typeof Object.hasOwnProperty).toBe('function')
  })

  it('Pest gilt nur für Seidenstraße und Hanse', () => {
    expect(ereignisSetzen(spielAnlegen(), 1, 'sahara', 'e10')).toBe(false)
    expect(ereignisSetzen(spielAnlegen(), 1, 'hanse', 'e10')).toBe(true)
  })

  it('entfernt ein Team auf Wunsch der Spielleitung', () => {
    const s = spielAnlegen()
    const { team } = teamBeitreten(s, { name: 'A', haus: '' })
    expect(teamEntfernen(s, team.id)).toBe(true)
    expect(teamPerToken(s, team.token)).toBeNull()
  })

  it('gibt Runden frei, nimmt Abgaben an und rechnet ab', () => {
    const s = spielAnlegen()
    const { team } = teamBeitreten(s, { name: 'A', haus: '' })
    expect(rundeFreigeben(s).ok).toBe(true)
    expect(rundeFreigeben(s).fehler).toBe('laeuft')
    // gültige Abgabe (hier: bleiben); unbekannte Waren werden verworfen
    expect(abgabeSpeichern(s, team, { runde: 1, ort: team.ort, ziel: team.ort, schutz: false, verkaeufe: { gibtsnicht: 3 } })).toBe(true)
    expect(team.abgaben[1].verkaeufe).toEqual({})
    expect(abgabeSpeichern(s, team, { runde: 2, ort: team.ort, ziel: team.ort })).toBe(false)
    expect(abrechnen(s).ok).toBe(true)
    expect(s.status).toBe('abgerechnet')
    expect(s.abrechnung.runde).toBe(1)
    expect(typeof s.abrechnung.seed).toBe('string')
  })

  it('erlaubt Ereignisse nur für den passenden Raum und nicht für die laufende Runde', () => {
    const s = spielAnlegen()
    expect(ereignisSetzen(s, 1, 'hanse', 'e5')).toBe(false)     // Wüste gehört zur Sahara
    expect(ereignisSetzen(s, 1, 'hanse', 'e9')).toBe(true)
    expect(ereignisSetzen(s, 1, 'sahara', 'e14')).toBe(true)    // Seuchen-Nachricht für die Sahara (Pest dort umstritten)
    rundeFreigeben(s)
    expect(ereignisSetzen(s, 1, 'hanse', 'e4')).toBe(false)
    expect(ereignisSetzen(s, 2, 'hanse', 'e4')).toBe(true)
    expect(zustandFuerTeams(s).ereignisse.hanse).toBe('e9')
  })

  it('endet nach fünf abgerechneten Runden', () => {
    const s = spielAnlegen()
    teamBeitreten(s, { name: 'A', haus: '' })
    for (let r = 1; r <= RUNDEN; r++) { rundeFreigeben(s); abrechnen(s) }
    expect(s.status).toBe('ende')
    expect(rundeFreigeben(s).fehler).toBe('ende')
  })

  it('speichert Stände nur mit gültigen Werten', () => {
    const s = spielAnlegen()
    const { team } = teamBeitreten(s, { name: 'A', haus: '' })
    expect(standSpeichern(s, team, { runde: 1, ort: 'nirgendwo', silber: -5, wert: 'x' })).toBe(true)
    expect(team.staende[1]).toMatchObject({ ort: team.ort, silber: 0, wert: 0 })
    expect(standSpeichern(s, team, { runde: 9 })).toBe(false)
  })
})

describe('Handelsreise – Regeln des Klassenmarkts', () => {
  it('drückt den Preis, wo viele dieselbe Ware verkaufen, und lässt ihn sich erholen', () => {
    const abgaben = [
      { raum: 'hanse', ort: 'nowgorod', ziel: 'luebeck', schutz: true, verkaeufe: { salz: 8 } },
      { raum: 'hanse', ort: 'nowgorod', ziel: 'luebeck', schutz: true, verkaeufe: { salz: 4 } },
    ]
    const f1 = neueFaktoren({}, abgaben, { hanse: 4, seide: 4, sahara: 4 })
    // 2 von 4 Häusern verkaufen Salz in Nowgorod: 1 − 0,5 · 2/4 = 0,75
    expect(f1.hanse.nowgorod.salz).toBeCloseTo(0.75)
    expect(f1.hanse.nowgorod.wachs).toBe(1)
    const f2 = neueFaktoren(f1, [], { hanse: 4, seide: 4, sahara: 4 })
    expect(f2.hanse.nowgorod.salz).toBeCloseTo(0.95)
  })

  it('macht eine Strecke gefährlicher, wenn mehrere ohne Schutz fahren', () => {
    const abgaben = [
      { raum: 'sahara', ort: 'timbuktu', ziel: 'taghaza', schutz: false },
      { raum: 'sahara', ort: 'timbuktu', ziel: 'taghaza', schutz: false },
      { raum: 'sahara', ort: 'taghaza', ziel: 'timbuktu', schutz: false },
      { raum: 'sahara', ort: 'timbuktu', ziel: 'taghaza', schutz: true },
    ]
    const k = abrechnungsKontext(abgaben, { sahara: 4 })
    expect(k.sahara.verkehr['taghaza|timbuktu']).toBeCloseTo(1.3)

    const ohne = neuesTeam({ team: 'X', haus: '', raum: 'sahara', ort: 'timbuktu' })
    const mit = { ...neuesTeam({ team: 'Y', haus: '', raum: 'sahara', ort: 'timbuktu' }), reise: { ziel: 'taghaza', karawane: true } }
    const basis = risiko(ohne, 'taghaza', null, {})
    expect(risiko(ohne, 'taghaza', null, k.sahara)).toBeCloseTo(basis * 1.3)
    expect(risiko(mit, 'taghaza', null, k.sahara)).toBeCloseTo(risiko(mit, 'taghaza', null, {}))
  })

  it('Hanse-Schutz wirkt stärker, je mehr Häuser Mitglied sind', () => {
    const t = neuesTeam({ team: 'H', haus: '', raum: 'hanse', ort: 'luebeck' })
    t.flags.hanse = true
    expect(risiko(t, 'nowgorod', null, { hanseAnteil: 1 })).toBeLessThan(risiko(t, 'nowgorod', null, { hanseAnteil: 0.25 }))
    const k = abrechnungsKontext([{ raum: 'hanse', ort: 'luebeck', ziel: 'nowgorod', schutz: true }], { hanse: 4 })
    expect(k.hanse.hanseAnteil).toBe(0.25)
  })

  it('bietet Eilreisen über eine Zwischenstation an – mit Stapelrecht bei Durchfahrt durch Köln', () => {
    const z = ziele('hanse', 'london').find((x) => x.ort === 'nowgorod')
    expect(z.ueber).toBe('luebeck')
    const t = neuesTeam({ team: 'K', haus: '', raum: 'hanse', ort: 'luebeck' })
    t.ladung = { salz: 6 }
    t.reise = { ziel: 'london', ueber: 'koeln' }
    const ein = reiseAbrechnen(t, null, 'egal', {})
    expect(ein.some((e) => e.text.startsWith('Stapelrecht'))).toBe(true)
    expect(t.ort).toBe('london')
    // Im Klassenmarkt zählen beide Strecken der Eilreise
    const k = abrechnungsKontext([
      { raum: 'hanse', ort: 'london', ziel: 'nowgorod', ueber: 'luebeck', schutz: false },
      { raum: 'hanse', ort: 'luebeck', ziel: 'nowgorod', schutz: false },
    ], { hanse: 2 })
    expect(k.hanse.verkehr['luebeck|nowgorod']).toBeCloseTo(1.15)
  })

  it('wer bleibt, kennt in der nächsten Runde die aktuellen Preise', () => {
    const t = neuesTeam({ team: 'B', haus: '', raum: 'seide', ort: 'venedig' })
    t.reise = { ziel: 'venedig' }
    reiseAbrechnen(t, null, 'x', {})
    rundeAbschliessen(t)
    expect(t.mods.info).toBe(true)
  })

  it('rechnet mit gleichem Seed auf jedem Gerät gleich ab', () => {
    const a = neuesTeam({ team: 'Lea', haus: '', raum: 'sahara', ort: 'timbuktu' })
    a.ladung = { gold: 6 }
    a.reise = { ziel: 'taghaza', karawane: false }
    const b = JSON.parse(JSON.stringify(a))
    reiseAbrechnen(a, null, 'seed-123', {})
    reiseAbrechnen(b, null, 'seed-123', {})
    expect(a.ladung).toEqual(b.ladung)
    expect(a.ort).toBe('taghaza')
  })
})
