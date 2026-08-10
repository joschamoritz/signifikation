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
import { fetchSyntagmaticPatterns, fetchSecondaryCollocates, fetchRegisterProfil } from '../wortprofil.js'
import { fetchBelegeForLemma } from '../belege.js'
import { getCachedQuery } from '../query-cache.js'
import logger from '../logger.js'

/** wortart kann Zusätze tragen ("Substantiv, feminin") → erstes Wort als POS. */
function normalizePos(wortart) {
  return (String(wortart || 'Substantiv').split(/[,\s/]/)[0]) || 'Substantiv'
}

/**
 * Baut das vollständige Detail-Datenpaket für ein Lemma.
 * @param {{lemma:string, wortart?:string}} entry  public entry (toPublicEntry)
 * @returns {{ pos:string, total:number, patterns:Array, netz:Array, belege:Array, register:Array }}
 */
export function buildWortDetail(entry, { patternLimit = 10, belegLimit = 2 } = {}) {
  const pos = normalizePos(entry.wortart)
  let patterns = []
  let total = 0
  let netz = []
  let belege = []
  let register = []

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
  try {
    // Leeres Ergebnis ist hier ein gültiger Befund („kein Registerprofil"),
    // kein Fehler — die Anzeige lässt den Block dann weg.
    register = fetchRegisterProfil(entry.lemma, pos)
  } catch (err) {
    logger.warn({ err, lemma: entry.lemma }, 'buildWortDetail: Registerprofil fehlgeschlagen')
  }

  return { pos, total, patterns, netz, belege, register }
}

/**
 * Memoisierte Variante für die Request-Pfade (SSR + JSON-API).
 *
 * buildWortDetail feuert 5–6 SYNCHRONE Queries (inkl. FTS5 auf belege.db) und
 * blockiert damit die Event-Loop des einzigen Prozesses. Der HTTP-Cache-Header
 * ist per Query-String umgehbar und nginx cached nicht → ohne Memoisierung
 * rechnet jeder Request (Crawler!) voll neu. Inhalte ändern sich höchstens
 * täglich; 1h TTL (query-cache, LRU-gedeckelt) entspricht dem Cache-Control
 * der Routen. Bewusst auch leere Ergebnisse cachen: Lemmata ohne
 * Wortprofil-Treffer sollen nicht bei jedem Hit neu rechnen.
 */
export function buildWortDetailCached(entry, { patternLimit = 10, belegLimit = 2 } = {}) {
  const pos = normalizePos(entry.wortart)
  const key = `wortdetail:${String(entry.lemma).toLowerCase()}:${pos}:${patternLimit}:${belegLimit}`
  return getCachedQuery(key, () => buildWortDetail(entry, { patternLimit, belegLimit }))
}
