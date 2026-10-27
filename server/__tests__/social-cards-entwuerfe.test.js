/**
 * Social-Card-Entwürfe (Stufe 1): Wochenplan und Kartendaten
 * (socialCards/entwuerfe.js), Job mit Idempotenz und Neu-Erzeugen
 * (jobs/socialCardDrafts.js). Gezeichnet wird mit einem Fake-Renderer –
 * Chromium läuft in den Tests nicht.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { baueEntwuerfe, gehoertZumPlan, kalenderwoche, kurzQuelle, slotsAm, verschiebeDatum } from '../socialCards/entwuerfe.js'
import { belegLueckentext, belegLueckenwort, zeichenZahl, BLUESKY_MAX_ZEICHEN } from '../../shared/socialCards.js'
import { ladeEntwuerfe, setzeStatus, speichereEntwuerfe } from '../socialCards/store.js'
import { erzeugeEntwuerfe, erneuereEntwurf, bildPfad, kleinDatei } from '../jobs/socialCardDrafts.js'
import { KLEIN_BREITE, mitZeitlimit } from '../socialCards/render.js'

// 2099-03-01 = Sonntag, 03-02 Montag … 03-07 Samstag (KW 10, gerade → Beleg), 03-14 Samstag (KW 11 → Zitat)
const SO = '2099-03-01', MO = '2099-03-02', DI = '2099-03-03', MI = '2099-03-04', DO = '2099-03-05', FR = '2099-03-06', SA = '2099-03-07'
const SO2 = '2099-03-08', FR2 = '2099-03-13', SA2 = '2099-03-14'

const LEMMATA = {
  l1: { id: 'l1', lemma: 'Gedächtnis', pos: 'Substantiv', ipa: 'ɡəˈdɛçtnɪs' },
  l2: { id: 'l2', lemma: 'Tisch', pos: 'Substantiv' },
  l3: { id: 'l3', lemma: 'laufen', pos: 'Verb' },
  l4: { id: 'l4', lemma: 'Brücke', pos: 'Substantiv' },
}
// Die Samstage selbst stehen bewusst nicht im Kalender: Die Slots hängen nur am Vortag
const KALENDER = {
  [SO]: { ids: ['l2', 'l3', 'l4'] },
  [MO]: { ids: ['l1', 'l2', 'l3'] },
  [DI]: { ids: ['l3'] },
  [MI]: { ids: ['l2'] },
  [DO]: { ids: ['l1'] },
  [FR]: { ids: ['l4'] },
  [FR2]: { ids: ['l4'] },
}
const KOLLOKATOREN = Array.from({ length: 12 }, (_, i) => ({ wort: `kolloK${i + 1}`, logDice: 12 - i * 0.5 }))

const tok = (satz, hl) => satz.split(' ').map((w, i) => ({ w, ws: i > 0, hl: w.toLowerCase().startsWith(hl.toLowerCase()) }))
const LEIPZIG = 'Artikel (2015) · Wortschatz-Korpus, Universität Leipzig, wortschatz.uni-leipzig.de · CC BY'
const DTA = 'Roman (1890) · Deutsches Textarchiv – DTA Kern. deutschestextarchiv.de · CC BY-SA 4.0'

function deps(extra = {}) {
  return {
    loadKalender: () => KALENDER,
    getLemmataIndex: () => ({ byId: new Map(Object.entries(LEMMATA)) }),
    analyzeKollokationen: vi.fn(async () => ({ kollokatoren: KOLLOKATOREN, usable: true })),
    fetchBelege: vi.fn((_lemma, koll) => [
      { quelle: LEIPZIG, tokens: tok(`Ein Zeitungssatz mit ${koll} drin.`, koll) },
      { quelle: DTA, tokens: tok(`Das ${koll} Gedächtnis einer Zeit.`, koll) },
    ]),
    random: () => 0.3,
    ...extra,
  }
}

describe('baueEntwuerfe – Wochenplan', () => {
  it('Plan A: Di Rätsel, Do Textbeleg, Sa Beleg/Zitat – kein Teaser, sonst nichts', async () => {
    const woche = [SO, MO, DI, MI, DO, FR, SA]
    expect(woche.map((t) => slotsAm(t))).toEqual([[], [], ['A'], [], ['TB'], [], ['B']])
    const alle = (await Promise.all(woche.map((t) => baueEntwuerfe(t, deps())))).flat()
    expect(alle.map((e) => `${e.datum}|${e.slot}`)).toEqual([
      `${DI}|A`, `${MI}|A-aufloesung`, `${DO}|TB`, `${FR}|TB-aufloesung`, `${SA}|B`, `${SO2}|B-aufloesung`,
    ])
  })

  it('Samstag im Wochenwechsel: gerade KW Beleg mit Auflösung am Sonntag, ungerade KW Zitat ohne Auflösung', async () => {
    expect([kalenderwoche(SA), kalenderwoche(SA2)]).toEqual([10, 11])
    expect((await baueEntwuerfe(SA, deps())).map((e) => `${e.datum}|${e.slot}`)).toEqual([`${SA}|B`, `${SO2}|B-aufloesung`])
    expect((await baueEntwuerfe(SA2, deps())).map((e) => `${e.datum}|${e.slot}`)).toEqual([`${SA2}|X`])
    // ISO-Wochen über den Jahreswechsel: 2026 hat 53 Wochen
    expect(['2026-12-31', '2027-01-03', '2027-01-04'].map(kalenderwoche)).toEqual([53, 53, 1])
    expect(slotsAm('2026-10-31')).toEqual(['B'])   // KW 44
    expect(slotsAm('2026-11-07')).toEqual(['X'])   // KW 45
  })

  it('gehoertZumPlan: Auflösungen gehören zum Vortag, alte Slots und Teaser nicht mehr', () => {
    expect([gehoertZumPlan(DI, 'A'), gehoertZumPlan(MI, 'A-aufloesung'), gehoertZumPlan(SO2, 'B-aufloesung'), gehoertZumPlan(SA2, 'X')])
      .toEqual([true, true, true, true])
    expect([
      gehoertZumPlan(MO, 'T'), gehoertZumPlan(MO, 'A'), gehoertZumPlan(DI, 'A-aufloesung'), gehoertZumPlan(DI, 'TB'),
      gehoertZumPlan(MI, 'X'), gehoertZumPlan(FR, 'B'), gehoertZumPlan(SA, 'B-aufloesung'), gehoertZumPlan(SA, 'X'),
      gehoertZumPlan(SO2, 'X-aufloesung'),
    ]).toEqual(Array(9).fill(false))
  })

  it('Dienstag: Rätsel zum Vortags-Lemma, Auflösung am Mittwoch mit gleicher Reihenfolge', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(DI, d)
    expect(liste.map((e) => `${e.datum}|${e.slot}`)).toEqual([`${DI}|A`, `${MI}|A-aufloesung`])
    // Das Datum im Kartenkopf ist der Tag des Entwurfs (nicht heute, nicht der nächste Spieltag)
    expect(liste.map((e) => [e.datum, e.spec.datum])).toEqual([[DI, DI], [MI, MI]])

    const [raetsel, aufloesung] = liste
    // Vortag (Montag) beginnt mit Gedächtnis – nicht das heutige Lemma (Spoiler)
    expect(d.analyzeKollokationen).toHaveBeenCalledWith('Gedächtnis', 'Substantiv')
    expect(raetsel.spec.data.lemma).toBe('Gedächtnis')
    const opts = raetsel.spec.data.options
    expect(opts).toHaveLength(3)
    expect(opts.filter((o) => o.correct)).toEqual([{ text: 'kolloK1', correct: true }])
    // Köder wie im Editor: Rang 5 und 10
    expect(opts.map((o) => o.text).sort()).toEqual(['kolloK1', 'kolloK10', 'kolloK5'])
    expect(aufloesung.spec.reveal).toBe(true)
    expect(aufloesung.spec.data.options).toEqual(opts)
    expect(raetsel.caption).toMatch(/^„Gedächtnis“ – und was kommt danach\?/)
    expect(raetsel.caption).not.toMatch(/\*|häufigst|Story/)
    expect(raetsel.hashtags).toBe('#Linguistik #DeutscheSprache #Sprachrätsel')

    // Auflösung: Buchstabe der richtigen Antwort, keine Tags. Gedächtnis ist am
    // Donnerstag erneut geplant → Archivseite gesperrt → kein Link.
    const buchstabe = 'ABC'[opts.findIndex((o) => o.correct)]
    expect(aufloesung.caption).toBe(`Auflösung: Am stärksten mit „Gedächtnis“ verbunden ist „kolloK1“ (${buchstabe}).`)
    expect(aufloesung.hashtags).toBe('')
  })

  it('Rätsel-Auflösung verlinkt die Archivseite, wenn das Lemma nicht erneut geplant ist', async () => {
    const ohneWiederholung = { ...KALENDER, [DO]: { ids: ['l3'] } }
    const auf = (await baueEntwuerfe(DI, deps({ loadKalender: () => ohneWiederholung }))).find((e) => e.slot === 'A-aufloesung')
    expect(auf.caption).toMatch(/\n\nMehr Verbindungen: signifikation\.de\/wort\/gedaechtnis$/)
  })

  it('Slots hängen nur am Kalender des Vortags: ohne Vortag nichts, ohne eigenen Eintrag trotzdem', async () => {
    // Samstag hat keinen eigenen Eintrag, der Freitag schon → Beleg entsteht
    expect((await baueEntwuerfe(SA, deps())).map((e) => e.slot)).toEqual(['B', 'B-aufloesung'])
    // Dienstag 10.03.: Für Montag 09.03. steht nichts im Kalender → nichts, ohne Korpusabfrage
    const d = deps()
    expect(await baueEntwuerfe('2099-03-10', d)).toEqual([])
    expect(d.analyzeKollokationen).not.toHaveBeenCalled()
    // Tag ohne Plan-Slot (Montag, Sonntag): nichts, obwohl der Kalender belegt ist
    expect(await baueEntwuerfe(MO, deps())).toEqual([])
    expect(await baueEntwuerfe(SO, deps())).toEqual([])
  })

  it('Donnerstag: Textbeleg ohne Bild mit Kurzquelle, Auflösung am Freitag mit Satz und Dokumentquelle', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(DO, d)
    expect(liste.map((e) => `${e.datum}|${e.slot}`)).toEqual([`${DO}|TB`, `${FR}|TB-aufloesung`])
    expect(d.analyzeKollokationen).toHaveBeenCalledWith('Tisch', 'Substantiv') // Vortags-Lemma (Mittwoch)

    const [post, antwort] = liste
    expect(post.spec.format).toBe('text')
    expect(post.hashtags).toBe('#Linguistik #DeutscheSprache #Korpuslinguistik')
    expect(antwort.hashtags).toBe('')
    expect(post.caption).toBe('„Das ______ Gedächtnis einer Zeit.“\n\nWelches Wort fehlt? (Deutsches Textarchiv · CC BY-SA 4.0)')
    expect(antwort.spec.reveal).toBe(true)
    expect(antwort.caption).toBe('Gesucht war „kolloK1“:\n„Das kolloK1 Gedächtnis einer Zeit.“\n\nQuelle: Roman (1890) · CC BY-SA 4.0 (für das Rätsel mit Lücke bearbeitet)')
  })

  it('Textbeleg: Sätze, die den Post über 300 Zeichen bringen, werden übersprungen', async () => {
    const lang = 'wort '.repeat(40).trim()
    const d = deps({
      fetchBelege: (_lemma, koll) => [
        { quelle: DTA, tokens: tok(`${lang} ${koll} ${lang}.`, koll) },
        { quelle: DTA, tokens: tok(`Kurz mit ${koll}.`, koll) },
      ],
    })
    const post = (await baueEntwuerfe(DO, d)).find((e) => e.slot === 'TB')
    expect(post.caption).toContain('„Kurz mit ______.“')
    expect(zeichenZahl(post.caption)).toBeLessThanOrEqual(BLUESKY_MAX_ZEICHEN)
  })

  it('kurzQuelle kürzt die Quellenangaben der Korpora', () => {
    expect(kurzQuelle('Hohmanns Hof. Wikipedia. https://de.wikipedia.org/wiki/Hohmanns_Hof · Wikimedia Foundation. Wikipedia – Die freie Enzyklopädie (de.wikipedia.org) · CC BY-SA 4.0'))
      .toBe('Wikipedia · CC BY-SA 4.0')
    expect(kurzQuelle('Plenarprotokoll 19/123 (2019) · Deutscher Bundestag – Dokumentations- und Informationssystem (DIP), dip.bundestag.de · Datenlizenz Deutschland BY 2.0'))
      .toBe('Deutscher Bundestag · Datenlizenz Deutschland BY 2.0')
    expect(kurzQuelle('Text (1900) · Neuer Pitaval. Sammlung · CC BY-SA 4.0')).toBe('Neuer Pitaval · CC BY-SA 4.0')
  })

  it('überspringt vorhandene Slots ohne Korpusabfrage', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(DI, d, { vorhanden: new Set([`${DI}|A`]) })
    expect(liste).toEqual([])
    expect(d.analyzeKollokationen).not.toHaveBeenCalled()
  })

  it('Samstag (gerade KW): Beleg mit Lücke aus erlaubter Quelle (keine Leipziger Zeitungssätze)', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(SA, d)
    expect(d.analyzeKollokationen).toHaveBeenCalledWith('Brücke', 'Substantiv') // Vortags-Lemma (Freitag)
    const beleg = liste.find((e) => e.slot === 'B')
    expect(beleg.spec.data.quelle).toBe(DTA)
    expect(beleg.spec.data.quoteText).toBe('Das ______ Gedächtnis einer Zeit.')
    expect(beleg.spec.data.collocate).toBe('kolloK1')
    const aufloesung = liste.find((e) => e.slot === 'B-aufloesung')
    expect(aufloesung.datum).toBe(SO2)
    expect(aufloesung.spec.reveal).toBe(true)
    expect(aufloesung.caption).toBe('Gesucht war „kolloK1“:\n„Das kolloK1 Gedächtnis einer Zeit.“\n\nQuelle: Roman (1890) · CC BY-SA 4.0 (für das Rätsel mit Lücke bearbeitet)')
    expect(aufloesung.hashtags).toBe('')
  })

  it('Samstag (ungerade KW): Zitat ohne Lücke; ohne erlaubten Beleg kein Zitat-Entwurf', async () => {
    const zitat = (await baueEntwuerfe(SA2, deps())).find((e) => e.slot === 'X')
    expect(zitat.spec.data).toMatchObject({ subtype: 'Zitat', xLemma: 'Brücke', body: 'Das kolloK1 Gedächtnis einer Zeit.', headline: DTA })

    const nurLeipzig = deps({ fetchBelege: () => [{ quelle: LEIPZIG, tokens: tok('Satz mit kolloK1.', 'kollok1') }] })
    expect(await baueEntwuerfe(SA2, nurLeipzig)).toEqual([])
  })

  it('Lücke behält Satzzeichen und Anführungszeichen am Token', () => {
    const tokens = [{ w: 'drei', ws: false }, { w: 'Stockwerke', ws: true }, { w: '„hoch.“', ws: true, hl: true }]
    expect(belegLueckentext(tokens, 'hoch')).toBe('drei Stockwerke „______.“')
  })

  it('Auflösungen nennen die Wortform im Satz, nicht die Grundform', async () => {
    const tokens = [{ w: 'das', ws: false }, { w: 'Weißen', ws: true, hl: true }, { w: 'Haus.', ws: true, hl: true }]
    expect(belegLueckenwort(tokens, 'weiß')).toBe('Weißen')

    const d = deps({
      analyzeKollokationen: async () => ({ kollokatoren: [{ wort: 'weiß', logDice: 10 }], usable: true }),
      fetchBelege: () => [{ quelle: DTA, tokens }],
    })
    const liste = await baueEntwuerfe(DO, d)
    expect(liste.find((e) => e.slot === 'TB-aufloesung').caption).toMatch(/^Gesucht war „Weißen“/)
    const bildBeleg = (await baueEntwuerfe(SA, d)).find((e) => e.slot === 'B-aufloesung')
    expect(bildBeleg.spec.data.collocate).toBe('Weißen')
  })

  it('ohne Eignung fürs Spiel (Pool unter MIN_KOLLOKATOREN) entsteht kein Entwurf', async () => {
    const d = deps({ analyzeKollokationen: vi.fn(async () => ({ kollokatoren: KOLLOKATOREN, usable: false })) })
    expect(await baueEntwuerfe(DI, d)).toEqual([])
    expect(await baueEntwuerfe(DO, d)).toEqual([])
  })

  it('verschiebeDatum rechnet über Monatsgrenzen', () => {
    expect(verschiebeDatum('2099-02-28', 1)).toBe('2099-03-01')
    expect(verschiebeDatum('2099-03-01', -1)).toBe('2099-02-28')
  })
})

describe('erzeugeEntwuerfe / erneuereEntwurf', () => {
  const bildDir = mkdtempSync(join(tmpdir(), 'social-cards-test-'))
  const fakeRenderer = () => {
    const r = { render: vi.fn(async () => ({ gross: Buffer.from('png'), klein: Buffer.from('klein') })), close: vi.fn(async () => {}) }
    fakeRenderer.letzter = r
    return Promise.resolve(r)
  }
  const aufraeumen = () => db.prepare(`DELETE FROM social_card_entwurf WHERE datum BETWEEN '2099-02-01' AND '2099-03-31'`).run()
  // Ein Rätsel mit Bild aus dem Lauf ab Sonntag (Dienstag)
  const raetselDi = () => ladeEntwuerfe(DI, DI).find((x) => x.slot === 'A')

  afterEach(aufraeumen)
  afterAll(() => rmSync(bildDir, { recursive: true, force: true }))

  it('legt die Woche an, zeichnet jede Karte und ist beim zweiten Lauf ohne Wirkung', async () => {
    const opts = { heute: SO, tage: 7, deps: deps(), createRenderer: fakeRenderer, bildDir }
    const erster = await erzeugeEntwuerfe(opts)
    // Plan A: Di Rätsel + Auflösung Mi, Sa Beleg + Auflösung So (Bilder), Do Textbeleg + Auflösung Fr (ohne Bild)
    expect(erster).toMatchObject({ neu: 6, entfernt: 0, gezeichnet: 4, fehler: [] })
    const liste = ladeEntwuerfe(MO, SO2)
    expect(liste.map((e) => `${e.datum}|${e.slot}`)).toEqual([
      `${DI}|A`, `${MI}|A-aufloesung`, `${DO}|TB`, `${FR}|TB-aufloesung`, `${SA}|B`, `${SO2}|B-aufloesung`,
    ])
    const [text, bilder] = [liste.filter((e) => e.spec.format === 'text'), liste.filter((e) => e.spec.format !== 'text')]
    expect(text.map((e) => e.slot).sort()).toEqual(['TB', 'TB-aufloesung'])
    expect(text.every((e) => e.bild === null)).toBe(true)
    expect(bilder.every((e) => e.bild && existsSync(join(bildDir, e.bild)))).toBe(true)
    // Je Bild liegt neben der vollen Fassung eine kleine Vorschau – aus demselben Renderer-Lauf
    expect(bilder.every((e) => readFileSync(join(bildDir, kleinDatei(e.bild)), 'utf8') === 'klein')).toBe(true)

    const zweiter = await erzeugeEntwuerfe({ ...opts, deps: deps() })
    expect(zweiter).toMatchObject({ neu: 0, entfernt: 0, gezeichnet: 0 })
  })

  it('räumt offene Entwürfe des alten Plans samt Bildern ab; Entschiedenes, Heutiges und Zusammengehöriges bleibt', async () => {
    const alt = (datum, slot, format = 'A') => ({ datum, slot, spec: { format, datum, data: {} }, caption: `alt ${slot}`, hashtags: '' })
    // Alter Plan: täglich Teaser, Mo Rätsel/Di Auflösung, Mi Zitat, Fr Beleg/Sa Auflösung, Di Textbeleg/Mi Auflösung.
    // Heute (So) liegt ein Teaser; außerdem ein Entwurf jenseits des Fensters (gehört nicht dem Lauf).
    speichereEntwuerfe([
      alt(SO, 'T', 'T'), alt(MO, 'T', 'T'), alt(DI, 'T', 'T'), alt(MO, 'A'), alt(DI, 'A-aufloesung'),
      alt(MI, 'X', 'X'), alt(FR, 'B', 'B'), alt(SA, 'B-aufloesung', 'B'),
      alt(DI, 'TB', 'text'), alt(MI, 'TB-aufloesung', 'text'), alt('2099-03-20', 'T', 'T'),
    ])
    const id = (datum, slot) => ladeEntwuerfe(datum, datum).find((e) => e.slot === slot).id
    setzeStatus(id(DI, 'T'), 'freigegeben')
    setzeStatus(id(MI, 'X'), 'verworfen')
    setzeStatus(id(FR, 'B'), 'freigegeben')        // die Auflösung am Samstag gehört dazu und bleibt
    const moT = id(MO, 'T')
    for (const name of [`entwurf-${moT}.png`, `entwurf-${moT}-klein.png`, `entwurf-${moT}.png.tmp`]) writeFileSync(join(bildDir, name), 'x')

    const ergebnis = await erzeugeEntwuerfe({ heute: SO, tage: 7, deps: deps(), createRenderer: fakeRenderer, bildDir })
    // weg: Mo T, Mo A + Di A-Auflösung, Di Textbeleg + Mi Auflösung
    expect(ergebnis).toMatchObject({ entfernt: 5, neu: 6, fehler: [] })
    const stand = ladeEntwuerfe(SO, '2099-03-20').map((e) => `${e.datum}|${e.slot}|${e.status}`)
    expect(stand).toEqual([
      `${SO}|T|offen`, `${DI}|T|freigegeben`, `${DI}|A|offen`, `${MI}|X|verworfen`, `${MI}|A-aufloesung|offen`,
      `${DO}|TB|offen`, `${FR}|B|freigegeben`, `${FR}|TB-aufloesung|offen`, `${SA}|B-aufloesung|offen`,
      `${SA}|B|offen`, `${SO2}|B-aufloesung|offen`, `2099-03-20|T|offen`,
    ])
    expect(readdirSync(bildDir).filter((n) => n.startsWith(`entwurf-${moT}.`) || n.startsWith(`entwurf-${moT}-`))).toEqual([])
    // Ein zweiter Lauf hat nichts mehr abzuräumen
    expect(await erzeugeEntwuerfe({ heute: SO, tage: 7, deps: deps(), createRenderer: fakeRenderer, bildDir })).toMatchObject({ entfernt: 0, neu: 0 })
  })

  it('verworfene Entwürfe kommen beim nächsten Lauf nicht zurück', async () => {
    const opts = { heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir }
    await erzeugeEntwuerfe(opts)
    setzeStatus(raetselDi().id, 'verworfen')
    expect((await erzeugeEntwuerfe(opts)).neu).toBe(0)
    expect(raetselDi().status).toBe('verworfen')
  })

  it('Neu erzeugen ersetzt Rätsel und Auflösung gemeinsam – nur solange beide offen sind', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const aufloesung = ladeEntwuerfe(MI, MI).find((e) => e.slot === 'A-aufloesung')

    const neu = deps({ random: () => 0.9 })
    const alt = { raetsel: raetselDi(), aufloesung }
    const neuErgebnis = await erneuereEntwurf(aufloesung, { deps: neu, createRenderer: fakeRenderer, bildDir })
    expect(neuErgebnis.ok).toBe(true)
    const raetsel = raetselDi()
    const aufl = ladeEntwuerfe(MI, MI).find((e) => e.slot === 'A-aufloesung')
    // Für das Änderungsprotokoll: beide ersetzten Entwürfe mit altem und neuem Text
    expect(neuErgebnis.ersetzt.map((x) => x.id).sort()).toEqual([raetsel.id, aufl.id].sort())
    const zuRaetsel = neuErgebnis.ersetzt.find((x) => x.id === raetsel.id)
    expect(zuRaetsel.vorher).toEqual({ caption: alt.raetsel.caption, hashtags: alt.raetsel.hashtags })
    expect(zuRaetsel.nachher).toEqual({ caption: raetsel.caption, hashtags: raetsel.hashtags })
    expect(aufl.spec.data.options).toEqual(raetsel.spec.data.options)
    expect(raetsel.bild).toBeTruthy()

    setzeStatus(raetsel.id, 'freigegeben')
    const ergebnis = await erneuereEntwurf(aufl, { deps: neu, createRenderer: fakeRenderer, bildDir })
    expect(ergebnis.ok).toBe(false)
  })

  it('zieht fehlende Vorschauen in einem Browserlauf nach und lässt das volle Bild unberührt', async () => {
    const opts = { heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir }
    await erzeugeEntwuerfe(opts)
    const bilder = ladeEntwuerfe(MO, MI).filter((e) => e.spec.format !== 'text' && e.bild)
    expect(bilder.map((e) => e.slot)).toEqual(['A', 'A-aufloesung'])
    // Zustand vor der kleinen Vorschau: nur das volle Bild liegt da
    for (const e of bilder) {
      rmSync(join(bildDir, kleinDatei(e.bild)))
      writeFileSync(join(bildDir, e.bild), 'ORIGINAL')
    }
    let starts = 0
    const zaehlend = () => { starts += 1; return fakeRenderer() }
    const ergebnis = await erzeugeEntwuerfe({ ...opts, createRenderer: zaehlend })
    expect(ergebnis.gezeichnet).toBe(0)
    expect(starts).toBe(1)
    for (const e of bilder) {
      expect(readFileSync(join(bildDir, kleinDatei(e.bild)), 'utf8')).toBe('klein')
      expect(readFileSync(join(bildDir, e.bild), 'utf8')).toBe('ORIGINAL')
    }
    // Ein weiterer Lauf hat nichts mehr zu tun – kein Browserstart
    starts = 0
    await erzeugeEntwuerfe({ ...opts, createRenderer: zaehlend })
    expect(starts).toBe(0)
  })

  it('bildPfad liefert die Vorschau, ersatzweise das volle Bild, und zeichnet nie je Abruf nach', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = raetselDi()
    const opts = { bildDir, createRenderer: () => { throw new Error('sollte nicht zeichnen') } }
    expect(await bildPfad(e, { ...opts, groesse: 'klein' })).toBe(join(bildDir, kleinDatei(e.bild)))
    expect(await bildPfad(e, { ...opts, groesse: 'gross' })).toBe(join(bildDir, e.bild))
    rmSync(join(bildDir, kleinDatei(e.bild)))
    expect(await bildPfad(e, { ...opts, groesse: 'klein' })).toBe(join(bildDir, e.bild))
  })

  it('löscht mit alten Entwürfen beide Bilddateien', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = raetselDi()
    expect(existsSync(join(bildDir, e.bild))).toBe(true)
    expect(existsSync(join(bildDir, kleinDatei(e.bild)))).toBe(true)
    // 56 Tage Aufbewahrung: Am 15.05. sind Entwürfe vor dem 20.03. fällig (der Test der Routen nutzt den 06.04.)
    await erzeugeEntwuerfe({ heute: '2099-05-15', tage: 1, deps: deps(), createRenderer: fakeRenderer, bildDir })
    expect(existsSync(join(bildDir, e.bild))).toBe(false)
    expect(existsSync(join(bildDir, kleinDatei(e.bild)))).toBe(false)
  })

  it('löscht auch Dateien, auf die keine bild-Spalte (mehr) zeigt, und liegengebliebene *.tmp', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = raetselDi()
    // Zustand nach „Neu erstellen“ mit Zeichenfehler: Spalte leer, Dateien der alten Fassung liegen noch da
    db.prepare('UPDATE social_card_entwurf SET bild = NULL WHERE id = ?').run(e.id)
    writeFileSync(join(bildDir, `entwurf-${e.id}.png.tmp`), 'halb')
    await erzeugeEntwuerfe({ heute: '2099-05-15', tage: 1, deps: deps(), createRenderer: fakeRenderer, bildDir })
    expect(readdirSync(bildDir).filter((n) => n.startsWith(`entwurf-${e.id}.`) || n.startsWith(`entwurf-${e.id}-`))).toEqual([])
  })

  it('schreibt atomar: nach dem Lauf liegen keine *.tmp-Dateien, nach einem Zeichenfehler keine halben Bilder', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    expect(readdirSync(bildDir).filter((n) => n.endsWith('.tmp'))).toEqual([])

    const e = raetselDi()
    db.prepare('UPDATE social_card_entwurf SET bild = NULL WHERE id = ?').run(e.id)
    rmSync(join(bildDir, e.bild))
    rmSync(join(bildDir, kleinDatei(e.bild)))
    const kaputt = () => Promise.resolve({ render: async () => { throw new Error('Chromium weg') }, close: async () => {} })
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: kaputt, bildDir })
    expect(existsSync(join(bildDir, `entwurf-${e.id}.png`))).toBe(false)
    expect(readdirSync(bildDir).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('Job: Zeichenfehler stoppen den Lauf nicht – übrige Bilder entstehen, Aufräumen wird erreicht', async () => {
    // Ein alter Entwurf samt Dateien, der beim Lauf am 01.03. (Aufbewahrung 56 Tage) fällig ist
    const ALT = '2099-01-02'
    speichereEntwuerfe([{ datum: ALT, slot: 'T', spec: { format: 'T', data: { lemmata: [] } }, caption: 'alt', hashtags: '' }])
    const alt = ladeEntwuerfe(ALT, ALT)[0]
    writeFileSync(join(bildDir, `entwurf-${alt.id}.png`), 'x')
    writeFileSync(join(bildDir, `entwurf-${alt.id}-klein.png`), 'x')
    let n = 0
    const einmalKaputt = () => Promise.resolve({
      render: async () => { n += 1; if (n === 1) throw new Error('Canvas kaputt'); return { gross: Buffer.from('png'), klein: Buffer.from('klein') } },
      close: async () => {},
    })
    const ergebnis = await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: einmalKaputt, bildDir })
    expect(ergebnis.bildFehler).toHaveLength(1)
    expect(ergebnis.bildFehler[0]).toMatch(/Canvas kaputt/)
    expect(ergebnis.gezeichnet).toBeGreaterThan(0)
    expect(ergebnis.geloescht).toBe(1)
    expect(existsSync(join(bildDir, `entwurf-${alt.id}.png`))).toBe(false)
    expect(ladeEntwuerfe(ALT, ALT)).toHaveLength(0)

    // Ein Renderer, der gar nicht startet, bricht den Lauf ebenfalls nicht ab: Das fehlende Bild wird erfasst
    const offen = ladeEntwuerfe(MO, MI).filter((e) => e.spec.format !== 'text' && !e.bild)
    expect(offen.length).toBeGreaterThan(0)
    const ohneStart = () => Promise.reject(new Error('Chromium startet nicht'))
    const spaeter = await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: ohneStart, bildDir })
    expect(spaeter.bildFehler.length).toBeGreaterThan(0)
    expect(spaeter.bildFehler[0]).toMatch(/Chromium startet nicht/)
  })

  it('Neu erstellen: scheitert nur das Zeichnen, ist der Text trotzdem ersetzt (ok, bildFehlt, ersetzt)', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const aufloesung = ladeEntwuerfe(MI, MI).find((e) => e.slot === 'A-aufloesung')
    const vorher = raetselDi()
    const kaputt = () => Promise.resolve({ render: async () => { throw new Error('Zeitlimit') }, close: async () => {} })
    const ergebnis = await erneuereEntwurf(aufloesung, { deps: deps({ random: () => 0.9 }), createRenderer: kaputt, bildDir })
    expect(ergebnis).toMatchObject({ ok: true, bildFehlt: true })
    const nachher = raetselDi()
    expect(ergebnis.ersetzt.map((x) => x.id)).toContain(nachher.id)
    expect(ergebnis.ersetzt.find((x) => x.id === nachher.id).vorher).toEqual({ caption: vorher.caption, hashtags: vorher.hashtags })
    expect(nachher.bild).toBeNull()
    // Auch ein Renderer, der nicht startet, ändert daran nichts
    const ohneStart = () => Promise.reject(new Error('Chromium startet nicht'))
    expect(await erneuereEntwurf(aufloesung, { deps: deps(), createRenderer: ohneStart, bildDir })).toMatchObject({ ok: true, bildFehlt: true })
    // Beim nächsten Abruf wird das Bild nachgezeichnet
    const pfad = await bildPfad(raetselDi(), { bildDir, createRenderer: fakeRenderer })
    expect(existsSync(pfad)).toBe(true)
  })

  it('bildPfad: gleichzeitige Abrufe zeichnen nur einmal; die Vorschau löst nie ein Zeichnen aus, wenn das große Bild da ist', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = raetselDi()
    // große Datei da, Vorschau fehlt: Rückfall auf groß, kein Renderer
    rmSync(join(bildDir, kleinDatei(e.bild)))
    const verboten = () => { throw new Error('sollte nicht zeichnen') }
    expect(await bildPfad(e, { bildDir, createRenderer: verboten, groesse: 'klein' })).toBe(join(bildDir, e.bild))

    // beide fehlen: gleichzeitige Abrufe (mit dem alten Zustand ohne bild) → ein Zeichenlauf
    db.prepare('UPDATE social_card_entwurf SET bild = NULL WHERE id = ?').run(e.id)
    rmSync(join(bildDir, e.bild))
    let starts = 0
    const zaehlend = () => { starts += 1; return fakeRenderer() }
    const ohneBild = { ...e, bild: null }
    const [a, b, c] = await Promise.all([
      bildPfad(ohneBild, { bildDir, createRenderer: zaehlend, groesse: 'klein' }),
      bildPfad(ohneBild, { bildDir, createRenderer: zaehlend, groesse: 'gross' }),
      bildPfad(ohneBild, { bildDir, createRenderer: zaehlend, groesse: 'klein' }),
    ])
    expect(starts).toBe(1)
    expect([a, c]).toEqual([join(bildDir, kleinDatei(e.bild)), join(bildDir, kleinDatei(e.bild))])
    expect(b).toBe(join(bildDir, e.bild))
    // gelöschter Entwurf: kein Bild, kein Zeichnen
    db.prepare('DELETE FROM social_card_entwurf WHERE id = ?').run(e.id)
    expect(await bildPfad({ ...e, bild: null }, { bildDir, createRenderer: verboten })).toBeNull()
  })

  it('bildPfad: fehlen mehrere Bilder (Ordner geleert), zeichnet der erste Abruf alle in einem Browserlauf', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 7, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const mitBild = ladeEntwuerfe(SO, '2099-12-31').filter((e) => e.bild)
    expect(mitBild.length).toBeGreaterThan(1)
    for (const n of readdirSync(bildDir)) rmSync(join(bildDir, n))
    let starts = 0
    const zaehlend = () => { starts += 1; return fakeRenderer() }
    for (const e of mitBild) {
      expect(existsSync(await bildPfad(e, { bildDir, createRenderer: zaehlend, groesse: 'klein' }))).toBe(true)
    }
    expect(starts).toBe(1)
  })
})

describe('mitZeitlimit', () => {
  it('liefert das Ergebnis, wenn es rechtzeitig kommt', async () => {
    expect(await mitZeitlimit(Promise.resolve(7), 1000, 'Test')).toBe(7)
  })

  it('lehnt nach Ablauf ab und ruft beiAblauf (Browser schließen) auf', async () => {
    const zu = vi.fn(async () => {})
    await expect(mitZeitlimit(new Promise(() => {}), 20, 'Zeichnen', zu)).rejects.toThrow(/Zeichnen dauerte länger als/)
    expect(zu).toHaveBeenCalledTimes(1)
  })

  it('reicht Fehler der eigentlichen Arbeit unverändert durch, ohne beiAblauf', async () => {
    const zu = vi.fn()
    await expect(mitZeitlimit(Promise.reject(new Error('echt')), 1000, 'Test', zu)).rejects.toThrow('echt')
    expect(zu).not.toHaveBeenCalled()
  })
})

// Der echte Renderer (Chromium) – nur, wo ein Browser installiert ist (die CI-Prüfung läuft ohne)
describe('createCardRenderer (echter Browser)', () => {
  let chromiumDa = false
  let createCardRenderer
  beforeAll(async () => {
    try {
      const { chromium } = await import('playwright')
      chromiumDa = existsSync(chromium.executablePath())
      ;({ createCardRenderer } = await import('../socialCards/render.js'))
    } catch { chromiumDa = false }
  })

  const pngMasse = (buf) => ({ breite: buf.readUInt32BE(16), hoehe: buf.readUInt32BE(20) })

  it('liefert das volle Bild und die kleine Vorschau (432 × 540) aus einem Lauf', async (ctx) => {
    if (!chromiumDa) return ctx.skip()
    const renderer = await createCardRenderer()
    try {
      const spec = { format: 'T', theme: 'hell', ratio: '4:5', header: true, datum: SO, data: { lemmata: [{ lemma: 'Haus', pos: 'Substantiv' }] } }
      const { gross, klein } = await renderer.render(spec)
      expect(pngMasse(gross)).toEqual({ breite: 1080, hoehe: 1350 })
      expect(pngMasse(klein)).toEqual({ breite: KLEIN_BREITE, hoehe: 540 })
      expect(klein.length).toBeLessThan(gross.length)
    } finally {
      await renderer.close()
    }
  }, 60_000)
})
