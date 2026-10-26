/**
 * server/jobs/socialPosting.js
 *
 * Social Cards, Stufe 2: veröffentlicht FREIGEGEBENE Entwürfe des Tages auf
 * Bluesky (Entscheidungen Nutzer 2026-10-26: nur freigegebene, 18:30 Uhr, nur
 * Bluesky). Auflösungen (Slots `*-aufloesung`) erscheinen als Antwort auf den
 * Beitrag vom Vortag; ist der nicht gepostet, bleibt die Auflösung liegen.
 *
 * Hauptschalter SOCIAL_POSTEN in der .env:
 *   (leer)/off  nichts passiert (Standard)
 *   test        schreibt ins Log, was gepostet würde, ruft Bluesky nicht auf
 *   on          postet wirklich
 *
 * Takt: alle 10 Minuten zwischen 18:30 und 22:00 Berliner Zeit. Was schon
 * gepostet ist, steht in social_post – ein Neustart um 18:35 holt also nach,
 * ohne doppelt zu posten. Nach drei Fehlversuchen gibt der Job für diesen
 * Entwurf auf und meldet sich per Alert.
 */

import cron from 'node-cron'
import { readFileSync } from 'node:fs'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { altText, cardDims, zeichenZahl, BLUESKY_MAX_ZEICHEN } from '../../shared/socialCards.js'
import { verschiebeDatum } from '../socialCards/entwuerfe.js'
import { createBlueskyClient, blueskyKonfiguriert } from '../socialCards/bluesky.js'
import { faelligeEntwuerfe, ladeEntwuerfe, ladePost, merkePost, merkePostFehler } from '../socialCards/store.js'
import { bildPfad as standardBildPfad, berlinHeute } from './socialCardDrafts.js'

const TIMEZONE = 'Europe/Berlin'
export const POST_ZEIT = { stunde: 18, minute: 30 }
export const POST_ENDE_STUNDE = 22
export const MAX_VERSUCHE = 3

export function postenModus(env = process.env) {
  const w = String(env.SOCIAL_POSTEN || '').trim().toLowerCase()
  return w === 'on' ? 'on' : w === 'test' ? 'test' : 'aus'
}

function berlinZeit(now) {
  const teile = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(now)
  const wert = (typ) => Number(teile.find((t) => t.type === typ)?.value)
  return { stunde: wert('hour') % 24, minute: wert('minute') }
}

/** Liegt `now` im Postfenster 18:30–22:00 (Berlin)? */
export function imPostfenster(now = new Date()) {
  const { stunde, minute } = berlinZeit(now)
  const ab = stunde > POST_ZEIT.stunde || (stunde === POST_ZEIT.stunde && minute >= POST_ZEIT.minute)
  return ab && stunde < POST_ENDE_STUNDE
}

/** Der Text, wie er auf Bluesky erscheint: Beitragstext, Leerzeile, Hashtags. */
export function posttext(e) {
  return e.hashtags ? `${e.caption}\n\n${e.hashtags}` : e.caption
}

// Rätsel/Beleg vom Vortag, auf den eine Auflösung antwortet
function vorgaenger(e) {
  if (!e.slot.endsWith('-aufloesung')) return null
  const datum = verschiebeDatum(e.datum, -1)
  const slot = e.slot.replace('-aufloesung', '')
  return ladeEntwuerfe(datum, datum).find((x) => x.slot === slot) || null
}

// Ein Postlauf zur Zeit (Cron-Takt und Start dürfen sich nicht überholen)
let kette = Promise.resolve()
// Im Testmodus merkt sich der Prozess, was schon geloggt wurde (sonst alle 10 Minuten erneut)
const testGeloggt = new Set()

/**
 * Postet alle fälligen Entwürfe von heute.
 * @returns {Promise<{ modus: string, gepostet: number, uebersprungen: number, fehler: number }>}
 */
