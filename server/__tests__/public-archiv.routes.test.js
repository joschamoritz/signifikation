/**
 * server/__tests__/public-archiv.routes.test.js
 *
 * Test für den Archiv-Cache (Audit 2026-06-15, #5): /api/v1/archiv liest die
 * statische koll-MM-DD.json nur noch beim Cache-Miss von Disk; danach kommt das
 * Ergebnis (auch leere Tage) aus dem Beleg-Cache.
 *
 * Externe Daten-Module werden gemockt, damit der Import von publicRouter keine
 * Korpus-DBs öffnet. Als Datum wird ein unmögliches MM-DD (13-13/14-14) benutzt,
 * das niemals eine echte Archiv-Datei trifft.
 */
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../belege.js', () => ({ fetchBelege: vi.fn(() => []), belegeVerfuegbar: vi.fn(() => false) }))
vi.mock('../wiktionary.js', () => ({ fetchWiktionary: vi.fn(async () => ({ ipa: '', definitionen: [] })) }))
vi.mock('../wortprofil.js', () => ({
  fetchLemma: vi.fn(),
  fetchBonusQuestion: vi.fn(),
  fetchZeitenwende: vi.fn(),
}))

const { default: publicRouter } = await import('../routes/public.js')

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'data')
const HIT_FILE = join(DATA, 'koll-13-13.json')

describe('GET /api/v1/archiv – Cache', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/', publicRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    const addr = server.address()
    baseUrl = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    rmSync(HIT_FILE, { force: true })
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('liefert Lemmata aus der Datei und cacht sie (Datei-Löschung danach egal)', async () => {
    writeFileSync(HIT_FILE, JSON.stringify({ lemmata: [{ id: 'x', lemma: 'Testwort' }] }), 'utf8')

    const res1 = await fetch(`${baseUrl}/api/v1/archiv?date=2000-13-13`)
    expect(res1.status).toBe(200)
    const body1 = await res1.json()
    expect(body1.lemmata).toHaveLength(1)
    expect(body1.datum).toBe('13-13')
    expect(body1.year).toBe('2000')

    // Datei entfernen – ein zweiter Abruf MUSS trotzdem die Lemmata liefern,
    // weil sie aus dem Cache kommen (sonst wäre es jetzt ein leeres Ergebnis).
    rmSync(HIT_FILE, { force: true })

    const res2 = await fetch(`${baseUrl}/api/v1/archiv?date=2010-13-13`)
    const body2 = await res2.json()
    expect(body2.lemmata).toHaveLength(1)
  })

  it('cacht auch leere Tage (fehlende Datei → leeres 200)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/archiv?date=2000-14-14`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lemmata).toEqual([])
  })

  it('lehnt zukünftige Daten mit 403 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/archiv?date=2999-01-01`)
    expect(res.status).toBe(403)
  })
})
