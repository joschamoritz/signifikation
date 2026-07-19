/**
 * server/archive/detail.js
 *
 * Gemeinsame Aggregationsschicht für die Wort-Detailansicht des Archivs.
 * Bündelt syntagmatische Muster, sekundäres Wortnetz und KWiC-Belege zu EINEM
 * Objekt, das sowohl das SSR-Rendering (server/archive/render.js) als auch eine
 * spätere In-App-JSON-Route speisen kann — damit beide Darstellungen nie
 * auseinanderdriften (DRY).
 *
 * Datenschutz/R1: Eingang ist ein bereits gewhitelistetes public entry
 * (toPublicEntry). Das Archiv enthält ausschließlich strikt VERGANGENE Tage;
 * Slugs mit erneutem künftigen Spieltag sind komplett ausgeschlossen (siehe
 * server/archive/index.js) – die hier gezeigten Top-Kollokatoren sind also
 * keine offene Lösung eines noch kommenden Spieltags, sondern das
 * Nachschlage-Profil eines bereits gespielten Worts (wie DWDS Wortprofil).
 *
 * Alle Aufrufe sind fehlertolerant: fehlt eine DB (belege.db/wortprofil.db),
 * bleibt der jeweilige Block leer, die Seite rendert trotzdem.
 */
import { fetchSyntagmaticPatterns, fetchSecondaryCollocates } from '../wortprofil.js'
import { fetchBelegeForLemma } from '../belege.js'
import logger from '../logger.js'

/** wortart kann Zusätze tragen ("Substantiv, feminin") → erstes Wort als POS. */
export function normalizePos(wortart) {
  return (String(wortart || 'Substantiv').split(/[,\s/]/)[0]) || 'Substantiv'
}

/**
 * Baut das vollständige Detail-Datenpaket für ein Lemma.
 * @param {{lemma:string, wortart?:string}} entry  public entry (toPublicEntry)
 * @returns {{ pos:string, total:number, patterns:Array, netz:Array, belege:Array }}
 */
export function buildWortDetail(entry, { patternLimit = 10, belegLimit = 2 } = {}) {
  const pos = normalizePos(entry.wortart)
  let patterns = []
  let total = 0
  let netz = []
  let belege = []

  try {
    const res = fetchSyntagmaticPatterns(entry.lemma, pos, { limit: patternLimit })
    patterns = res.patterns
    total = res.total
  } catch (err) {
    logger.warn({ err, lemma: entry.lemma }, 'buildWortDetail: Muster fehlgeschlagen')
  }
  try {
    // Bereits geholte Muster durchreichen → keine doppelte SELECT+SUM-Abfrage.
    netz = fetchSecondaryCollocates(entry.lemma, pos, { patterns })
  } catch (err) {
    logger.warn({ err, lemma: entry.lemma }, 'buildWortDetail: Wortnetz fehlgeschlagen')
  }
  try {
    belege = fetchBelegeForLemma(entry.lemma, { limit: belegLimit })
  } catch (err) {
    logger.warn({ err, lemma: entry.lemma }, 'buildWortDetail: Belege fehlgeschlagen')
  }

  return { pos, total, patterns, netz, belege }
}
