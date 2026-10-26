/**
 * server/jobs/socialCardDrafts.js
 *
 * Social-Card-Entwürfe, Stufe 1 (Plan 2026-10-21): Jeden Morgen um 04:20
 * (Europe/Berlin) werden für die nächsten 7 Tage die fehlenden Entwürfe
 * angelegt (Wochenplan in socialCards/entwuerfe.js) und als PNG gezeichnet.
 * Veröffentlicht wird noch nichts – die Entwürfe warten im Postfach unter
 * /admin/social-cards auf Freigabe.
 *
 * Idempotent: Pro (datum, slot) gibt es genau einen Entwurf; ein Lauf ergänzt
 * nur Fehlendes und rührt Entscheidungen nicht an. Ein verpasster Lauf holt
 * sich am nächsten Morgen über das 7-Tage-Fenster von selbst nach.
 * Entwürfe älter als 8 Wochen werden samt Bild gelöscht.
 *
 * SOCIAL_CARDS_ENTWUERFE=off schaltet den Zeitplan ab (Admin-Button bleibt).
 */

import cron from 'node-cron'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { DB_PATH } from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { loadKalender, getLemmataIndex } from '../store.js'
import { fetchBelege } from '../belege.js'
import { fetchRelation, fetchBonusQuestion, POS_ROUNDS } from '../wortprofil.js'
import { createKollokationAnalyse } from '../kollokationAnalyse.js'
import { baueEntwuerfe, verschiebeDatum } from '../socialCards/entwuerfe.js'
import { createCardRenderer } from '../socialCards/render.js'
import {
  vorhandeneSlots, speichereEntwuerfe, ersetzeEntwurf, ladeEntwuerfe,
  entwuerfeOhneBild, setzeBild, loescheAlteEntwuerfe,
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

/** Zeichnet alle Bild-Entwürfe ab `abDatum`, denen das Bild fehlt (Textposts haben keins). */
async function zeichneFehlende(abDatum, { createRenderer, bildDir }) {
  const offen = entwuerfeOhneBild(abDatum).filter((e) => e.spec.format !== 'text')
  if (!offen.length) return 0
  mkdirSync(bildDir, { recursive: true })
  const renderer = await createRenderer()
  try {
    for (const e of offen) {
      const datei = `entwurf-${e.id}.png`
      writeFileSync(join(bildDir, datei), await renderer.render(e.spec))
      setzeBild(e.id, datei)
    }
  } finally {
    await renderer.close()
  }
  return offen.length
}

/**
 * Legt fehlende Entwürfe für morgen bis heute+tage an und zeichnet sie.
 * @returns {Promise<{ neu:number, gezeichnet:number, geloescht:number, fehler:string[] }>}
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
    const vorhanden = vorhandeneSlots(von, verschiebeDatum(bis, 1))
    const ergebnis = { neu: 0, gezeichnet: 0, geloescht: 0, fehler: [] }

    for (let datum = von; datum <= bis; datum = verschiebeDatum(datum, 1)) {
      try {
        const liste = await baueEntwuerfe(datum, deps, { vorhanden })
        ergebnis.neu += speichereEntwuerfe(liste)
      } catch (err) {
        logger.warn({ err, datum }, 'Social Cards: Entwurf konnte nicht gebaut werden')
        ergebnis.fehler.push(`${datum}: ${err?.message || err}`)
      }
    }

    ergebnis.gezeichnet = await zeichneFehlende(von, { createRenderer, bildDir })

    for (const datei of loescheAlteEntwuerfe(verschiebeDatum(heute, -AUFBEWAHRUNG_TAGE))) {
      try { unlinkSync(join(bildDir, basename(datei))) } catch {}
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
 * @returns {Promise<{ ok:boolean, grund?:string }>}
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
    const gruppe = basis === 'T' ? ['T'] : [basis, `${basis}-aufloesung`]

    const betroffen = ladeEntwuerfe(herkunft, verschiebeDatum(herkunft, 1))
      .filter((e) => gruppe.includes(e.slot) && (e.slot === basis ? e.datum === herkunft : e.datum !== herkunft))
    if (betroffen.some((e) => e.status !== 'offen')) {
      return { ok: false, grund: 'Rätsel und Auflösung gehören zusammen – beide müssen offen sein.' }
    }

    const liste = (await baueEntwuerfe(herkunft, deps)).filter((e) => gruppe.includes(e.slot))
    if (!liste.length) return { ok: false, grund: 'Für diesen Tag lassen sich keine Kartendaten mehr bauen.' }
    for (const e of liste) {
      if (!ersetzeEntwurf(e)) speichereEntwuerfe([e])
    }
    await zeichneFehlende(herkunft, { createRenderer, bildDir })
    return { ok: true }
  })
}

/** Pfad zum Bild eines Entwurfs; zeichnet es nach, falls die Datei fehlt. */
export async function bildPfad(entwurf, { createRenderer = createCardRenderer, bildDir = BILD_DIR } = {}) {
  const pfad = entwurf.bild ? join(bildDir, basename(entwurf.bild)) : null
  if (pfad && existsSync(pfad)) return pfad
  return exklusiv(async () => {
    mkdirSync(bildDir, { recursive: true })
    const datei = `entwurf-${entwurf.id}.png`
    const renderer = await createRenderer()
    try {
      writeFileSync(join(bildDir, datei), await renderer.render(entwurf.spec))
    } finally {
      await renderer.close()
    }
    setzeBild(entwurf.id, datei)
    return join(bildDir, datei)
  })
}

export function startSocialCardDrafts() {
  if (process.env.SOCIAL_CARDS_ENTWUERFE === 'off') {
    logger.info('Social Cards: Entwurfs-Job per SOCIAL_CARDS_ENTWUERFE=off abgeschaltet')
    return null
  }
  const task = cron.schedule('20 4 * * *', () => {
    erzeugeEntwuerfe().catch((err) => {
      logger.error({ err }, 'Social Cards: Entwurfs-Job fehlgeschlagen')
      reportAlert('social_cards_failed', `Social-Card-Entwürfe fehlgeschlagen: ${err?.message || err}`)
    })
  }, { timezone: TIMEZONE })
  logger.info('Social Cards: Entwurfs-Job geplant (täglich 04:20 Europe/Berlin, 7 Tage voraus)')
  return task
}

export default startSocialCardDrafts
