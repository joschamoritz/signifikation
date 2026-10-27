// Werkzeuge › Wort prüfen (Schritt 7b): Prüfungen im Admin-Kalender-Router.
//   - analyze-kollokation: Eignung ab MIN_KOLLOKATOREN (Spielweg), Antwortform
//   - analyze-lueckenfueller: eine Prüfung gleichzeitig (409), Zwischenspeicher
// Der Router bekommt alle Abhängigkeiten als Parameter; hier Attrappen statt Korpus-Datenbanken.
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminCalendarRouter, leereLueckenfuellerCache } from '../routes/admin-calendar.js'
import { validate, analyzeKollQuerySchema, analyzeLueckenfuellerQuerySchema, lueckenfuellerGenerateSchema } from '../middleware/validate.js'

const durchlass = (_req, _res, next) => next()
const MIN = 10

function baueApp(deps) {
  const app = express()
  app.use(express.json())
  app.use(createAdminCalendarRouter({
    adminLimiter: durchlass,
    requireAuth: durchlass,
    validate,
    analyzeKollQuerySchema,
    analyzeLueckenfuellerQuerySchema,
    lueckenfuellerGenerateSchema,
    stmts: { upsertLemma: { run: () => {} } },
    lemmaToRow: (l) => l,
    invalidateCache: () => {},
    MIN_KOLLOKATOREN: MIN,
    getLemmataIndex: () => ({ byId: new Map(), byLemma: new Map() }),
    toId: (w) => w.toLowerCase(),
    adminError: (res, err) => res.status(500).json({ error: String(err?.message ?? err) }),
    serverError: (res, err) => res.status(500).json({ error: String(err?.message ?? err) }),
    logger: { info() {}, warn() {}, error() {} },
    ...deps,
  }))
  return app
}

