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
import { baueEntwuerfe, kurzQuelle, verschiebeDatum } from '../socialCards/entwuerfe.js'
import { belegLueckentext, belegLueckenwort, zeichenZahl, BLUESKY_MAX_ZEICHEN } from '../../shared/socialCards.js'
import { ladeEntwuerfe, setzeStatus, speichereEntwuerfe } from '../socialCards/store.js'
import { erzeugeEntwuerfe, erneuereEntwurf, bildPfad, kleinDatei } from '../jobs/socialCardDrafts.js'
import { KLEIN_BREITE, mitZeitlimit } from '../socialCards/render.js'

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
    // Das Datum im Kartenkopf ist der Tag des Entwurfs (nicht heute, nicht der nächste Spieltag)
    expect(liste.map((e) => [e.datum, e.spec.datum])).toEqual([[MO, MO], [MO, MO], [DI, DI]])
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
    const auf = (await baueEntwuerfe(MO, deps({ loadKalender: () => ohneWiederholung }))).find((e) => e.slot === 'A-aufloesung')
    expect(auf.caption).toMatch(/\n\nMehr Verbindungen: signifikation\.de\/wort\/gedaechtnis$/)
  })

  it('Tag ohne Plan-Slot: nur Teaser; Tag ohne Kalender: nichts', async () => {
    expect((await baueEntwuerfe(SO, deps())).map((e) => e.slot)).toEqual(['T'])
    expect(await baueEntwuerfe('2099-03-20', deps())).toEqual([])
  })

  it('Dienstag: Textbeleg ohne Bild mit Kurzquelle, Auflösung am Mittwoch mit Satz und Dokumentquelle', async () => {
    const d = deps()
    const liste = await baueEntwuerfe(DI, d)
    expect(liste.map((e) => `${e.datum}|${e.slot}`)).toEqual([`${DI}|T`, `${DI}|TB`, `${MI}|TB-aufloesung`])
    expect(d.analyzeKollokationBest).toHaveBeenCalledWith('Tisch') // Vortags-Lemma (Montag)

    const [, post, antwort] = liste
    expect(post.spec.format).toBe('text')
    expect(post.hashtags).toBe('#Linguistik #DeutscheSprache #Korpuslinguistik')
    expect(antwort.hashtags).toBe('')
    expect(post.caption).toBe('„Das ______ Gedächtnis einer Zeit.“\n\nWelches Wort fehlt? (Deutsches Textarchiv · CC BY-SA 4.0)')
    expect(antwort.spec.reveal).toBe(true)
    expect(antwort.caption).toBe('Gesucht war „kolloK1“:\n„Das kolloK1 Gedächtnis einer Zeit.“\n\nQuelle: Roman (1890) · CC BY-SA 4.0')
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
    expect(aufloesung.caption).toBe('Gesucht war „kolloK1“:\n„Das kolloK1 Gedächtnis einer Zeit.“\n\nQuelle: Roman (1890) · CC BY-SA 4.0')
    expect(aufloesung.hashtags).toBe('')
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

  it('Auflösungen nennen die Wortform im Satz, nicht die Grundform', async () => {
    const tokens = [{ w: 'das', ws: false }, { w: 'Weißen', ws: true, hl: true }, { w: 'Haus.', ws: true, hl: true }]
    expect(belegLueckenwort(tokens, 'weiß')).toBe('Weißen')

    const d = deps({
      analyzeKollokationBest: async () => ({ kollokatoren: [{ wort: 'weiß', logDice: 10 }] }),
      fetchBelege: () => [{ quelle: DTA, tokens }],
    })
    const liste = await baueEntwuerfe(DO, d)
    expect(liste.find((e) => e.slot === 'TB-aufloesung').caption).toMatch(/^Gesucht war „Weißen“/)
    const bildBeleg = (await baueEntwuerfe(FR, d)).find((e) => e.slot === 'B-aufloesung')
    expect(bildBeleg.spec.data.collocate).toBe('Weißen')
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

  afterEach(aufraeumen)
  afterAll(() => rmSync(bildDir, { recursive: true, force: true }))

  it('legt die Woche an, zeichnet jede Karte und ist beim zweiten Lauf ohne Wirkung', async () => {
    const opts = { heute: SO, tage: 7, deps: deps(), createRenderer: fakeRenderer, bildDir }
    const erster = await erzeugeEntwuerfe(opts)
    // Mo–Fr belegt: 5 Teaser + A + A-Auflösung + X + B + B-Auflösung (Bilder)
    // plus Di/Do je Textbeleg + Auflösung (ohne Bild)
    expect(erster).toMatchObject({ neu: 14, gezeichnet: 10, fehler: [] })
    const liste = ladeEntwuerfe(MO, SA)
    expect(liste).toHaveLength(14)
    const [text, bilder] = [liste.filter((e) => e.spec.format === 'text'), liste.filter((e) => e.spec.format !== 'text')]
    expect(text.map((e) => e.slot).sort()).toEqual(['TB', 'TB', 'TB-aufloesung', 'TB-aufloesung'])
    expect(text.every((e) => e.bild === null)).toBe(true)
    expect(bilder.every((e) => e.bild && existsSync(join(bildDir, e.bild)))).toBe(true)
    // Je Bild liegt neben der vollen Fassung eine kleine Vorschau – aus demselben Renderer-Lauf
    expect(bilder.every((e) => readFileSync(join(bildDir, kleinDatei(e.bild)), 'utf8') === 'klein')).toBe(true)

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
    const alt = { raetsel: ladeEntwuerfe(MO, MO).find((e) => e.slot === 'A'), aufloesung }
    const neuErgebnis = await erneuereEntwurf(aufloesung, { deps: neu, createRenderer: fakeRenderer, bildDir })
    expect(neuErgebnis.ok).toBe(true)
    const raetsel = ladeEntwuerfe(MO, MO).find((e) => e.slot === 'A')
    const aufl = ladeEntwuerfe(DI, DI).find((e) => e.slot === 'A-aufloesung')
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
    const bilder = ladeEntwuerfe(MO, DI).filter((e) => e.spec.format !== 'text' && e.bild)
    expect(bilder.length).toBeGreaterThanOrEqual(3)
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
    const e = ladeEntwuerfe(MO, MO).find((x) => x.slot === 'T')
    const opts = { bildDir, createRenderer: () => { throw new Error('sollte nicht zeichnen') } }
    expect(await bildPfad(e, { ...opts, groesse: 'klein' })).toBe(join(bildDir, kleinDatei(e.bild)))
    expect(await bildPfad(e, { ...opts, groesse: 'gross' })).toBe(join(bildDir, e.bild))
    rmSync(join(bildDir, kleinDatei(e.bild)))
    expect(await bildPfad(e, { ...opts, groesse: 'klein' })).toBe(join(bildDir, e.bild))
  })

  it('löscht mit alten Entwürfen beide Bilddateien', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = ladeEntwuerfe(MO, MO).find((x) => x.slot === 'T')
    expect(existsSync(join(bildDir, e.bild))).toBe(true)
    expect(existsSync(join(bildDir, kleinDatei(e.bild)))).toBe(true)
    // 56 Tage Aufbewahrung: Am 15.05. sind Entwürfe vor dem 20.03. fällig (der Test der Routen nutzt den 06.04.)
    await erzeugeEntwuerfe({ heute: '2099-05-15', tage: 1, deps: deps(), createRenderer: fakeRenderer, bildDir })
    expect(existsSync(join(bildDir, e.bild))).toBe(false)
    expect(existsSync(join(bildDir, kleinDatei(e.bild)))).toBe(false)
  })

  it('löscht auch Dateien, auf die keine bild-Spalte (mehr) zeigt, und liegengebliebene *.tmp', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = ladeEntwuerfe(MO, MO).find((x) => x.slot === 'T')
    // Zustand nach „Neu erstellen“ mit Zeichenfehler: Spalte leer, Dateien der alten Fassung liegen noch da
    db.prepare('UPDATE social_card_entwurf SET bild = NULL WHERE id = ?').run(e.id)
    writeFileSync(join(bildDir, `entwurf-${e.id}.png.tmp`), 'halb')
    await erzeugeEntwuerfe({ heute: '2099-05-15', tage: 1, deps: deps(), createRenderer: fakeRenderer, bildDir })
    expect(readdirSync(bildDir).filter((n) => n.startsWith(`entwurf-${e.id}.`) || n.startsWith(`entwurf-${e.id}-`))).toEqual([])
  })

  it('schreibt atomar: nach dem Lauf liegen keine *.tmp-Dateien, nach einem Zeichenfehler keine halben Bilder', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    expect(readdirSync(bildDir).filter((n) => n.endsWith('.tmp'))).toEqual([])

    const e = ladeEntwuerfe(MO, MO).find((x) => x.slot === 'T')
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
    const offen = ladeEntwuerfe(MO, DI).filter((e) => e.spec.format !== 'text' && !e.bild)
    expect(offen.length).toBeGreaterThan(0)
    const ohneStart = () => Promise.reject(new Error('Chromium startet nicht'))
    const spaeter = await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: ohneStart, bildDir })
    expect(spaeter.bildFehler.length).toBeGreaterThan(0)
    expect(spaeter.bildFehler[0]).toMatch(/Chromium startet nicht/)
  })

  it('Neu erstellen: scheitert nur das Zeichnen, ist der Text trotzdem ersetzt (ok, bildFehlt, ersetzt)', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const aufloesung = ladeEntwuerfe(DI, DI).find((e) => e.slot === 'A-aufloesung')
    const vorher = ladeEntwuerfe(MO, MO).find((e) => e.slot === 'A')
    const kaputt = () => Promise.resolve({ render: async () => { throw new Error('Zeitlimit') }, close: async () => {} })
    const ergebnis = await erneuereEntwurf(aufloesung, { deps: deps({ random: () => 0.9 }), createRenderer: kaputt, bildDir })
    expect(ergebnis).toMatchObject({ ok: true, bildFehlt: true })
    const nachher = ladeEntwuerfe(MO, MO).find((e) => e.slot === 'A')
    expect(ergebnis.ersetzt.map((x) => x.id)).toContain(nachher.id)
    expect(ergebnis.ersetzt.find((x) => x.id === nachher.id).vorher).toEqual({ caption: vorher.caption, hashtags: vorher.hashtags })
    expect(nachher.bild).toBeNull()
    // Auch ein Renderer, der nicht startet, ändert daran nichts
    const ohneStart = () => Promise.reject(new Error('Chromium startet nicht'))
    expect(await erneuereEntwurf(aufloesung, { deps: deps(), createRenderer: ohneStart, bildDir })).toMatchObject({ ok: true, bildFehlt: true })
    // Beim nächsten Abruf wird das Bild nachgezeichnet
    const pfad = await bildPfad(ladeEntwuerfe(MO, MO).find((e) => e.slot === 'A'), { bildDir, createRenderer: fakeRenderer })
    expect(existsSync(pfad)).toBe(true)
  })

  it('bildPfad: gleichzeitige Abrufe zeichnen nur einmal; die Vorschau löst nie ein Zeichnen aus, wenn das große Bild da ist', async () => {
    await erzeugeEntwuerfe({ heute: SO, tage: 2, deps: deps(), createRenderer: fakeRenderer, bildDir })
    const e = ladeEntwuerfe(MO, MO).find((x) => x.slot === 'T')
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
