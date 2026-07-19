/**
 * server/archive/index.js
 *
 * Datenschicht fuer das indexierbare Inhalts-Archiv (SEO).
 * Aggregiert die in `kalender` geplanten und bereits VERGANGENEN Tage zu einer
 * Liste oeffentlicher Lemma-Eintraege. Heutige und zukuenftige Tage bleiben
 * aussen vor – sonst waeren tagesaktuelle Loesungen ableitbar. Das gilt auch
 * fuer WIEDERVERWENDETE Lemmata: Ein Slug, der zusaetzlich an einem heutigen/
 * kuenftigen Tag geplant ist, wird KOMPLETT ausgeschlossen (nicht nur dessen
 * Zukunfts-Datum), denn die Detailseite listet die staerksten Kollokatoren –
 * faktisch das Loesungsset des kommenden Spieltags (buildMixedRound = Top-3).
 *
 * Quelle ist SQLite (store.load/loadKalender), nicht die statischen koll-*.json:
 * SQLite ist die primaere Laufzeit-Persistenz und liefert volle Jahres-Daten.
 *
 * R1/Datenschutz: Es werden ausschliesslich gewhitelistete Felder uebernommen
 * (siehe toPublicEntry in render.js). Interne Felder (runden/kollokatoren = LOESUNG,
 * notiz, bonusFrage, rundenInfo, lueckenfueller) werden hier nie weitergereicht.
 */
import { load, loadKalender } from '../store.js'
import { toPublicEntry, slugifyLemma } from './render.js'

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'
const CACHE_TTL_MS = 10 * 60 * 1000

function berlinToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

let _cache = null // { builtAt, entries, bySlug: Map, slugs }

function buildIndex() {
  const today = berlinToday()

  const lemmata = load('lemmata.json')
  const byId = new Map()
  for (const l of lemmata) {
    if (l && l.id != null && l.lemma) byId.set(String(l.id), l)
  }

  const kalender = loadKalender() || {}

  // Pass 1: Slugs mit heutigem/kuenftigem Spieltag sammeln. Ausschluss per
  // SLUG (nicht per ID), damit auch ein zweiter Kalender-Eintrag mit anderer
  // ID, aber gleichem Wortlaut, die Loesung nicht vorab verraten kann.
  const futureSlugs = new Set()
  for (const [datum, entry] of Object.entries(kalender)) {
    if (!datum || datum < today) continue
    const ids = Array.isArray(entry?.ids) ? entry.ids : []
    for (const id of ids) {
      const lem = byId.get(String(id))
      if (!lem) continue
      const slug = slugifyLemma(lem.lemma)
      if (slug) futureSlugs.add(slug)
    }
  }

  // Pass 2: slug → { lemma, latestDate, dates:Set }. Bei Slug-Kollision (zwei
  // IDs, gleicher transliterierter Wortlaut) gewinnt der Eintrag des juengsten
  // Tages fuer die Anzeige; alle Tage werden trotzdem gesammelt.
  const bySlugRaw = new Map()
  for (const [datum, entry] of Object.entries(kalender)) {
    if (!datum || datum >= today) continue // nur strikt vergangene Tage
    const ids = Array.isArray(entry?.ids) ? entry.ids : []
    for (const id of ids) {
      const lem = byId.get(String(id))
      if (!lem) continue
      const slug = slugifyLemma(lem.lemma)
      if (!slug || futureSlugs.has(slug)) continue // kuenftig erneut geplant → raus
      // Lange Beschreibung bevorzugt, sonst Kurztitel; Quelle optional.
      const themaText = (entry?.thema || entry?.thema_kurz || '').trim()
      const themaQuelle = (entry?.thema_quelle || '').trim()
      let rec = bySlugRaw.get(slug)
      if (!rec) {
        rec = { lemma: lem, latestDate: datum, dates: new Set(), themaText, themaQuelle }
        bySlugRaw.set(slug, rec)
      } else if (datum > rec.latestDate) {
        rec.lemma = lem
        rec.latestDate = datum
        rec.themaText = themaText
        rec.themaQuelle = themaQuelle
      }
      rec.dates.add(datum)
    }
  }

  const bySlug = new Map()
  for (const [slug, rec] of bySlugRaw) {
    const pub = toPublicEntry(rec.lemma, [...rec.dates])
    // Tagesthema (oeffentlich) inkl. Datum des juengsten Auftretens.
    pub.thema = rec.themaText
      ? { datum: rec.latestDate, text: rec.themaText, quelle: rec.themaQuelle }
      : null
    bySlug.set(slug, pub)
  }

  const entries = [...bySlug.values()].sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
  const slugs = entries.map((e) => e.slug)

  return { builtAt: Date.now(), entries, bySlug, slugs }
}

function getIndex() {
  if (!_cache || Date.now() - _cache.builtAt > CACHE_TTL_MS) {
    _cache = buildIndex()
  }
  return _cache
}

/** Alle oeffentlichen Eintraege, alphabetisch (fuer /archiv + Sitemap-Liste). */
export function getArchiveEntries() {
  return getIndex().entries
}

/** Ein oeffentlicher Eintrag per (bereits normalisiertem) Slug oder null. */
export function getArchiveEntry(slug) {
  return getIndex().bySlug.get(slug) || null
}

/** Alle Slugs (fuer die Sitemap). */
export function getArchiveSlugs() {
  return getIndex().slugs
}

/**
 * Bis zu `n` alphabetische Nachbar-Eintraege (mit Umlauf) fuer interne
 * Verlinkung/Crawl-Tiefe – ohne den Eintrag selbst.
 */
export function getArchiveSiblings(slug, n = 6) {
  const { entries } = getIndex()
  const idx = entries.findIndex((e) => e.slug === slug)
  if (idx === -1 || entries.length <= 1) return []
  const out = []
  for (let step = 1; step <= entries.length - 1 && out.length < n; step++) {
    out.push(entries[(idx + step) % entries.length])
  }
  return out.map((e) => ({ slug: e.slug, lemma: e.lemma }))
}

/** Nur fuer Tests: Cache verwerfen. */
export function _resetArchiveCache() {
  _cache = null
}