async function mitServer(app, fn) {
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const eintrag = (wort, logDice, platz) => ({ wort, logDice, platz })
// Eine Antwort von fetchKollokatorenAnalyse mit n Kollokatoren im Pool
function analyse(pool, { pos = 'Substantiv', start = 9 } = {}) {
  const alle = Array.from({ length: Math.min(pool, 25) }, (_, i) => eintrag(`k${i + 1}`, Number((start - i * 0.1).toFixed(2)), i + 1))
  return {
    lemma: 'Testwort', pos, pool,
    gesucht: alle.slice(0, 3),
    ablenker: alle.slice(3, 10),
    kollokatoren: alle,
  }
}

describe('GET /admin/analyze-kollokation (Spielweg, Schwelle 10)', () => {
  it('9 Kollokatoren → nicht geeignet, 10 → geeignet; Antwort nennt die Schwelle', async () => {
    const fetchKollokatorenAnalyse = vi.fn(async (_lemma, _pos) => analyse(9))
    const app = baueApp({ fetchKollokatorenAnalyse, fetchBonusQuestion: async () => null })
    await mitServer(app, async (basis) => {
      let d = await (await fetch(`${basis}/admin/analyze-kollokation?q=Testwort&pos=Substantiv`)).json()
      expect(d).toMatchObject({ lemma: 'Testwort', pos: 'Substantiv', pool: 9, usable: false, min: 10 })

      fetchKollokatorenAnalyse.mockImplementation(async () => analyse(10))
      d = await (await fetch(`${basis}/admin/analyze-kollokation?q=Testwort&pos=Substantiv`)).json()
      expect(d).toMatchObject({ pool: 10, usable: true, min: 10 })
    })
  })

  it('liefert gesucht (Platz 1–3), Ablenker und Plätze 1–25 aus der Analyse, ohne interne Felder', async () => {
    const app = baueApp({ fetchKollokatorenAnalyse: async () => analyse(40), fetchBonusQuestion: async () => ({ label: 'Prädikativ', question: 'Q?', correct: 'a', options: ['a', 'b'] }) })
    await mitServer(app, async (basis) => {
      const d = await (await fetch(`${basis}/admin/analyze-kollokation?q=Testwort&pos=Substantiv`)).json()
      expect(d.gesucht.map((k) => k.platz)).toEqual([1, 2, 3])
      expect(d.ablenker).toHaveLength(7)
      expect(d.kollokatoren).toHaveLength(25)
      expect(d.bonus).toMatchObject({ label: 'Prädikativ' })
      expect(d).not.toHaveProperty('score')
    })
  })

  it('ohne Wortart gewinnt die ergiebigste, mit Wortart wird genau diese gefragt', async () => {
    const aufrufe = []
    const fetchKollokatorenAnalyse = async (lemma, pos) => {
      aufrufe.push(pos)
      return analyse({ Substantiv: 4, Verb: 31, Adjektiv: 12 }[pos], { pos })
    }
    const app = baueApp({ fetchKollokatorenAnalyse, fetchBonusQuestion: async () => null })
    await mitServer(app, async (basis) => {
      let d = await (await fetch(`${basis}/admin/analyze-kollokation?q=laufen`)).json()
      expect(d.pos).toBe('Verb')
      expect(aufrufe.sort()).toEqual(['Adjektiv', 'Substantiv', 'Verb'])

      aufrufe.length = 0
      d = await (await fetch(`${basis}/admin/analyze-kollokation?q=laufen&pos=Adjektiv`)).json()
      expect(d.pos).toBe('Adjektiv')
      expect(aufrufe).toEqual(['Adjektiv'])
    })
  })

  it('lehnt Wörter über 100 Zeichen ab', async () => {
    const app = baueApp({ fetchKollokatorenAnalyse: async () => analyse(20), fetchBonusQuestion: async () => null })
    await mitServer(app, async (basis) => {
      const res = await fetch(`${basis}/admin/analyze-kollokation?q=${'x'.repeat(101)}`)
      expect(res.status).toBe(400)
    })
  })
})

describe('GET /admin/analyze-lueckenfueller (eine Prüfung gleichzeitig, Zwischenspeicher)', () => {
  let tor
  let buildLueckenfueller
  beforeEach(() => {
    leereLueckenfuellerCache()
    let oeffne
    tor = { promise: new Promise((resolve) => { oeffne = resolve }), oeffne: () => oeffne([{ type: 'choice', kollokator: 'scharfe', punkte: 1 }]) }
    // Nur „Substantiv“ liefert Runden, und erst, wenn das Tor offen ist
    buildLueckenfueller = vi.fn((_lemma, pos) => {
      return pos === 'Substantiv' ? tor.promise : Promise.resolve(null)
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('zweite gleichzeitige Prüfung → 409, danach kommt dasselbe Wort aus dem Zwischenspeicher', async () => {
    const app = baueApp({ buildLueckenfueller })
    await mitServer(app, async (basis) => {
      const erste = fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      await vi.waitFor(() => expect(buildLueckenfueller).toHaveBeenCalled())

      const zweite = await fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      expect(zweite.status).toBe(409)
      expect((await zweite.json()).error).toMatch(/^Diese Prüfung läuft schon/)
      // auch ein anderes Wort wartet nicht parallel
      const anderes = await fetch(`${basis}/admin/analyze-lueckenfueller?q=Debatte`)
      expect(anderes.status).toBe(409)

      tor.oeffne()
      const antwort = await erste
      expect(antwort.status).toBe(200)
      const d = await antwort.json()
      expect(d).toMatchObject({ ok: true, usable: true, pos: 'Substantiv', rounds: 1 })

      // Nach dem Ende: gleiches Wort aus dem Zwischenspeicher, ohne neue Berechnung
      const vorher = buildLueckenfueller.mock.calls.length
      const dritte = await fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      expect(dritte.status).toBe(200)
      expect(buildLueckenfueller.mock.calls.length).toBe(vorher)
      expect(await dritte.json()).toMatchObject({ usable: true, rounds: 1 })

      // und die Sperre ist wieder frei: ein anderes Wort wird gerechnet
      tor.oeffne()
      const viertes = await fetch(`${basis}/admin/analyze-lueckenfueller?q=Debatte`)
      expect(viertes.status).toBe(200)
    })
  })

  it('ein Fehler gibt die Sperre wieder frei', async () => {
    let zaehler = 0
    const kaputt = vi.fn(async () => { zaehler += 1; if (zaehler === 1) throw new Error('Datenbank weg'); return null })
    const app = baueApp({ buildLueckenfueller: kaputt })
    await mitServer(app, async (basis) => {
      expect((await fetch(`${basis}/admin/analyze-lueckenfueller?q=Wort`)).status).toBe(500)
      const nochmal = await fetch(`${basis}/admin/analyze-lueckenfueller?q=Wort`)
      expect(nochmal.status).toBe(200)
      expect(await nochmal.json()).toMatchObject({ ok: false, usable: false })
    })
  })
})

describe('Lückenfüller: gemeinsame Sperre, Zwischenspeicher für Erzeugen, Wortart im Schlüssel', () => {
  const POST = (basis, pfad, body) => fetch(`${basis}${pfad}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  const vorhanden = (lemma, pos = 'Substantiv') => ({ id: lemma.toLowerCase(), lemma, pos })
  const indexMit = (...eintraege) => () => ({
    byId: new Map(eintraege.map((e) => [e.id, e])),
    byLemma: new Map(eintraege.map((e) => [e.lemma, e])),
  })
  const runden = [{ type: 'choice', kollokator: 'scharfe', punkte: 1 }]

  beforeEach(() => leereLueckenfuellerCache())
  afterEach(() => vi.restoreAllMocks())

  it('Erzeugen und „Runden für ein Lemma“ bekommen 409, solange eine Prüfung läuft; Auto-Ergänzung beim Speichern nicht', async () => {
    let oeffne
    const tor = new Promise((resolve) => { oeffne = resolve })
    const build = vi.fn((_l, pos) => (pos === 'Substantiv' ? tor : Promise.resolve(null)))
    const app = baueApp({ buildLueckenfueller: build, getLemmataIndex: indexMit(vorhanden('Kritik')) })
    await mitServer(app, async (basis) => {
      const pruefung = fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      await vi.waitFor(() => expect(build).toHaveBeenCalled())
      const aufrufe = build.mock.calls.length

      const erzeugen = await POST(basis, '/admin/lueckenfueller/generate', { lemmaName: 'Kritik' })
      expect(erzeugen.status).toBe(409)
      expect((await erzeugen.json()).error).toMatch(/^Es läuft schon eine Lückenfüller-Prüfung oder -Erzeugung/)
      expect(build.mock.calls.length).toBe(aufrufe)

      oeffne(runden)
      expect((await pruefung).status).toBe(200)
      // Sperre frei (auch nach 409 der anderen): Erzeugen läuft jetzt
      const danach = await POST(basis, '/admin/lueckenfueller/generate', { lemmaName: 'Kritik' })
      expect(danach.status).toBe(200)
    })
  })

  it('der abgelehnte Zweite gibt die Sperre des Starters nicht frei', async () => {
    let oeffne
    const tor = new Promise((resolve) => { oeffne = resolve })
    const build = vi.fn(() => tor)
    const app = baueApp({ buildLueckenfueller: build, getLemmataIndex: indexMit(vorhanden('Kritik'), vorhanden('Debatte')) })
    await mitServer(app, async (basis) => {
      const erzeugen = POST(basis, '/admin/lueckenfueller/generate', { lemmaName: 'Kritik' })
      await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1))
      expect((await POST(basis, '/admin/lueckenfueller/generate', { lemmaName: 'Debatte' })).status).toBe(409)
      // Auch nach der abgelehnten Anfrage ist die Sperre noch belegt
      expect((await POST(basis, '/admin/lueckenfueller/generate', { lemmaName: 'Debatte' })).status).toBe(409)
      expect(build).toHaveBeenCalledTimes(1)
      oeffne(runden)
      expect((await erzeugen).status).toBe(200)
    })
  })

  it('Erzeugen nutzt ein frisches Prüfergebnis zum selben Wort und derselben Wortart', async () => {
    const build = vi.fn(async (_l, pos) => (pos === 'Substantiv' ? runden : null))
    const app = baueApp({ buildLueckenfueller: build, getLemmataIndex: indexMit(vorhanden('Kritik')) })
    await mitServer(app, async (basis) => {
      expect((await fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)).status).toBe(200)
      const nachPruefung = build.mock.calls.length
      const erzeugen = await POST(basis, '/admin/lueckenfueller/generate', { lemmaName: 'Kritik' })
      expect(await erzeugen.json()).toMatchObject({ ok: true, rounds: 1 })
      expect(build.mock.calls.length).toBe(nachPruefung)
    })
  })

  it('Schlüssel nutzt die Wortart des Lemmas, sonst die Vorgabe (leere Wortart zählt nicht als eigener Wert)', async () => {
    const build = vi.fn(async () => runden)
    const app = baueApp({ buildLueckenfueller: build, getLemmataIndex: indexMit({ id: 'laufen', lemma: 'laufen', pos: '' }) })
    await mitServer(app, async (basis) => {
      await fetch(`${basis}/admin/analyze-lueckenfueller?q=laufen&pos=Verb`)
      const n = build.mock.calls.length
      // Zweiter Aufruf mit anderer Vorgabe-Wortart: anderer Schlüssel, wird neu gerechnet
      await fetch(`${basis}/admin/analyze-lueckenfueller?q=laufen&pos=Adjektiv`)
      expect(build.mock.calls.length).toBeGreaterThan(n)
      const m = build.mock.calls.length
      await fetch(`${basis}/admin/analyze-lueckenfueller?q=laufen&pos=Verb`)
      expect(build.mock.calls.length).toBe(m)
    })
  })

  it('Cache leeren erzwingt eine neue Berechnung', async () => {
    const build = vi.fn(async (_l, pos) => (pos === 'Substantiv' ? runden : null))
    const app = baueApp({ buildLueckenfueller: build })
    await mitServer(app, async (basis) => {
      await fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      const n = build.mock.calls.length
      await fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      expect(build.mock.calls.length).toBe(n)
      leereLueckenfuellerCache()
      await fetch(`${basis}/admin/analyze-lueckenfueller?q=Kritik`)
      expect(build.mock.calls.length).toBeGreaterThan(n)
    })
  })
})
