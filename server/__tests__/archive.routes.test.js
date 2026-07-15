/**
 * server/__tests__/archive.routes.test.js
 *
 * End-to-End-Test der SEO-Archiv-Routen (/archiv, /wort/:slug, /sitemap.xml)
 * gegen einen gemockten Store – deterministisch, ohne DB.
 *
 * Prueft v. a.:
 *  - nur VERGANGENE Tage werden indexiert (zukuenftige Lemmata fehlen)
 *  - interne Felder (Loesung/notiz/bonusFrage) leaken nicht in die Antwort
 *  - kanonische Slug-Redirects + 404 fuer Unbekanntes
 */
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../store.js', () => ({
  load: vi.fn(() => [
    {
      id: 'a', lemma: 'Öl', pos: 'Substantiv', wortart: 'Substantiv', ipa: 'øːl',
      definition: 'fettige Flüssigkeit', definitionen: ['fettige Flüssigkeit'],
      runden: { kollokatoren: [{ wort: 'GEHEIMLOESUNG' }], notiz: 'GEHEIM' },
      notiz: 'INTERN-NOTIZ', bonusFrage: { frage: 'LEAK-FRAGE' },
    },
    { id: 'b', lemma: 'Haus', wortart: 'Substantiv', ipa: 'haʊ̯s', definitionen: ['Gebäude'], runden: {} },
    { id: 'c', lemma: 'Zukunftswort', wortart: 'Substantiv', definitionen: ['nur zukuenftig'] },
  ]),
  loadKalender: vi.fn(() => ({
    '2020-03-14': { ids: ['a', 'b'], thema_kurz: 'Tag des Öls' },
    '2999-12-31': { ids: ['c'] }, // nur Zukunft → darf nicht indexiert werden
  })),
}))

vi.mock('../belege.js', () => ({
  fetchBelegeForLemma: vi.fn((lemma) =>
    lemma === 'Öl'
      ? [{ satz: 'Das Öl floss langsam.', quelle: 'Testkorpus 2018 · CC BY-SA',
          kwic: { left: 'Das', keyword: 'Öl', right: 'floss langsam.' } }]
      : []),
}))

vi.mock('../wortprofil.js', () => ({
  fetchSyntagmaticPatterns: vi.fn((lemma) =>
    lemma === 'Öl'
      ? { total: 500, patterns: [
          { kollokator: 'flüssig', pos: 'Adjektiv', relation: 'ATTR', muster: 'Adjektivattribut', prep: '', frequency: 210, logDice: 9.1, anteil: 4.2, stellung: 'vor' },
          { kollokator: 'zähflüssig', pos: 'Adjektiv', relation: 'ATTR', muster: 'Adjektivattribut', prep: '', frequency: 80, logDice: 8.3, anteil: 1.6, stellung: 'vor' },
        ] }
      : { total: 0, patterns: [] }),
  fetchSecondaryCollocates: vi.fn(() => []),
}))

const { default: archiveRouter } = await import('../routes/archive.js')
const { _resetArchiveCache } = await import('../archive/index.js')

describe('SEO-Archiv-Routen', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use('/', archiveRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => _resetArchiveCache())

  it('GET /wort/oel liefert oeffentliche Inhalte ohne Leak', async () => {
    const res = await fetch(`${baseUrl}/wort/oel`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('Öl')
    expect(html).toContain('fettige Flüssigkeit')
    expect(html).toContain('href="https://signifikation.de/wort/oel"')
    for (const secret of ['GEHEIMLOESUNG', 'GEHEIM', 'INTERN-NOTIZ', 'LEAK-FRAGE', 'kollokatoren', 'bonusFrage']) {
      expect(html).not.toContain(secret)
    }
  })

  it('zeigt Tagesthema (mit Datum), KWiC-Beleg und Muster-Tabelle', async () => {
    const html = await (await fetch(`${baseUrl}/wort/oel`)).text()
    expect(html).toContain('Tag des Öls')
    expect(html).toContain('14. März 2020') // Datum des Auftretens
    expect(html).toContain('Aus dem Korpus')
    // KWiC-Beleg: Satz in Spans zerlegt (left | keyword | right).
    expect(html).toContain('arc-kwic-key')
    expect(html).toContain('floss langsam.')  // rechter KWiC-Kontext
    expect(html).toContain('Testkorpus 2018 · CC BY-SA')
    expect(html).toContain('<table class="arc-muster-tabelle">')
    expect(html).toContain('flüssig')
    expect(html).toContain('zähflüssig')
  })

  it('indexiert KEINE rein zukuenftigen Lemmata', async () => {
    const res = await fetch(`${baseUrl}/wort/zukunftswort`)
    expect(res.status).toBe(404)
    const index = await (await fetch(`${baseUrl}/archiv`)).text()
    expect(index).not.toContain('Zukunftswort')
  })

  it('GET /wort/Öl leitet kanonisch auf /wort/oel um (301)', async () => {
    const res = await fetch(`${baseUrl}/wort/${encodeURIComponent('Öl')}`, { redirect: 'manual' })
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/wort/oel')
  })

  it('GET /wort/unbekannt liefert 404 mit noindex', async () => {
    const res = await fetch(`${baseUrl}/wort/gibtsnicht`)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('noindex')
  })

  it('GET /archiv listet vergangene Eintraege', async () => {
    const html = await (await fetch(`${baseUrl}/archiv`)).text()
    expect(html).toContain('/wort/oel')
    expect(html).toContain('/wort/haus')
  })

  it('GET /sitemap.xml enthaelt Archiv-URLs, aber keine zukuenftigen', async () => {
    const res = await fetch(`${baseUrl}/sitemap.xml`)
    expect(res.headers.get('content-type')).toContain('xml')
    const xml = await res.text()
    expect(xml).toContain('<loc>https://signifikation.de/wort/oel</loc>')
    expect(xml).toContain('<loc>https://signifikation.de/archiv</loc>')
    expect(xml).not.toContain('zukunftswort')
  })

  // ── JSON-API für den In-App-Archiv-Tab ──────────────────────────
  it('GET /api/v1/woerter liefert vergangene Woerter als JSON (ohne zukuenftige)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/woerter`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const json = await res.json()
    const lemmata = json.woerter.map((w) => w.lemma)
    expect(lemmata).toContain('Öl')
    expect(lemmata).toContain('Haus')
    expect(lemmata).not.toContain('Zukunftswort')
    // Liste enthaelt nur leichte Felder (keine internen/Loesungs-Felder).
    expect(JSON.stringify(json)).not.toContain('GEHEIMLOESUNG')
  })

  it('GET /api/v1/woerter?q= filtert nach Lemma', async () => {
    const json = await (await fetch(`${baseUrl}/api/v1/woerter?q=${encodeURIComponent('öl')}`)).json()
    expect(json.woerter.map((w) => w.lemma)).toEqual(['Öl'])
  })

  it('GET /api/v1/woerter/:slug liefert Detail mit Muster + KWiC-Belegen', async () => {
    const res = await fetch(`${baseUrl}/api/v1/woerter/oel`)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lemma).toBe('Öl')
    expect(json.detail.patterns.map((p) => p.kollokator)).toContain('flüssig')
    expect(json.detail.belege[0].kwic.keyword).toBe('Öl')
    // Keine internen Felder im Detail-JSON.
    expect(JSON.stringify(json)).not.toContain('GEHEIMLOESUNG')
  })

  it('GET /api/v1/woerter/:slug liefert 404-JSON fuer Unbekanntes', async () => {
    const res = await fetch(`${baseUrl}/api/v1/woerter/gibtsnicht`)
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NOT_FOUND')
  })
})