export function postFaellige({
  now = new Date(),
  env = process.env,
  client = null,
  bildPfad = standardBildPfad,
  imFenster = imPostfenster,
} = {}) {
  const lauf = kette.then(async () => {
    const modus = postenModus(env)
    const ergebnis = { modus, gepostet: 0, uebersprungen: 0, fehler: 0 }
    if (modus === 'aus' || !imFenster(now)) return ergebnis
    if (modus === 'on' && !blueskyKonfiguriert(env)) {
      logger.warn('Social Posting: SOCIAL_POSTEN=on, aber BLUESKY_HANDLE/BLUESKY_APP_PASSWORD fehlen')
      return ergebnis
    }
    const bluesky = client ?? (modus === 'on' ? createBlueskyClient({ env }) : null)

    // Beiträge vor Auflösungen (eine Auflösung von heute hängt am Beitrag von gestern, nicht von heute)
    const liste = faelligeEntwuerfe(berlinHeute(now), MAX_VERSUCHE)
      .sort((a, b) => Number(a.slot.endsWith('-aufloesung')) - Number(b.slot.endsWith('-aufloesung')))

    for (const e of liste) {
      const text = posttext(e)
      if (zeichenZahl(text) > BLUESKY_MAX_ZEICHEN) {
        logger.warn({ entwurf: e.id }, 'Social Posting: Text zu lang, übersprungen')
        if (modus === 'on') merkePostFehler(e.id, 'Text länger als 300 Zeichen')
        ergebnis.fehler += 1
        continue
      }

      let antwortAuf
      const vor = vorgaenger(e)
      if (e.slot.endsWith('-aufloesung')) {
        const post = vor && ladePost(vor.id)
        if (!post?.uri) {
          logger.info({ entwurf: e.id, slot: e.slot }, 'Social Posting: Auflösung ohne geposteten Beitrag vom Vortag – bleibt liegen')
          ergebnis.uebersprungen += 1
          continue
        }
        antwortAuf = {
          root: { uri: post.rootUri || post.uri, cid: post.rootCid || post.cid },
          parent: { uri: post.uri, cid: post.cid },
        }
      }

      try {
        let bild
        if (e.spec.format !== 'text') {
          const pfad = await bildPfad(e)
          if (!pfad) throw new Error('Bild fehlt')
          const { W, H } = cardDims(e.spec.ratio)
          bild = { bytes: readFileSync(pfad), alt: altText(e.spec), breite: W, hoehe: H }
        }

        if (modus === 'test') {
          if (!testGeloggt.has(e.id)) {
            testGeloggt.add(e.id)
            logger.info({ entwurf: e.id, slot: e.slot, text, alt: bild?.alt, antwort: !!antwortAuf },
              'Social Posting (Test): würde jetzt auf Bluesky posten')
          }
          continue
        }

        const { uri, cid } = await bluesky.poste({ text, bild, antwortAuf, jetzt: now })
        merkePost({ entwurfId: e.id, uri, cid, rootUri: antwortAuf?.root.uri ?? null, rootCid: antwortAuf?.root.cid ?? null })
        logger.info({ entwurf: e.id, slot: e.slot, uri }, 'Social Posting: auf Bluesky veröffentlicht')
        ergebnis.gepostet += 1
      } catch (err) {
        const versuche = merkePostFehler(e.id, err?.message || err)
        logger.warn({ err, entwurf: e.id, versuche }, 'Social Posting: Veröffentlichen fehlgeschlagen')
        ergebnis.fehler += 1
        if (versuche >= MAX_VERSUCHE) {
          reportAlert('social_posting_failed', `Bluesky-Beitrag ${e.datum} ${e.slot} nach ${versuche} Versuchen nicht veröffentlicht: ${err?.message || err}`)
        }
      }
    }

    if (ergebnis.gepostet || ergebnis.fehler) logger.info(ergebnis, 'Social Posting: Lauf')
    return ergebnis
  })
  kette = lauf.catch(() => {})
  return lauf
}

export function startSocialPosting() {
  const modus = postenModus()
  const lauf = () => postFaellige().catch((err) => {
    logger.error({ err }, 'Social Posting: Lauf fehlgeschlagen')
    reportAlert('social_posting_failed', `Social Posting fehlgeschlagen: ${err?.message || err}`)
  })
  const task = cron.schedule(`*/10 ${POST_ZEIT.stunde}-${POST_ENDE_STUNDE - 1} * * *`, lauf, { timezone: TIMEZONE })
  lauf() // Nachholen nach Neustart im Postfenster
  logger.info({ modus }, `Social Posting geplant (ab ${POST_ZEIT.stunde}:${String(POST_ZEIT.minute).padStart(2, '0')} Uhr, Modus ${modus})`)
  return task
}

export default startSocialPosting
