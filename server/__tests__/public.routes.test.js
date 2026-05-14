import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import publicRouter from '../routes/public.js'
import { belegeVerfuegbar } from '../belege.js'
import { invalidateCache, stmts } from '../store.js'
import db from '../db.js'

// ── Wiktionary-Fetch mocken (kein Netz in Tests) ─────────────────
vi.mock('../wiktionary.js', () => ({
  fetchWiktionary: vi.fn().mockResolvedValue({ ipa: 'ˈtɛst', definitionen: ['Prüfung'] }),
}))

// ── belege.js mocken (belege.db existiert in Testumgebung nicht) ──
vi.mock('../belege.js', () => ({
  fetchBelege: vi.fn().mockReturnValue([
    { tokens: [{ w: 'Test', ws: false, hl: true }, { w: 'machen', ws: false, hl: true }], quelle: 'kern' },
  ]),
  belegeVerfuegbar: vi.fn().mockReturnValue(false),
}))

// ── Helpers ───────────────────────────────────────────────────────

const TEST_DATUM = '2099-01-15'

const TEST_LEMMA = {
  id: 'test-lemma',
  lemma: 'Test',
  pos: 'Substantiv',
  wortart: 'Substantiv',
  runden: JSON.stringify([]),
  rundenInfo: JSON.stringify({}),
  notiz: '',
  link: '',
  definition: '',
  bonusFrage: JSON.stringify({ frage: 'Was ist das?', antworten: ['a', 'b'], korrekt: 0 }),
  ipa: '',
  definitionen: JSON.stringify([]),
  lueckenfueller: 0,
}

function seedLemma(row = TEST_LEMMA) {
  stmts.upsertLemma.run(row)
  // Lemmata-Index-Cache invalidieren, damit getLemmataIndex() neu lädt
  invalidateCache('lemmata.json')
}

function seedKalender(datum = TEST_DATUM, ids = ['test-lemma']) {
  stmts.upsertKalender.run({
    datum,
    ids: JSON.stringify(ids),
    thema: 'Thema Test',
    thema_kurz: 'Test',
    thema_quelle: '',
    lueckenfueller_id: '',
  })
}

function seedWortzwilling(datum = TEST_DATUM) {
  stmts.upsertWortzwilling.run({
    datum,
    wortA: 'Tag',
    wortB: 'Nacht',
    pos: 'Substantiv',
    kollokatoren: JSON.stringify([{ wort: 'hell', zuordnung: 'A', score: 1 }]),
    notiz: '',
    link: '',
  })
}

function seedZeitenwende(datum = TEST_DATUM) {
  stmts.upsertZeitenwende.run({
    datum,
    data: JSON.stringify({
      lemma: 'Test',
      words: [{ word: 'alt', freq: 5 }, { word: 'neu', freq: 3 }],
      notiz: '',
      link: '',
    }),
  })
}

function seedStats(datum = TEST_DATUM, game = 'kollokationen') {
  stmts.upsertStats.run({
    datum,
    spiel: game,
    user_id: '',
    plays: 10,
    scoreSum: 70,
    maxSum: 100,
    dist: JSON.stringify([]),
  })
}

// ── Test-Server-Setup ─────────────────────────────────────────────

