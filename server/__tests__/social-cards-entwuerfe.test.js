/**
 * Social-Card-Entwürfe (Stufe 1): Wochenplan und Kartendaten
 * (socialCards/entwuerfe.js), Job mit Idempotenz und Neu-Erzeugen
 * (jobs/socialCardDrafts.js). Gezeichnet wird mit einem Fake-Renderer –
 * Chromium läuft in den Tests nicht.
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { baueEntwuerfe, verschiebeDatum } from '../socialCards/entwuerfe.js'
import { belegLueckentext } from '../../shared/socialCards.js'
import { ladeEntwuerfe, setzeStatus } from '../socialCards/store.js'
import { erzeugeEntwuerfe, erneuereEntwurf } from '../jobs/socialCardDrafts.js'

// 2099-03-01 = Sonntag, 03-02 Montag, 03-04 Mittwoch, 03-06 Freitag
const SO = '2099-03-01', MO = '2099-03-02', DI = '2099-03-03', MI = '2099-03-04', DO = '2099-03-05', FR = '2099-03-06', SA = '2099-03-07'

const LEMMATA = {
  l1: { id: 'l1', lemma: 'Gedächtnis', pos: 'Substantiv', ipa: 'ɡəˈdɛçtnɪs' },
  l2: { id: 'l2', lemma: 'Tisch', pos: 'Substantiv' },
  l3: { id: 'l3', lemma: 'laufen', pos: 'Verb' },
  l4: { id: 'l4', lemma: 'Brücke', pos: 'Substantiv' },
}
const KALENDER = {
  [SO]: { ids: ['l1', 'l2', 'l3'] },
  [MO]: { ids: ['l2', 'l3', 'l4'] },
  [DI]: { ids: ['l3'] },
  [MI]: { ids: ['l4'] },
  [DO]: { ids: ['l1'] },
  [FR]: { ids: ['l2'] },
}
const KOLLOKATOREN = Array.from({ length: 12 }, (_, i) => ({ wort: `kolloK${i + 1}`, logDice: 12 - i * 0.5 }))

const tok = (satz, hl) => satz.split(' ').map((w, i) => ({ w, ws: i > 0, hl: w.toLowerCase().startsWith(hl.toLowerCase()) }))
const LEIPZIG = 'Artikel (2015) · Wortschatz-Korpus, Universität Leipzig, wortschatz.uni-leipzig.de · CC BY'
const DTA = 'Roman (1890) · Deutsches Textarchiv – DTA Kern. deutschestextarchiv.de · CC BY-SA 4.0'

function deps(extra = {}) {
  return {
    loadKalender: () => KALENDER,
    getLemmataIndex: () => ({ byId: new Map(Object.entries(LEMMATA)) }),
    analyzeKollokationBest: vi.fn(async () => ({ kollokatoren: KOLLOKATOREN })),
    fetchBelege: vi.fn((_lemma, koll) => [
      { quelle: LEIPZIG, tokens: tok(`Ein Zeitungssatz mit ${koll} drin.`, koll) },
      { quelle: DTA, tokens: tok(`Das ${koll} Gedächtnis einer Zeit.`, koll) },
    ]),
    random: () => 0.3,
    ...extra,
  }
}

describe('baueEntwuerfe – Wochenplan', () => {
  it('Montag: Teaser + Rätsel zum Vortags-Lemma, Auflösung am Dienstag mit gleicher Reihenfolge', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(MO, d)
    expect(liste.map((e) => `${e.datum}|${e.slot}`)).toEqual([`${MO}|T`, `${MO}|A`, `${DI}|A-aufloesung`])

    const teaser = liste[0]
    expect(teaser.spec.data.lemmata.map((l) => l.lemma)).toEqual(['Tisch', 'laufen', 'Brücke'])

    const [, raetsel, aufloesung] = liste
    // Vortag (Sonntag) beginnt mit Gedächtnis – nicht das heutige Lemma (Spoiler)
    expect(d.analyzeKollokationBest).toHaveBeenCalledWith('Gedächtnis')
    expect(raetsel.spec.data.lemma).toBe('Gedächtnis')
    const opts = raetsel.spec.data.options
    expect(opts).toHaveLength(3)
    expect(opts.filter((o) => o.correct)).toEqual([{ text: 'kolloK1', correct: true }])
    // Köder wie im Editor: Rang 5 und 10
    expect(opts.map((o) => o.text).sort()).toEqual(['kolloK1', 'kolloK10', 'kolloK5'])
    expect(aufloesung.spec.reveal).toBe(true)
    expect(aufloesung.spec.data.options).toEqual(opts)
    expect(raetsel.caption).toContain('Gedächtnis')
  })

  it('Tag ohne Plan-Slot: nur Teaser; Tag ohne Kalender: nichts', async () => {
    expect((await baueEntwuerfe(DI, deps())).map((e) => e.slot)).toEqual(['T'])
    expect(await baueEntwuerfe('2099-03-20', deps())).toEqual([])
  })

  it('überspringt vorhandene Slots ohne Korpusabfrage', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(MO, d, { vorhanden: new Set([`${MO}|T`, `${MO}|A`]) })
    expect(liste).toEqual([])
    expect(d.analyzeKollokationBest).not.toHaveBeenCalled()
  })

  it('Freitag: Beleg mit Lücke aus erlaubter Quelle (keine Leipziger Zeitungssätze)', async () => {
    const liste = await baueEntwuerfe(FR, deps())
    const beleg = liste.find((e) => e.slot === 'B')
    expect(beleg.spec.data.quelle).toBe(DTA)
    expect(beleg.spec.data.quoteText).toBe('Das ______ Gedächtnis einer Zeit.')
    expect(beleg.spec.data.collocate).toBe('kolloK1')
    const aufloesung = liste.find((e) => e.slot === 'B-aufloesung')
    expect(aufloesung.datum).toBe(SA)
    expect(aufloesung.spec.reveal).toBe(true)
  })

  it('Mittwoch: Zitat ohne Lücke; ohne erlaubten Beleg kein Zitat-Entwurf', async () => {
    const zitat = (await baueEntwuerfe(MI, deps())).find((e) => e.slot === 'X')
    expect(zitat.spec.data).toMatchObject({ subtype: 'Zitat', body: 'Das kolloK1 Gedächtnis einer Zeit.', headline: DTA })

    const nurLeipzig = deps({ fetchBelege: () => [{ quelle: LEIPZIG, tokens: tok('Satz mit kolloK1.', 'kollok1') }] })
    expect((await baueEntwuerfe(MI, nurLeipzig)).map((e) => e.slot)).toEqual(['T'])
  })

  it('Lücke behält Satzzeichen und Anführungszeichen am Token', () => {
    const tokens = [{ w: 'drei', ws: false }, { w: 'Stockwerke', ws: true }, { w: '„hoch.“', ws: true, hl: true }]
    expect(belegLueckentext(tokens, 'hoch')).toBe('drei Stockwerke „______.“')
  })

  it('verschiebeDatum rechnet über Monatsgrenzen', () => {
    expect(verschiebeDatum('2099-02-28', 1)).toBe('2099-03-01')
    expect(verschiebeDatum('2099-03-01', -1)).toBe('2099-02-28')
  })
})

describe('erzeugeEntwuerfe / erneuereEntwurf', () => {
  const bildDir = mkdtempSync(join(tmpdir(), 'social-cards-test-'))
  const fakeRenderer = () => {
    const r = { render: vi.fn(async () => Buffer.from('png')), close: vi.fn(async () => {}) }
    fakeRenderer.letzter = r
    return Promise.resolve(r)
  }
  const aufraeumen = () => db.prepare(`DELETE FROM social_card_entwurf WHERE datum BETWEEN '2099-02-01' AND '2099-03-31'`).run()

  afterEach(aufraeumen)
  afterAll(() => rmSync(bildDir, { recursive: true, force: true }))

  it('legt die Woche an, zeichnet jede Karte und ist beim zweiten Lauf ohne Wirkung', async () => {
    const opts = { heute: SO, tage: 7, deps: deps(), createRenderer: fakeRenderer, bildDir }
    const erster = await erzeugeEntwuerfe(opts)
    // Mo–Fr belegt: 5 Teaser + A + A-Auflösung + X + B + B-Auflösung
    expect(erster).toMatchObject({ neu: 10, gezeichnet: 10, fehler: [] })
    const liste = ladeEntwuerfe(MO, SA)
    expect(liste).toHaveLength(10)
    expect(liste.every((e) => e.bild && existsSync(join(bildDir, e.bild)))).toBe(true)

    const zweiter = await erzeugeEntwuerfe({ ...opts, deps: deps() })
    expect(zweiter).toMatchObject({ neu: 0, gezeichnet: 0 })
  })

  it('verworfene Entwürfe kommen beim nächsten Lauf nicht zurück', async () => {
    const opts = { heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir }
    await erzeugeEntwuerfe(opts)
    const teaser = ladeEntwuerfe(MO, MO).find((e) => e.slot === 'T')
    setzeStatus(teaser.id, 'verworfen')
    expect((await erzeugeEntwuerfe(opts)).neu).toBe(0)
    expect(ladeEntwuerfe(MO, MO).find((e) => e.slot === 'T').status).toBe('verworfen')
  })

  it('Neu erzeugen ersetzt Rätsel und Auflösung gemeinsam – nur solange beide offen sind', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const aufloesung = ladeEntwuerfe(DI, DI).find((e) => e.slot === 'A-aufloesung')

    const neu = deps({ random: () => 0.9 })
    expect(await erneuereEntwurf(aufloesung, { deps: neu, createRenderer: fakeRenderer, bildDir })).toEqual({ ok: true })
    const raetsel = ladeEntwuerfe(MO, MO).find((e) => e.slot === 'A')
    const aufl = ladeEntwuerfe(DI, DI).find((e) => e.slot === 'A-aufloesung')
    expect(aufl.spec.data.options).toEqual(raetsel.spec.data.options)
    expect(raetsel.bild).toBeTruthy()

    setzeStatus(raetsel.id, 'freigegeben')
    const ergebnis = await erneuereEntwurf(aufl, { deps: neu, createRenderer: fakeRenderer, bildDir })
    expect(ergebnis.ok).toBe(false)
  })
})
