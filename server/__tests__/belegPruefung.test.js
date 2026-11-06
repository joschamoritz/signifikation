/**
 * Belegprüfung: Paarauswahl je Spieltag, die Regeln, wann geprüfte Satz-IDs gelten, und das Verhalten
 * bei ausgefallenem Parser-Dienst. pruefe.py mit Modell läuft nicht in der Testsuite (de_zdl_lg);
 * den Weg über den Dienst (--roh, ohne Modell) prüft pruefeRoh.test.js.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'
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
const { gepruefteSatzIds, gepruefteDetails, fetchBelegeGeprueft, planePruefung, pruefungStatus, pruefWeg, rueckfallErlaubt } = await import('../belegPruefung/index.js')
const { fetchBelege, belegeStand } = await import('../belege.js')
const { holeKandidatenImWorker } = await import('../belegPruefung/kandidatenImWorker.js')

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

describe('Belegprüfung über den Parser-Dienst', () => {
  const ENV = ['BELEGPRUEFUNG_PYTHON', 'SATZANALYSE_INTERN_URL', 'SATZANALYSE_INTERN_TOKEN', 'BELEGPRUEFUNG_RUECKFALL']
  const vorher = Object.fromEntries(ENV.map(k => [k, process.env[k]]))
  // Rohtokens aus dem echten Dienst (siehe pruefeRoh.test.js)
  const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/belegpruefung-roh.json', import.meta.url), 'utf8'))
  const TOKENS = new Map(FIXTURE.roh)
  const TUER = FIXTURE.paare.find(p => p.schluessel === 'tuer|oeffnen')
  const TEST_PYTHON = process.env.BELEGPRUEFUNG_TEST_PYTHON || vorher.BELEGPRUEFUNG_PYTHON
  const mitSpacy = Boolean(TEST_PYTHON) && spawnSync(TEST_PYTHON, ['-I', '-c', 'import spacy'], { timeout: 60_000 }).status === 0
  const echtesSetTimeout = globalThis.setTimeout
  let server
  let status = 503
  let anfragen = 0

  beforeEach(async () => {
    anfragen = 0
    server = http.createServer((req, res) => {
      anfragen++
      let roh = ''
      req.on('data', (d) => { roh += d })
      req.on('end', () => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        if (status !== 200) return res.end('{"error":"x"}')
        if (req.method === 'GET') return res.end('{"status":"ok"}')
        const { saetze } = JSON.parse(roh)
        res.end(JSON.stringify({ schema: 'satzanalyse-stapel/1', modell: { name: 'de_zdl_lg', version: '4.0.0', vektoren: 200000 }, ms: 1, docs: saetze.map(s => ({ tokens: TOKENS.get(s) })) }))
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    process.env.BELEGPRUEFUNG_PYTHON = 'python-im-test'
    process.env.SATZANALYSE_INTERN_URL = `http://127.0.0.1:${server.address().port}/satzanalyse/intern/v1/stapel`
    process.env.SATZANALYSE_INTERN_TOKEN = 't'.repeat(64)
    delete process.env.BELEGPRUEFUNG_RUECKFALL
    db.prepare('DELETE FROM beleg_pruefung').run()
    holeKandidatenImWorker.mockClear()
    holeKandidatenImWorker.mockResolvedValue({ stand: 5000, paare: [{ basis: 'Tür', kollokator: 'öffnen', saetze: TUER.saetze }] })
  })

  afterEach(async () => {
    await vi.waitFor(() => expect(pruefungStatus().laeuft).toBe(false))
    vi.restoreAllMocks()
    await new Promise((resolve) => server.close(resolve))
    for (const k of ENV) {
      if (vorher[k] === undefined) delete process.env[k]
      else process.env[k] = vorher[k]
    }
  })

  const lauf = async (paare = [{ basis: 'Tür', kollokator: 'öffnen' }]) => {
    planePruefung(paare, { erneut: true })
    await vi.waitFor(() => expect(pruefungStatus().laeuft).toBe(false), { timeout: 30_000 })
    return pruefungStatus()
  }

  it('wählt den Weg nach SATZANALYSE_INTERN_URL', () => {
    expect(pruefWeg()).toBe('dienst')
    delete process.env.SATZANALYSE_INTERN_URL
    expect(pruefWeg()).toBe('modell')
    expect(pruefungStatus()).toMatchObject({ quelle: 'modell', dienst: null })
  })

  it('Dienst nicht erreichbar: keine Kandidatensuche, Paare bleiben eingereiht, Wiederholung mit wachsendem Abstand', async () => {
    status = 503
    const zeitgeber = vi.spyOn(globalThis, 'setTimeout')
    const st = await lauf()
    expect(anfragen).toBe(1)   // nur die Bereitschaftsfrage
    expect(holeKandidatenImWorker).not.toHaveBeenCalled()
    expect(st).toMatchObject({ quelle: 'dienst', wartend: 1, dienst: { status: 'nicht erreichbar', versuche: 1 } })
    expect(st.letzterLauf.fehler).toMatch(/HTTP 503/)
    const ersterVersuch = Date.parse(st.dienst.naechsterVersuch)
    expect(ersterVersuch - Date.now()).toBeGreaterThan(50_000)
    expect(db.prepare('SELECT COUNT(*) AS n FROM beleg_pruefung').get().n).toBe(0)

    // Der geplante Zeitgeber startet wirklich einen neuen Lauf
    const [ausloesen, ms] = zeitgeber.mock.calls.findLast(([, wartezeit]) => wartezeit >= 60_000)
    expect(ms).toBe(60_000)
    ausloesen()
    await vi.waitFor(() => expect(pruefungStatus().laeuft).toBe(false))
    expect(anfragen).toBe(2)

    // Ein erneutes Einplanen (Tag speichern, Knopf) versucht es sofort wieder, ohne Doppel in der Schlange
    const dritter = await lauf()
    expect(anfragen).toBe(3)
    expect(dritter).toMatchObject({ wartend: 1, dienst: { versuche: 3 } })
    expect(Date.parse(dritter.dienst.naechsterVersuch)).toBeGreaterThan(ersterVersuch + 10 * 60_000)
  })

  it('falsches Token o. Ä.: kein automatisches Wiederholen, Status „konfiguration“', async () => {
    status = 401
    const st = await lauf()
    expect(st.dienst).toMatchObject({ status: 'konfiguration' })
    expect(st.dienst.naechsterVersuch).toBeUndefined()
    expect(st.wartend).toBeGreaterThan(0)
  })

  it.skipIf(!mitSpacy)('Dienst wieder da: Prüfung über --roh landet in beleg_pruefung, Status „ok“', async () => {
    process.env.BELEGPRUEFUNG_PYTHON = TEST_PYTHON
    status = 200
    const st = await lauf()
    expect(st.dienst).toEqual({ status: 'ok', versuche: 0, modell: 'de_zdl_lg 4.0.0 (200000 Vektoren)' })
    expect(st.wartend).toBe(0)
    expect(st.letzterLauf).toMatchObject({ quelle: 'dienst', fehler: null, fehlerhaft: 0, bestanden: 1 })
    expect(gepruefteSatzIds('Tür', 'öffnen')).toEqual(FIXTURE.erwartet.find(p => p.schluessel === 'tuer|oeffnen').bestanden)
    expect(gepruefteDetails('Tür', 'öffnen')).toEqual(FIXTURE.erwartet.find(p => p.schluessel === 'tuer|oeffnen').details)
  }, 60_000)

  it('mit BELEGPRUEFUNG_RUECKFALL=modell und genug Speicher fällt der Lauf auf das eigene Modell zurück', async () => {
    status = 503
    process.env.BELEGPRUEFUNG_RUECKFALL = 'modell'
    expect(rueckfallErlaubt(8 * 1024 ** 3)).toBe(true)
    expect(rueckfallErlaubt(1024 ** 3)).toBe(false)
    if (!rueckfallErlaubt()) return   // Testrechner mit wenig freiem Speicher: Regel oben genügt
    // Die kurzen Wiederholungen je Anfrage (3 s, 10 s) im Test ohne Wartezeit
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...rest) => echtesSetTimeout(fn, ms <= 30_000 ? 0 : ms, ...rest))
    const st = await lauf()
    expect(anfragen).toBe(3)   // keine Bereitschaftsfrage, drei Versuche der Stapel-Anfrage
    // „python-im-test“ gibt es nicht: Der Rückfall hat Python gestartet statt zu warten
    expect(st.letzterLauf.fehler).toMatch(/ENOENT|python-im-test/)
  })

  it('ohne Schalter nie Rückfall', () => {
    delete process.env.BELEGPRUEFUNG_RUECKFALL
    expect(rueckfallErlaubt(64 * 1024 ** 3)).toBe(false)
  })
})