describe('public routes integration', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', publicRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })
    const addr = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  beforeEach(() => {
    db.prepare('DELETE FROM kalender WHERE datum = ?').run(TEST_DATUM)
    db.prepare('DELETE FROM wortzwilling WHERE datum = ?').run(TEST_DATUM)
    db.prepare('DELETE FROM zeitenwende WHERE datum = ?').run(TEST_DATUM)
    db.prepare('DELETE FROM stats WHERE datum = ?').run(TEST_DATUM)
  })

  // ── /health ────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('antwortet mit 200 und db:ok (degraded ist in Testumgebung erlaubt)', async () => {
      const res = await fetch(`${baseUrl}/health`)
      expect(res.status).toBe(200)
      const body = await res.json()
      // 'degraded' ist ok – bedeutet nur, dass optionale Deps (belege.db) fehlen
      expect(['ok', 'degraded']).toContain(body.status)
      expect(body.checks.db).toBe('ok')
    })
  })

  // ── /api/v1/heute ──────────────────────────────────────────────

  describe('GET /api/v1/heute', () => {
    it('gibt 404 wenn kein Eintrag', async () => {
      const res = await fetch(`${baseUrl}/api/v1/heute?datum=${TEST_DATUM}`)
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toMatch(TEST_DATUM)
    })

    it('gibt Tageseintrag zurück wenn Lemma und Kalender vorhanden', async () => {
      seedLemma()
      seedKalender()
      const res = await fetch(`${baseUrl}/api/v1/heute?datum=${TEST_DATUM}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.datum).toBe(TEST_DATUM)
      expect(Array.isArray(body.lemmata)).toBe(true)
      expect(body.lemmata).toHaveLength(1)
      expect(body.lemmata[0].lemma).toBe('Test')
      expect(body.thema).toBe('Thema Test')
    })

    it('gibt 400 zurück bei ungültigem Datumsformat', async () => {
      const res = await fetch(`${baseUrl}/api/v1/heute?datum=01-15`)
      expect(res.status).toBe(400)
    })
  })

  // ── /api/v1/wortzwilling ───────────────────────────────────────

  describe('GET /api/v1/wortzwilling', () => {
    it('gibt 404 wenn kein Eintrag', async () => {
      const res = await fetch(`${baseUrl}/api/v1/wortzwilling?datum=${TEST_DATUM}`)
      expect(res.status).toBe(404)
    })

    it('gibt Wort-Zwilling ohne score-Felder zurück', async () => {
      seedWortzwilling()
      const res = await fetch(`${baseUrl}/api/v1/wortzwilling?datum=${TEST_DATUM}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.wortA).toBe('Tag')
      expect(body.wortB).toBe('Nacht')
      expect(Array.isArray(body.kollokatoren)).toBe(true)
      // score darf nicht enthalten sein
      for (const k of body.kollokatoren) {
        expect(k).not.toHaveProperty('score')
        expect(k).toHaveProperty('wort')
        expect(k).toHaveProperty('zuordnung')
      }
    })
  })

  // ── /api/v1/zeitenwende ────────────────────────────────────────

  describe('GET /api/v1/zeitenwende', () => {
    it('gibt 404 wenn kein Eintrag', async () => {
      const res = await fetch(`${baseUrl}/api/v1/zeitenwende?datum=${TEST_DATUM}`)
      expect(res.status).toBe(404)
    })

    it('gibt Zeitenwende mit ipa und definitionen zurück', async () => {
      seedZeitenwende()
      const res = await fetch(`${baseUrl}/api/v1/zeitenwende?datum=${TEST_DATUM}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.lemma).toBe('Test')
      expect(Array.isArray(body.words)).toBe(true)
      expect(typeof body.ipa).toBe('string')
      expect(Array.isArray(body.definitionen)).toBe(true)
    })
  })

  // ── POST /api/v1/stats ─────────────────────────────────────────

  describe('POST /api/v1/stats', () => {
    it('speichert Spielstatistik und gibt ok zurück', async () => {
      const res = await fetch(`${baseUrl}/api/v1/stats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: 'kollokationen', datum: TEST_DATUM, score: 8, max: 10 }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)

      const row = stmts.getStatsByKey.get(TEST_DATUM, 'kollokationen', '')
      expect(row).toBeTruthy()
      expect(row.plays).toBeGreaterThanOrEqual(1)
    })

    it('gibt 400 bei fehlendem Pflichtfeld', async () => {
      const res = await fetch(`${baseUrl}/api/v1/stats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: 'kollokationen', datum: TEST_DATUM }),
      })
      expect(res.status).toBe(400)
    })

    it('gibt 400 bei ungültigem Spielmodus', async () => {
      const res = await fetch(`${baseUrl}/api/v1/stats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: 'unbekannt', datum: TEST_DATUM, score: 5, max: 10 }),
      })
      expect(res.status).toBe(400)
    })
  })

  // ── GET /api/v1/percentile ─────────────────────────────────────

  describe('GET /api/v1/percentile', () => {
    it('gibt available:false zurück wenn keine Daten', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/percentile?datum=${TEST_DATUM}&game=kollokationen&score=7&max=10`,
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(false)
    })

    it('gibt Percentile zurück wenn Daten vorhanden', async () => {
      seedStats()
      const res = await fetch(
        `${baseUrl}/api/v1/percentile?datum=${TEST_DATUM}&game=kollokationen&score=7&max=10`,
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.available).toBe(true)
      expect(typeof body.percentile).toBe('number')
      expect(typeof body.plays).toBe('number')
    })

    it('gibt 400 bei ungültigem Datum', async () => {
      const res = await fetch(
        `${baseUrl}/api/v1/percentile?datum=15-01&game=kollokationen&score=7&max=10`,
      )
      expect(res.status).toBe(400)
    })
  })

  // ── GET /api/v1/bonus ──────────────────────────────────────────

  describe('GET /api/v1/bonus', () => {
    it('gibt null zurück wenn Lemma nicht existiert', async () => {
      const res = await fetch(`${baseUrl}/api/v1/bonus?id=nicht-vorhanden`)
      expect(res.status).toBe(200)
      expect(await res.json()).toBeNull()
    })

    it('gibt Bonusfrage zurück wenn Lemma mit bonusFrage vorhanden', async () => {
      seedLemma()
      const res = await fetch(`${baseUrl}/api/v1/bonus?id=test-lemma`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).not.toBeNull()
      expect(body.frage).toBe('Was ist das?')
    })
  })

  // ── GET /api/v1/belege ─────────────────────────────────────────

  describe('GET /api/v1/belege', () => {
    it('gibt 400 zurück wenn Pflichtparameter fehlen', async () => {
      const res = await fetch(`${baseUrl}/api/v1/belege`)
      expect(res.status).toBe(400)
    })

    it('gibt 400 zurück wenn nur lemma angegeben', async () => {
      const res = await fetch(`${baseUrl}/api/v1/belege?lemma=Wasser`)
      expect(res.status).toBe(400)
    })

    it('gibt 400 zurück bei ungültigen Zeichen im lemma', async () => {
      const res = await fetch(`${baseUrl}/api/v1/belege?lemma=%3Cscript%3E&collocate=machen`)
      expect(res.status).toBe(400)
    })

    it('gibt leeres Array zurück wenn belege.db nicht verfügbar', async () => {
      // belegeVerfuegbar ist per Mock auf false gesetzt
      const res = await fetch(`${baseUrl}/api/v1/belege?lemma=Wasser&collocate=trinken`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(0)
    })

    it('gibt Belege zurück wenn belege.db verfügbar', async () => {
      vi.mocked(belegeVerfuegbar).mockReturnValueOnce(true)
      const res = await fetch(`${baseUrl}/api/v1/belege?lemma=Wasser&collocate=trinken`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
      expect(body[0]).toHaveProperty('tokens')
      expect(body[0]).toHaveProperty('quelle')
      expect(Array.isArray(body[0].tokens)).toBe(true)
    })

    it('gibt leeres Array zurück bei Fehler in fetchBelege', async () => {
      vi.mocked(belegeVerfuegbar).mockReturnValueOnce(true)
      const { fetchBelege } = await import('../belege.js')
      vi.mocked(fetchBelege).mockImplementationOnce(() => { throw new Error('DB-Fehler') })
      // Andere Parameter, damit kein Cache-Hit der vorherigen Anfrage greift
      const res = await fetch(`${baseUrl}/api/v1/belege?lemma=Feuer&collocate=loeschen`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(0)
    })
  })
})
