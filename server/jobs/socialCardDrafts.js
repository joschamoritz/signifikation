/**
 * server/jobs/socialCardDrafts.js
 *
 * Social-Card-Entwürfe, Stufe 1 (Plan 2026-10-21): Jeden Morgen um 04:20
 * (Europe/Berlin) werden für die nächsten 7 Tage die fehlenden Entwürfe
 * angelegt (Wochenplan in socialCards/entwuerfe.js) und als PNG gezeichnet.
 * Veröffentlicht wird noch nichts – die Entwürfe warten im Admin unter
 * Werkzeuge › Social Cards (#werkzeuge/social-cards) auf Freigabe.
 *
 * Idempotent: Pro (datum, slot) gibt es genau einen Entwurf; ein Lauf ergänzt
 * nur Fehlendes und rührt Entscheidungen nicht an. Ein verpasster Lauf holt
 * sich am nächsten Morgen über das 7-Tage-Fenster von selbst nach.
 * Ändert sich der Wochenplan (zuletzt 2026-10-26, Plan A), entfernt der Lauf
 * OFFENE Entwürfe im Fenster ab morgen, die nicht mehr dazu passen, samt
 * Bildern; Freigegebenes und Verworfenes bleibt.
 * Entwürfe älter als 8 Wochen werden samt Bildern gelöscht. Je Entwurf gibt es
 * zwei Dateien: das volle Bild (entwurf-<id>.png) und eine kleine Vorschau
 * (entwurf-<id>-klein.png) für die Liste im Admin.
 *
 * SOCIAL_CARDS_ENTWUERFE=off schaltet den Zeitplan ab (Admin-Button bleibt).
 */

import cron from 'node-cron'
import { mkdirSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { DB_PATH } from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { loadKalender, getLemmataIndex } from '../store.js'
import { fetchBelege } from '../belege.js'
import { fetchRelation, fetchBonusQuestion, POS_ROUNDS } from '../wortprofil.js'
import { createKollokationAnalyse } from '../kollokationAnalyse.js'
import { baueEntwuerfe, gehoertZumPlan, verschiebeDatum } from '../socialCards/entwuerfe.js'
import { createCardRenderer } from '../socialCards/render.js'
import {
  vorhandeneSlots, speichereEntwuerfe, ersetzeEntwurf, ladeEntwuerfe, ladeEntwuerfeAb, ladeEntwurf,
  entwuerfeOhneBild, setzeBild, loescheAlteEntwuerfe, loescheOffeneEntwuerfe,
} from '../socialCards/store.js'

const TIMEZONE = 'Europe/Berlin'
export const HORIZONT_TAGE = 7
export const AUFBEWAHRUNG_TAGE = 56
export const BILD_DIR = process.env.SOCIAL_CARDS_DIR || join(dirname(DB_PATH), 'social-cards')

export function berlinHeute(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now)
}

function standardDeps() {
  const { analyzeKollokationBest } = createKollokationAnalyse({ fetchRelation, fetchBonusQuestion, POS_ROUNDS })
  return { loadKalender, getLemmataIndex, fetchBelege, analyzeKollokationBest }
}

// Läufe nacheinander, nie zwei Chromium-Instanzen gleichzeitig (Cron + Admin-Button).
let kette = Promise.resolve()
function exklusiv(fn) {
  const lauf = kette.then(fn, fn)
  kette = lauf.catch(() => {})
  return lauf
}

/** Dateiname der kleinen Vorschau zum vollen Bild (entwurf-7.png → entwurf-7-klein.png). */
export function kleinDatei(datei) {
  return datei.replace(/\.png$/i, '-klein.png')
}

/**
 * Zeichnet ein Bild und legt volle Fassung und Vorschau nebeneinander ab. Geschrieben wird atomar
 * (erst *.tmp, dann umbenennen): Ein Abruf mitten im Schreiben sieht nie eine halbe PNG-Datei,
 * und ein Abbruch hinterlässt keine abgeschnittene Datei unter dem echten Namen.
 */
