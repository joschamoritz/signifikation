/**
 * Belegprüfung: Paarauswahl je Spieltag und die Regeln, wann geprüfte Satz-IDs gelten.
 * Der Python-Teil (pruefe.py) braucht de_zdl_lg und läuft deshalb nicht in der Testsuite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'

vi.mock('../belege.js', () => ({
  fetchBelege: vi.fn(() => []),
  belegeStand: vi.fn(() => 5000),
}))
// Ein eingeplanter Lauf startet sofort; hier ohne Worker und ohne Python – die Kandidatensuche
// scheitert absichtlich, der Lauf endet mit einem protokollierten Fehler
vi.mock('../belegPruefung/kandidatenImWorker.js', () => ({
  holeKandidatenImWorker: vi.fn(() => Promise.reject(new Error('im Test kein Worker'))),
}))
vi.mock('../lueckenfuellerImWorker.js', () => ({ buildLueckenfuellerImWorker: vi.fn(async () => null) }))

const { paareFuerDatum, paarSchluessel } = await import('../belegPruefung/paare.js')
const { gepruefteSatzIds, gepruefteDetails, fetchBelegeGeprueft, planePruefung, pruefungStatus } = await import('../belegPruefung/index.js')
const { fetchBelege, belegeStand } = await import('../belege.js')

describe('paareFuerDatum', () => {
  const lemmataById = new Map([
    ['panik', { lemma: 'Panik', runden: { kollokatoren: [{ wort: 'Hysterie' }, { wort: 'ausbrechen' }] } }],
    ['traum', { lemma: 'Traum', runden: { kollokatoren: [{ wort: 'süß' }] } }],
  ])
  const maps = {
    kalender: { '2026-11-01': { ids: ['panik', 'traum', 'fehlt'] }, '2026-11-02': ['panik'] },
    wortzwilling: { '2026-11-01': { wortA: 'Glaube', wortB: 'Wissen', kollokatoren: [{ wort: 'fromm', zuordnung: 'A' }, { wort: 'fundiert', zuordnung: 'B' }] } },
    zeitenwende: { '2026-11-01': { lemma: 'Religion', words: [{ wort: 'Konfession' }] } },
  }

  it('sammelt Kollokationen-Runde, Wort-Zwilling (nach Zuordnung) und Zeitenwende', () => {
    expect(paareFuerDatum('2026-11-01', maps, lemmataById)).toEqual([
      { basis: 'Panik', kollokator: 'Hysterie' },
      { basis: 'Panik', kollokator: 'ausbrechen' },
      { basis: 'Traum', kollokator: 'süß' },
      { basis: 'Glaube', kollokator: 'fromm' },
      { basis: 'Wissen', kollokator: 'fundiert' },
      { basis: 'Religion', kollokator: 'Konfession' },
    ])
  })

  it('versteht den alten Kalenderwert (nur ein Array) und leere Tage', () => {
    expect(paareFuerDatum('2026-11-02', maps, lemmataById)).toHaveLength(2)
    expect(paareFuerDatum('2030-01-01', maps, lemmataById)).toEqual([])
  })

  it('der Schlüssel ignoriert Groß- und Kleinschreibung', () => {
    expect(paarSchluessel('Panik', 'Hysterie')).toBe(paarSchluessel('panik', 'hysterie'))
  })
})

describe('geprüfte Satz-IDs', () => {
  const speichere = (row) => db.prepare(`
    INSERT OR REPLACE INTO beleg_pruefung (basis, kollokator, belege_stand, kandidaten, bestanden, satz_ids, geprueft_am)
    VALUES (@basis, @kollokator, @stand, @kandidaten, @bestanden, @satzIds, '2026-10-29T12:00:00Z')
  `).run(row)

  beforeEach(() => {
    db.prepare('DELETE FROM beleg_pruefung').run()
    belegeStand.mockReturnValue(5000)
    fetchBelege.mockClear()
  })

  it('liefert die IDs unabhängig von der Schreibung der Anfrage', () => {
    speichere({ basis: 'gewaltig', kollokator: 'heer', stand: 5000, kandidaten: 78, bestanden: 2, satzIds: '[11,42]' })
    expect(gepruefteSatzIds('gewaltig', 'Heer')).toEqual([11, 42])
  })

  it('verwirft IDs aus einem anderen Belegbestand', () => {
    speichere({ basis: 'gewaltig', kollokator: 'heer', stand: 4000, kandidaten: 78, bestanden: 2, satzIds: '[11,42]' })
    expect(gepruefteSatzIds('gewaltig', 'heer')).toBeNull()
  })

  it('ohne bestandene Sätze bleibt es bei der normalen Suche', () => {
    speichere({ basis: 'gewaltig', kollokator: 'namenlos', stand: 5000, kandidaten: 23, bestanden: 0, satzIds: '[]' })
    expect(gepruefteSatzIds('gewaltig', 'namenlos')).toBeNull()
    expect(gepruefteSatzIds('nie', 'geprueft')).toBeNull()
  })

  it('fetchBelegeGeprueft reicht die IDs an fetchBelege weiter', () => {
    speichere({ basis: 'traum', kollokator: 'süß', stand: 5000, kandidaten: 80, bestanden: 1, satzIds: '[7]' })
    fetchBelegeGeprueft('Traum', 'süß', { limit: 5, year: null })
    expect(fetchBelege).toHaveBeenCalledWith('Traum', 'süß', { limit: 5, year: null, satzIds: [7] })
    fetchBelegeGeprueft('Traum', 'Bett', { limit: 5 })
    expect(fetchBelege).toHaveBeenLastCalledWith('Traum', 'Bett', { limit: 5, satzIds: null })
  })
})

describe('gepruefteDetails (Relation und Position, Migration 0034)', () => {
  const speichere = (row) => db.prepare(`
    INSERT OR REPLACE INTO beleg_pruefung (basis, kollokator, belege_stand, kandidaten, bestanden, satz_ids, details, geprueft_am)
    VALUES (@basis, @kollokator, @stand, 10, 1, '[3]', @details, '2026-10-29T12:00:00Z')
  `).run(row)

  beforeEach(() => {
    db.prepare('DELETE FROM beleg_pruefung').run()
    belegeStand.mockReturnValue(5000)
  })

  it('liefert Relation und Position je Satz', () => {
    speichere({ basis: 'traum', kollokator: 'süß', stand: 5000, details: '{"3":{"rel":["ATTR"],"start":32,"ende":36}}' })
    expect(gepruefteDetails('Traum', 'süß')).toEqual({ 3: { rel: ['ATTR'], start: 32, ende: 36 } })
  })

  it('null für Zeilen von vor 0034 und für einen anderen Belegbestand', () => {
    speichere({ basis: 'traum', kollokator: 'süß', stand: 5000, details: null })
    expect(gepruefteDetails('traum', 'süß')).toBeNull()
    speichere({ basis: 'traum', kollokator: 'süß', stand: 4000, details: '{"3":{"rel":["ATTR"],"start":1,"ende":2}}' })
    expect(gepruefteDetails('traum', 'süß')).toBeNull()
  })
})

describe('planePruefung', () => {
  const vorher = process.env.BELEGPRUEFUNG_PYTHON
  afterEach(() => {
    if (vorher === undefined) delete process.env.BELEGPRUEFUNG_PYTHON
    else process.env.BELEGPRUEFUNG_PYTHON = vorher
  })

  it('ist ohne BELEGPRUEFUNG_PYTHON aus und reiht nichts ein', () => {
    delete process.env.BELEGPRUEFUNG_PYTHON
    expect(planePruefung([{ basis: 'Panik', kollokator: 'Hysterie' }])).toEqual({ status: 'aus', neu: 0 })
    expect(pruefungStatus()).toMatchObject({ aktiv: false, laeuft: false, wartend: 0 })
  })

  it('prüft Lückenfüller-Paare ohne Relation und Position nach, andere Paare nicht', async () => {
    process.env.BELEGPRUEFUNG_PYTHON = 'python-im-test'
    belegeStand.mockReturnValue(5000)
    db.prepare('DELETE FROM beleg_pruefung').run()
    db.prepare(`INSERT INTO beleg_pruefung (basis, kollokator, belege_stand, kandidaten, bestanden, satz_ids, details, geprueft_am)
      VALUES ('traum', 'süß', 5000, 80, 30, '[1]', NULL, '2026-10-29T12:00:00Z')`).run()

    expect(planePruefung([{ basis: 'Traum', kollokator: 'süß' }]).neu).toBe(0)
    expect(planePruefung([{ basis: 'Traum', kollokator: 'süß', mitDetails: true }]).neu).toBe(1)

    // Der Lauf scheitert im Test an der Kandidatensuche und gibt die Warteschlange wieder frei
    await vi.waitFor(() => expect(pruefungStatus().laeuft).toBe(false))
    expect(pruefungStatus().letzterLauf.fehler).toMatch(/kein Worker/)
  })
})
