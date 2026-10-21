import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import lemmaApiRouter, { LEMMA_API_PFAD, LEMMA_API_BODY_LIMIT } from '../routes/lemma-api.js'
import { requireLemmaApiKey, hashLemmaApiKey } from '../middleware/lemmaApiKey.js'
import { ladeOffeneEntwuerfe } from '../store-entwuerfe.js'
import db from '../db.js'

const SCHLUESSEL = 'test-schluessel-fuer-die-vorschlags-api'

const tag = (datum, extra = {}) => ({
  datum,
  woerter: ['Länge', 'definieren', 'unveränderlich'],
  positionen: ['Substantiv', 'Verb', 'Adjektiv'],
  zwilling_pos: 'Substantiv',
  lueckenfueller_id: 'laenge',
  ...extra,
})

describe('Vorschlags-API POST /api/v1/lemma-entwuerfe', () => {
  let server
  let baseUrl
  const vorher = process.env.LEMMA_API_KEY_SHA256

  const push = (body, schluessel = SCHLUESSEL) => fetch(`${baseUrl}${LEMMA_API_PFAD}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${schluessel}` },
    body: JSON.stringify(body),
  })

  beforeAll(async () => {
    process.env.LEMMA_API_KEY_SHA256 = hashLemmaApiKey(SCHLUESSEL)
    // Gleiche Reihenfolge wie server/index.js: Schlüssel vor dem großen Body-Parser,
    // danach das globale 16-KB-Limit. (Rate-Limit hier weggelassen: geteilter Zustand.)
    const app = express()
    app.use(LEMMA_API_PFAD, requireLemmaApiKey, express.json({ limit: LEMMA_API_BODY_LIMIT }))
    app.use(express.json({ limit: '16kb' }))
    app.use('/', lemmaApiRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    process.env.LEMMA_API_KEY_SHA256 = vorher
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    db.prepare('DELETE FROM lemma_entwurf').run()
  })

  it('legt eine Woche als offene Entwürfe an', async () => {
    const tage = ['2027-03-01', '2027-03-02', '2027-03-03'].map((d) => tag(d))
    const response = await push({ tage })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload).toEqual({ ok: true, angelegt: 3, daten: ['2027-03-01', '2027-03-02', '2027-03-03'] })
    expect(ladeOffeneEntwuerfe().map((e) => e.datum)).toEqual(['2027-03-01', '2027-03-02', '2027-03-03'])
  })

  it('nimmt eine volle Woche mit langen Notizen an, obwohl sie über dem globalen 16-KB-Limit liegt', async () => {
    const lang = 'x'.repeat(480)
    const tage = Array.from({ length: 7 }, (_, i) => tag(`2027-03-1${i}`, {
      notizen: [lang, lang, lang], zwilling_notiz: lang, zeitenwende_notiz: lang,
    }))
    expect(JSON.stringify({ tage }).length).toBeGreaterThan(16 * 1024)

    const response = await push({ tage })
    expect(response.status).toBe(201)
  })

  it('lehnt einen falschen Schlüssel ab und legt nichts an', async () => {
    const response = await push({ tage: [tag('2027-03-01')] }, 'falsch')
    expect(response.status).toBe(401)
    expect(ladeOffeneEntwuerfe()).toHaveLength(0)
  })

  it('lehnt Tage ab, die nicht ins Speicherformat passen', async () => {
    const response = await push({ tage: [tag('2027-03-01', { woerter: ['nur', 'zwei'] })] })
    expect(response.status).toBe(400)
    expect(ladeOffeneEntwuerfe()).toHaveLength(0)
  })

  it('lehnt doppelte Daten in einem Push ab', async () => {
    const response = await push({ tage: [tag('2027-03-01'), tag('2027-03-01')] })
    expect(response.status).toBe(400)
  })

  it('lehnt mehr als 14 Tage je Push ab', async () => {
    const tage = Array.from({ length: 15 }, (_, i) => tag(`2027-04-${String(i + 1).padStart(2, '0')}`))
    const response = await push({ tage })
    expect(response.status).toBe(400)
  })
})