async function zeichneBild(renderer, entwurf, bildDir, { nurKlein = false } = {}) {
  const datei = `entwurf-${entwurf.id}.png`
  const { gross, klein } = await renderer.render(entwurf.spec)
  const ziele = []
  if (!nurKlein) ziele.push([join(bildDir, datei), gross])
  ziele.push([join(bildDir, kleinDatei(datei)), klein])
  try {
    for (const [pfad, daten] of ziele) writeFileSync(`${pfad}.tmp`, daten)
  } catch (err) {
    for (const [pfad] of ziele) { try { unlinkSync(`${pfad}.tmp`) } catch {} }
    throw err
  }
  for (const [pfad] of ziele) renameSync(`${pfad}.tmp`, pfad)
  return datei
}

/**
 * Zeichnet alle Bild-Entwürfe ab `abDatum`, denen das Bild fehlt (Textposts haben keins).
 * Entwürfe aus der Zeit vor der kleinen Vorschau bekommen sie in derselben Charge nachgezogen;
 * ihr volles Bild bleibt dabei unangetastet.
 * Jeder Entwurf wird einzeln gezeichnet: Ein Fehler bei einem Bild stoppt die übrigen nicht. Auch
 * ein Browser, der nicht startet, wirft nicht – alle betroffenen Entwürfe landen in `fehler`.
 * @returns {Promise<{ gezeichnet:number, fehler:Array<{ id:number, meldung:string }> }>}
 */
async function zeichneFehlende(abDatum, { createRenderer, bildDir, vorschauAb = abDatum }) {
  const offen = entwuerfeOhneBild(abDatum).filter((e) => e.spec.format !== 'text')
  const ohneVorschau = ladeEntwuerfeAb(vorschauAb).filter((e) =>
    e.bild && e.status !== 'verworfen' && e.spec.format !== 'text' &&
    !existsSync(join(bildDir, kleinDatei(basename(e.bild)))))
  const ergebnis = { gezeichnet: 0, fehler: [] }
  if (!offen.length && !ohneVorschau.length) return ergebnis
  const meldung = (err) => String(err?.message || err)
  mkdirSync(bildDir, { recursive: true })
  let renderer
  try {
    renderer = await createRenderer()
  } catch (err) {
    logger.warn({ err }, 'Social Cards: Renderer konnte nicht gestartet werden')
    for (const e of new Set([...offen, ...ohneVorschau])) ergebnis.fehler.push({ id: e.id, meldung: meldung(err) })
    return ergebnis
  }
  try {
    for (const e of offen) {
      try {
        setzeBild(e.id, await zeichneBild(renderer, e, bildDir))
        ergebnis.gezeichnet += 1
      } catch (err) {
        logger.warn({ err, id: e.id }, 'Social Cards: Bild konnte nicht gezeichnet werden')
        ergebnis.fehler.push({ id: e.id, meldung: meldung(err) })
      }
    }
    for (const e of ohneVorschau) {
      try {
        await zeichneBild(renderer, e, bildDir, { nurKlein: existsSync(join(bildDir, basename(e.bild))) })
      } catch (err) {
        logger.warn({ err, id: e.id }, 'Social Cards: Vorschau konnte nicht nachgezogen werden')
        ergebnis.fehler.push({ id: e.id, meldung: meldung(err) })
      }
    }
  } finally {
    await renderer.close().catch((err) => logger.warn({ err }, 'Social Cards: Renderer ließ sich nicht schließen'))
  }
  return ergebnis
}

/** Löscht die Bilddateien gelöschter Entwürfe (volle Fassung, Vorschau, liegengebliebene *.tmp). */
function entferneBilder(bildDir, namen) {
  for (const datei of namen) {
    for (const name of [basename(datei), kleinDatei(basename(datei))]) {
      for (const ende of ['', '.tmp']) {
        try { unlinkSync(join(bildDir, name + ende)) } catch {}
      }
    }
  }
}

