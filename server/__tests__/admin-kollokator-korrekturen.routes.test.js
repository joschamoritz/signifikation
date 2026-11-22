import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import db from '../db.js'
import { createAdminKollokatorKorrekturenRouter } from '../routes/admin-kollokator-korrekturen.js'
import * as korrekturen from '../kollokatorKorrekturStore.js'
import { korrigiere, setzeDbKorrekturen } from '../kollokatorKorrektur.js'
import { getCachedQuery } from '../query-cache.js'
import { auditCreate, auditUpdate, auditDelete } from '../audit.js'
import {
  validate, adminKollokatorKorrekturBodySchema, adminKollokatorKorrekturParamsSchema,
  adminKollokatorKorrekturQuerySchema, adminKollokationenNeubauSchema,
} from '../middleware/validate.js'

const HEUTE = '2026-11-22'
const opt = (woerter) => woerter.map((wort, i) => ({ wort, log_dice: 8, frequenz: 100, rang: i + 1 }))
const zehn = (top) => opt([...top, 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10'])

// Kalender und Lemmata für den Neubau (der Router bekommt sie injiziert)
let kalender
let byId
let geschrieben
let frischeOptionen
let belegTage

const auditZeilen = (resource) => db.prepare('SELECT action, resource_id, changes_json FROM audit_log WHERE resource = ? ORDER BY id').all(resource)
const silentLogger = { info() {}, warn() {}, error() {}, debug() {} }

describe('Admin › Kollokator-Korrekturen und Neubau', () => {
  let server
  let baseUrl
  const call = async (method, path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use(createAdminKollokatorKorrekturenRouter({
      adminLimiter: (_q, _r, n) => n(),
      requireAuth: (req, _res, next) => { req.adminSessionId = 'sitzung-kk'; req.session = { id: 's', userId: null }; next() },
      validate,
      schemas: {
        body: adminKollokatorKorrekturBodySchema,
        params: adminKollokatorKorrekturParamsSchema,
        query: adminKollokatorKorrekturQuerySchema,
        neubau: adminKollokationenNeubauSchema,
      },
      korrekturen,
      fetchLemma: async (lemma) => ({ runden: { kollokatoren: frischeOptionen[lemma] ?? [] } }),
      // Platz 1–25 = die frischen Optionen (Abgleich veralteter Ablenker)
      fetchKollokatorenAnalyse: async (lemma) => ({ kollokatoren: (frischeOptionen[lemma] ?? []).map((o) => ({ wort: o.wort })) }),
      MIN_KOLLOKATOREN: 10,
      getLemmataIndex: () => ({ byId }),
      loadKalender: () => kalender,
      setzeKollokatoren: (zeile) => geschrieben.push(zeile),
      invalidateCache: () => {},
      planeBelegPruefung: async (tage) => { belegTage = tage; return { status: 'eingeplant' } },
      auditCreate,
      auditUpdate,
      auditDelete,
      adminError: (res, err) => res.status(500).json({ error: err.message }),
      logger: silentLogger,
      heute: () => HEUTE,
    }))
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    db.prepare('DELETE FROM kollokator_korrektur').run()
    db.prepare("DELETE FROM audit_log WHERE resource IN ('kollokator_korrektur', 'lemma_kollokatoren')").run()
    korrekturen.ladeKorrekturen()
    const lemma = (id, name, top) => ({ id, lemma: name, pos: 'Substantiv', runden: { kollokatoren: zehn(top) } })
    byId = new Map([
      ['verleihen', lemma('verleihen', 'verleihen', ['Preisen', 'Orden', 'Titel'])],
      ['nobel', lemma('nobel', 'Nobel', ['Preisen', 'Stiftung', 'Komitee'])],
      ['alt', lemma('alt', 'alt', ['Haus', 'Mann', 'Frau'])],
      ['selten', lemma('selten', 'selten', ['a', 'b', 'c'])],
    ])
    kalender = {
      '2026-11-20': { ids: ['alt'] },
      '2026-11-24': { ids: ['verleihen', 'alt', 'selten'] },
      '2026-12-02': { ids: ['nobel', 'verleihen'] },
    }
    frischeOptionen = {
      verleihen: zehn(['Preis', 'Orden', 'Titel']),
      Nobel: zehn(['Preisen', 'Stiftung', 'Komitee']),
      selten: opt(['a', 'b']),
    }
    geschrieben = []
    belegTage = null
  })

  afterAll(async () => {
    db.prepare('DELETE FROM kollokator_korrektur').run()
    db.prepare("DELETE FROM audit_log WHERE resource IN ('kollokator_korrektur', 'lemma_kollokatoren')").run()
    setzeDbKorrekturen([])
    await new Promise((resolve) => server.close(resolve))
  })

  it('legt eine Korrektur an: wirkt sofort, steht im Audit, nennt betroffene Tage', async () => {
    const r = await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Substantiv', kollokator: 'Wassermühlen', ersatz: 'Wassermühle', notiz: 'Plural' })
    expect(r.status).toBe(200)
    expect(r.body.eintrag).toMatchObject({ art: 'lemma', schluessel: 'Substantiv:wassermühlen', wortart: 'Substantiv', kollokator: 'wassermühlen', ersatz: 'Wassermühle', notiz: 'Plural' })
    expect(r.body.ersetzt).toBe(false)
    expect(korrigiere('Bach', 'wassermühlen', 'Substantiv').lemma).toBe('Wassermühle')
    expect(auditZeilen('kollokator_korrektur').map((z) => z.action)).toEqual(['CREATE'])

    const preisen = await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Substantiv', kollokator: 'preisen', ersatz: 'Preis' })
    expect(preisen.body.betroffen).toEqual([
      { datum: '2026-11-24', woerter: ['verleihen'] },
      { datum: '2026-12-02', woerter: ['Nobel', 'verleihen'] },
    ])
  })

  it('derselbe Schlüssel ersetzt den Eintrag (UPDATE im Audit)', async () => {
    await call('POST', '/admin/kollokator-korrekturen', { art: 'paar', basis: 'Heiraten', kollokator: 'Anna', ersatz: null })
    const r = await call('POST', '/admin/kollokator-korrekturen', { art: 'paar', basis: 'heiraten', kollokator: 'anna', ersatz: 'Anna' })
    expect(r.body.ersetzt).toBe(true)
    expect(korrekturen.listeKorrekturen()).toHaveLength(1)
    expect(auditZeilen('kollokator_korrektur').map((z) => z.action)).toEqual(['CREATE', 'UPDATE'])
  })

  it('leert die zwischengespeicherte Rangfolge: Paar nur die Basis, sonst alle', async () => {
    let n = 0
    const zaehle = (key) => getCachedQuery(key, () => ++n)
    zaehle('rang:Heiraten:Verb'); zaehle('rang:Wolf:Adjektiv'); zaehle('rel:Wolf:Adjektiv:ATTR')
    expect(n).toBe(3)
    await call('POST', '/admin/kollokator-korrekturen', { art: 'paar', basis: 'heiraten', kollokator: 'anna', ersatz: null })
    zaehle('rang:Heiraten:Verb'); zaehle('rang:Wolf:Adjektiv'); zaehle('rel:Wolf:Adjektiv:ATTR')
    expect(n).toBe(4) // nur heiraten neu gerechnet
    await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Adjektiv', kollokator: 'bös', ersatz: null })
    zaehle('rang:Heiraten:Verb'); zaehle('rang:Wolf:Adjektiv'); zaehle('rel:Wolf:Adjektiv:ATTR')
    expect(n).toBe(6) // beide Rangfolgen neu, die Relation nicht
  })

  it('ändert und löscht; 404 für unbekannte Einträge, 409 bei Schlüssel-Kollision', async () => {
    const a = (await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Verb', kollokator: 'quaken', ersatz: null })).body.eintrag
    const b = (await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Verb', kollokator: 'brummen', ersatz: null })).body.eintrag

    const geaendert = await call('PUT', `/admin/kollokator-korrekturen/${a.id}`, { art: 'lemma', wortart: 'Verb', kollokator: 'quaken', ersatz: 'quaken', notiz: 'doch ok' })
    expect(geaendert.status).toBe(200)
    expect(korrigiere('Frosch', 'quaken', 'Verb')).toEqual({ lemma: 'quaken', pos: 'Verb' })

    const kollision = await call('PUT', `/admin/kollokator-korrekturen/${a.id}`, { art: 'lemma', wortart: 'Verb', kollokator: 'brummen', ersatz: null })
    expect(kollision.status).toBe(409)
    expect(kollision.body.error).toBeTruthy()

    expect((await call('DELETE', `/admin/kollokator-korrekturen/${b.id}`)).status).toBe(200)
    expect(korrigiere('Bär', 'brummen', 'Verb')).toEqual({ lemma: 'brummen', pos: 'Verb' })
    expect((await call('DELETE', `/admin/kollokator-korrekturen/${b.id}`)).status).toBe(404)
    expect((await call('PUT', '/admin/kollokator-korrekturen/999999', { art: 'lemma', wortart: 'Verb', kollokator: 'x', ersatz: null })).status).toBe(404)
    expect(auditZeilen('kollokator_korrektur').map((z) => z.action)).toEqual(['CREATE', 'CREATE', 'UPDATE', 'DELETE'])
  })

  it('validiert mit Zod', async () => {
    expect((await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', kollokator: 'x' })).status).toBe(400)
    expect((await call('POST', '/admin/kollokator-korrekturen', { art: 'paar', kollokator: 'x' })).status).toBe(400)
    expect((await call('POST', '/admin/kollokator-korrekturen', { art: 'schreibung', kollokator: 'e-mail', ersatz: null })).status).toBe(400)
    expect((await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Verb', kollokator: 'a|b' })).status).toBe(400)
    expect((await call('POST', '/admin/kollokator-korrekturen', { art: 'unbekannt', kollokator: 'x' })).status).toBe(400)
    expect((await call('DELETE', '/admin/kollokator-korrekturen/abc')).status).toBe(400)
  })

  it('listet DB-Einträge und auf Wunsch den Grundbestand mit Übersteuerung', async () => {
    await call('POST', '/admin/kollokator-korrekturen', { art: 'lemma', wortart: 'Substantiv', kollokator: 'preisen', ersatz: 'Preise' })
    const ohne = await call('GET', '/admin/kollokator-korrekturen')
    expect(ohne.body.eintraege).toHaveLength(1)
    expect(ohne.body.grundbestand).toBeUndefined()
    const mit = await call('GET', '/admin/kollokator-korrekturen?grundbestand=1')
    const preisen = mit.body.grundbestand.find((z) => z.schluessel === 'Substantiv:preisen')
    expect(preisen).toMatchObject({ art: 'lemma', ersatz: 'Preis', uebersteuert: true, kollokator: 'preisen' })
    expect(mit.body.grundbestand.find((z) => z.schluessel === 'Substantiv:titeln').uebersteuert).toBe(false)
  })

  it('Neubau-Vorschau: nur künftige Tage, gespielte Lemmata und zu kurze Listen übersprungen', async () => {
    const r = await call('POST', '/admin/kollokationen-neubau/vorschau', { daten: ['2026-11-20', '2026-11-24'] })
    expect(r.status).toBe(200)
    const [vergangen, tag] = r.body.tage
    expect(vergangen).toMatchObject({ datum: '2026-11-20', status: 'vergangen' })
    const nach = Object.fromEntries(tag.eintraege.map((e) => [e.id, e]))
    expect(nach.verleihen).toMatchObject({ status: 'neu', alt: ['Preisen', 'Orden', 'Titel'], neu: ['Preis', 'Orden', 'Titel'], auchAm: ['2026-12-02'] })
    expect(nach.verleihen._optionen).toBeUndefined()
    expect(nach.alt.status).toBe('uebersprungen')
    expect(nach.alt.grund).toContain('2026-11-20')
    expect(nach.selten).toMatchObject({ status: 'uebersprungen' })
    expect(geschrieben).toEqual([])
  })

  it('Neubau übernehmen: schreibt nur geänderte Top 3, einmal je Lemma, mit Audit und Belegprüfung', async () => {
    const r = await call('POST', '/admin/kollokationen-neubau/uebernehmen', { daten: ['2026-11-24', '2026-12-02'] })
    expect(r.status).toBe(200)
    expect(r.body.geschrieben).toBe(1)
    expect(geschrieben.map((z) => z.id)).toEqual(['verleihen'])
    expect(JSON.parse(geschrieben[0].kollokatoren).slice(0, 3).map((o) => o.wort)).toEqual(['Preis', 'Orden', 'Titel'])
    const tag2 = r.body.tage.find((t) => t.datum === '2026-12-02')
    expect(tag2.eintraege.find((e) => e.id === 'nobel').status).toBe('gleich')
    expect(tag2.eintraege.find((e) => e.id === 'verleihen').status).toBe('geschrieben')
    expect(r.body.belegPruefung).toBe('eingeplant')
    expect(belegTage).toEqual(['2026-11-24', '2026-12-02'])
    const audit = auditZeilen('lemma_kollokatoren')
    expect(audit.map((z) => [z.action, z.resource_id])).toEqual([['UPDATE', 'verleihen']])
  })

  it('Neubau auch bei gleichen Top 3, wenn ein gespeicherter Ablenker nicht mehr in der Liste steht', async () => {
    kalender = { '2026-12-03': { ids: ['retten'] } }
    byId.set('retten', { id: 'retten', lemma: 'lebensrettend', pos: 'Adjektiv', runden: { kollokatoren: zehn(['Sofortmaßnahme', 'lebenserhaltend', 'Transplantation']).map((o, i) => (i === 3 ? { ...o, wort: 'Sofortmassnahm' } : o)) } })
    frischeOptionen.lebensrettend = zehn(['Sofortmaßnahme', 'lebenserhaltend', 'Transplantation'])
    const r = await call('POST', '/admin/kollokationen-neubau/vorschau', { daten: ['2026-12-03'] })
    expect(r.body.tage[0].eintraege[0]).toMatchObject({ status: 'neu', veraltet: ['Sofortmassnahm'], alt: ['Sofortmaßnahme', 'lebenserhaltend', 'Transplantation'] })
    const ohne = await call('POST', '/admin/kollokationen-neubau/vorschau', { daten: ['2026-12-24'] })
    expect(ohne.body.tage[0].eintraege.find((e) => e.id === 'alt')?.veraltet).toBeUndefined()
  })
})
