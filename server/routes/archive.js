/**
 * server/routes/archive.js
 *
 * Indexierbares Inhalts-Archiv (SEO). Server-seitig gerenderte, statische HTML
 * pro Lemma (/wort/:slug) plus Index (/archiv) und dynamische Sitemap.
 *
 * Wird in server/index.js VOR der express.static(dist)- und der SPA-Fallback-
 * Middleware gemountet, damit diese Pfade nicht vom SPA-Catch-all (index.html)
 * geschluckt werden. nginx proxyt ohnehin alles an Express – keine nginx-Aenderung
 * noetig.
 *
 * Die /sitemap.xml-Route hier hat Vorrang vor der statischen dist/sitemap.xml
 * (Reihenfolge der Middleware), liefert also die um Archiv-URLs erweiterte Sitemap.
 */
import express from 'express'
import { getArchiveEntries, getArchiveEntry, getArchiveSiblings, getArchiveSlugs } from '../archive/index.js'
import { renderWortPage, renderArchivIndex, renderSitemap, renderNotFound, slugifyLemma } from '../archive/render.js'
import { fetchBelegeForLemma } from '../belege.js'
import { fetchCollocationSample } from '../wortprofil.js'
import logger from '../logger.js'

const router = express.Router()

// Eine Stunde Public-Cache: Inhalte aendern sich hoechstens taeglich; entlastet
// Origin und CDN/Browser, ohne dass neue Tage tagelang unsichtbar bleiben.
const CACHE_CONTROL = 'public, max-age=3600'

router.get('/archiv', (_req, res) => {
  try {
    res.type('html').set('Cache-Control', CACHE_CONTROL).send(renderArchivIndex(getArchiveEntries()))
  } catch (err) {
    logger.error({ err }, 'Archiv-Index-Rendering fehlgeschlagen')
    res.status(500).type('html').send(renderNotFound())
  }
})

router.get('/wort/:slug', async (req, res) => {
  try {
    const slug = slugifyLemma(req.params.slug)

    // Nicht-kanonische Schreibweise (Grossschreibung, Umlaut-Encoding) → 301 auf
    // den kanonischen Slug, damit keine Duplikate indexiert werden.
    if (slug && slug !== req.params.slug && getArchiveEntry(slug)) {
      return res.redirect(301, `/wort/${slug}`)
    }

    const entry = getArchiveEntry(slug)
    if (!entry) {
      return res.status(404).type('html').set('Cache-Control', 'public, max-age=300').send(renderNotFound())
    }
    // Korpus-Belege fuers Lemma (graceful: [] wenn belege.db fehlt). Bewusst
    // ohne Kollokator → kein Spiel-Loesungsset.
    const belege = fetchBelegeForLemma(entry.lemma, { limit: 2 })
    // Kollokations-Stichprobe OHNE die Top-Loesung (siehe fetchCollocationSample).
    // wortart kann Zusaetze tragen ("Substantiv, feminin") → erstes Wort als pos.
    const pos = (entry.wortart || 'Substantiv').split(/[,\s/]/)[0] || 'Substantiv'
    let kollokationen = []
    try {
      kollokationen = await fetchCollocationSample(entry.lemma, pos)
    } catch (err) {
      logger.warn({ err, lemma: entry.lemma }, 'Kollokations-Sample fehlgeschlagen')
    }
    res.type('html').set('Cache-Control', CACHE_CONTROL)
      .send(renderWortPage(entry, getArchiveSiblings(slug, 8), { thema: entry.thema, belege, kollokationen }))
  } catch (err) {
    logger.error({ err, slug: req.params.slug }, 'Wort-Seiten-Rendering fehlgeschlagen')
    res.status(500).type('html').send(renderNotFound())
  }
})

router.get('/sitemap.xml', (_req, res) => {
  try {
    res.type('application/xml').set('Cache-Control', CACHE_CONTROL).send(renderSitemap(getArchiveSlugs()))
  } catch (err) {
    logger.error({ err }, 'Sitemap-Rendering fehlgeschlagen')
    res.status(500).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>')
  }
})

export default router