/** Gegenstück eines Rätsels/Belegs ('datum|slot'): Auflösung am Folgetag bzw. Post am Vortag. */
function partnerSchluessel(e) {
  if (e.slot.endsWith('-aufloesung')) return `${verschiebeDatum(e.datum, -1)}|${e.slot.replace('-aufloesung', '')}`
  return `${verschiebeDatum(e.datum, 1)}|${e.slot}-aufloesung`
}

/**
 * Entfernt Entwürfe von morgen bis `bis`, die offen sind und nicht mehr zum Wochenplan passen
 * (samt Bildern). Post und Auflösung gehören zusammen: Ist das Gegenstück entschieden oder von
 * heute (heute wird nie aufgeräumt), bleibt auch der Entwurf – sonst fehlte einem Post die Auflösung.
 * @returns {number} Zahl der entfernten Entwürfe
 */
function entferneVeralteteEntwuerfe(heute, bis, bildDir) {
  const morgen = verschiebeDatum(heute, 1)
  const alle = ladeEntwuerfe(heute, bis)
  const veraltet = alle.filter((e) => e.datum >= morgen && e.status === 'offen' && !gehoertZumPlan(e.datum, e.slot))
  const weg = new Set(veraltet.map((e) => `${e.datum}|${e.slot}`))
  const bleibt = new Set(alle.map((e) => `${e.datum}|${e.slot}`).filter((k) => !weg.has(k)))
  const ids = veraltet.filter((e) => !bleibt.has(partnerSchluessel(e))).map((e) => e.id)
  if (!ids.length) return 0
  const geloescht = loescheOffeneEntwuerfe(ids)
  for (const namen of geloescht) entferneBilder(bildDir, namen)
  return geloescht.length
}

/**
 * Räumt künftige Entwürfe ab, die nicht mehr zum Wochenplan passen, und legt fehlende Entwürfe
 * für morgen bis heute+tage an und zeichnet sie.
 * Fehler beim Bauen stehen in `fehler`, Fehler beim Zeichnen in `bildFehler` – beides stoppt den
 * Lauf nicht; das Aufräumen alter Entwürfe wird immer erreicht.
 * @returns {Promise<{ neu:number, entfernt:number, gezeichnet:number, geloescht:number, fehler:string[], bildFehler:string[] }>}
 *   `entfernt`: nicht mehr geplante offene Entwürfe; `geloescht`: Entwürfe älter als die Aufbewahrung
 */
export function erzeugeEntwuerfe({
  heute = berlinHeute(),
  tage = HORIZONT_TAGE,
  deps = standardDeps(),
  createRenderer = createCardRenderer,
  bildDir = BILD_DIR,
} = {}) {
  return exklusiv(async () => {
    const von = verschiebeDatum(heute, 1)
    const bis = verschiebeDatum(heute, tage)
    // +1: Auflösungen landen am Folgetag des letzten Fenstertags
    const fensterEnde = verschiebeDatum(bis, 1)
    const ergebnis = { neu: 0, entfernt: 0, gezeichnet: 0, geloescht: 0, fehler: [], bildFehler: [] }
    // Vor dem Anlegen, damit `vorhanden` die frei gewordenen Slots nicht mehr enthält
    try {
      ergebnis.entfernt = entferneVeralteteEntwuerfe(heute, fensterEnde, bildDir)
    } catch (err) {
      logger.warn({ err }, 'Social Cards: Veraltete Entwürfe konnten nicht entfernt werden')
      ergebnis.fehler.push(`Aufräumen: ${err?.message || err}`)
    }
    const vorhanden = vorhandeneSlots(von, fensterEnde)

    for (let datum = von; datum <= bis; datum = verschiebeDatum(datum, 1)) {
      try {
        const liste = await baueEntwuerfe(datum, deps, { vorhanden })
        ergebnis.neu += speichereEntwuerfe(liste)
      } catch (err) {
        logger.warn({ err, datum }, 'Social Cards: Entwurf konnte nicht gebaut werden')
        ergebnis.fehler.push(`${datum}: ${err?.message || err}`)
      }
    }

    // Die Liste im Admin beginnt heute, die Vorschauen werden deshalb ab heute nachgezogen
    try {
      const z = await zeichneFehlende(von, { createRenderer, bildDir, vorschauAb: heute })
      ergebnis.gezeichnet = z.gezeichnet
      ergebnis.bildFehler = z.fehler.map((f) => `#${f.id}: ${f.meldung}`)
    } catch (err) {
      logger.warn({ err }, 'Social Cards: Zeichnen fehlgeschlagen')
      ergebnis.bildFehler.push(String(err?.message || err))
    }

    // Aufräumen auch nach Zeichenfehlern; Dateien nach ID, nicht nur nach der Spalte `bild`
    for (const namen of loescheAlteEntwuerfe(verschiebeDatum(heute, -AUFBEWAHRUNG_TAGE))) {
      entferneBilder(bildDir, namen)
      ergebnis.geloescht += 1
    }

    logger.info(ergebnis, 'Social Cards: Entwürfe erzeugt')
    return ergebnis
  })
}

/**
 * Baut einen offenen Entwurf neu (neue Daten, neue Reihenfolge, neues Bild).
 * Rätsel/Beleg und ihre Auflösung gehören zusammen und werden gemeinsam
 * ersetzt – deshalb müssen beide noch offen sein.
 * @returns {Promise<{ ok:boolean, grund?:string, bildFehlt?:boolean, ersetzt?:Array<{ id:number, vorher:?{ caption:string, hashtags:string }, nachher:{ caption:string, hashtags:string } }> }>}
 *   `ersetzt` nennt jeden neu gebauten Entwurf mit altem und neuem Text (für das Änderungsprotokoll).
 *   Sobald Texte ersetzt sind, ist das Ergebnis immer `ok`: Scheitert nur das Zeichnen, steht
 *   `bildFehlt: true` dabei (das Bild kommt beim nächsten Abruf bzw. Lauf), der Text ist ja schon neu.
 */
export function erneuereEntwurf(entwurf, {
  deps = standardDeps(),
  createRenderer = createCardRenderer,
  bildDir = BILD_DIR,
} = {}) {
  return exklusiv(async () => {
    const istAufloesung = entwurf.slot.endsWith('-aufloesung')
    const herkunft = istAufloesung ? verschiebeDatum(entwurf.datum, -1) : entwurf.datum
    const basis = entwurf.slot.replace('-aufloesung', '')
    const gruppe = [basis, `${basis}-aufloesung`]

    const betroffen = ladeEntwuerfe(herkunft, verschiebeDatum(herkunft, 1))
      .filter((e) => gruppe.includes(e.slot) && (e.slot === basis ? e.datum === herkunft : e.datum !== herkunft))
    if (betroffen.some((e) => e.status !== 'offen')) {
      return { ok: false, grund: 'Rätsel und Auflösung gehören zusammen – beide müssen offen sein.' }
    }

    const liste = (await baueEntwuerfe(herkunft, deps)).filter((e) => gruppe.includes(e.slot))
    if (!liste.length) return { ok: false, grund: 'Für diesen Tag lassen sich keine Kartendaten mehr bauen.' }
    const vorher = new Map(betroffen.map((e) => [`${e.datum}|${e.slot}`, { caption: e.caption, hashtags: e.hashtags }]))
    for (const e of liste) {
      if (!ersetzeEntwurf(e)) speichereEntwuerfe([e])
    }
    const ersetzt = ladeEntwuerfe(herkunft, verschiebeDatum(herkunft, 1))
      .filter((e) => liste.some((n) => n.datum === e.datum && n.slot === e.slot))
      .map((e) => ({
        id: e.id,
        vorher: vorher.get(`${e.datum}|${e.slot}`) ?? null,
        nachher: { caption: e.caption, hashtags: e.hashtags },
      }))
    // Texte sind ersetzt: ab hier darf nichts mehr werfen, sonst fehlte das Protokoll (und der Client den Stand)
    let bildFehlt = false
    try {
      const { fehler } = await zeichneFehlende(herkunft, { createRenderer, bildDir })
      const ids = new Set(ersetzt.map((e) => e.id))
      bildFehlt = fehler.some((f) => ids.has(f.id))
    } catch (err) {
      logger.warn({ err }, 'Social Cards: Neu erstellt, aber das Bild konnte nicht gezeichnet werden')
      bildFehlt = true
    }
    return bildFehlt ? { ok: true, ersetzt, bildFehlt: true } : { ok: true, ersetzt }
  })
}

/**
 * Pfad zum Bild eines Entwurfs; zeichnet es nach, falls die Datei fehlt.
 * `groesse: 'klein'` liefert die Vorschau; gibt es sie (noch) nicht, kommt die volle Fassung
 * zurück – nachgezeichnet wird die Vorschau dann beim nächsten Lauf des Jobs (zeichneFehlende),
 * nicht je Abruf.
 */
export async function bildPfad(entwurf, { createRenderer = createCardRenderer, bildDir = BILD_DIR, groesse = 'gross' } = {}) {
  const vollPfad = (e) => (e.bild ? join(bildDir, basename(e.bild)) : null)
  // Die Vorschau gibt es nur, wenn die Datei da ist – sonst die volle Fassung (nie je Abruf zeichnen)
  const mitKlein = (voll) => {
    const klein = kleinDatei(voll)
    return groesse === 'klein' && existsSync(klein) ? klein : voll
  }
  const pfad = vollPfad(entwurf)
  if (pfad && existsSync(pfad)) return mitKlein(pfad)
  return exklusiv(async () => {
    // Beim Warten in der Schlange kann ein anderer Abruf oder Lauf das Bild gezeichnet – oder der
    // Entwurf neu erstellt / gelöscht – haben: Zustand neu laden und mit dem aktuellen Spec zeichnen.
    const aktuell = ladeEntwurf(entwurf.id)
    if (!aktuell) return null
    const schon = vollPfad(aktuell)
    if (schon && existsSync(schon)) return mitKlein(schon)
    mkdirSync(bildDir, { recursive: true })
    const renderer = await createRenderer()
    let datei
    try {
      datei = await zeichneBild(renderer, aktuell, bildDir)
    } finally {
      await renderer.close()
    }
    setzeBild(aktuell.id, datei)
    return mitKlein(join(bildDir, datei))
  })
}

export function startSocialCardDrafts() {
  if (process.env.SOCIAL_CARDS_ENTWUERFE === 'off') {
    logger.info('Social Cards: Entwurfs-Job per SOCIAL_CARDS_ENTWUERFE=off abgeschaltet')
    return null
  }
  const task = cron.schedule('20 4 * * *', () => {
    erzeugeEntwuerfe().then((ergebnis) => {
      if (ergebnis.bildFehler.length) {
        reportAlert('social_cards_failed', `Social-Card-Bilder fehlgeschlagen (${ergebnis.bildFehler.length}): ${ergebnis.bildFehler[0]}`)
      }
    }).catch((err) => {
      logger.error({ err }, 'Social Cards: Entwurfs-Job fehlgeschlagen')
      reportAlert('social_cards_failed', `Social-Card-Entwürfe fehlgeschlagen: ${err?.message || err}`)
    })
  }, { timezone: TIMEZONE })
  logger.info('Social Cards: Entwurfs-Job geplant (täglich 04:20 Europe/Berlin, 7 Tage voraus)')
  return task
}

export default startSocialCardDrafts
