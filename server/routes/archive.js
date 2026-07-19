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
import { buildWortDetail } from '../archive/detail.js'
import { validate, woerterQuerySchema } from '../middleware/validate.js'
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
    // Vollständiges Detail-Datenpaket (syntagmatische Muster, Wortnetz, KWiC-
    // Belege). Fehlertolerant: fehlt eine DB, bleiben die Blöcke leer, die Seite
    // rendert trotzdem. Der Index enthält nur vergangene Tage und schließt
    // Slugs mit erneutem künftigen Spieltag komplett aus (archive/index.js) →
    // die Top-Kollokatoren sind keine offene Lösung eines kommenden Spieltags.
    const detail = buildWortDetail(entry, { patternLimit: 10, belegLimit: 5 })
    res.type('html').set('Cache-Control', CACHE_CONTROL)
      .send(renderWortPage(entry, getArchiveSiblings(slug, 8), { thema: entry.thema, detail }))
  } catch (err) {
    logger.error({ err, slug: req.params.slug }, 'Wort-Seiten-Rendering fehlgeschlagen')
    res.status(500).type('html').send(renderNotFound())
  }
})

// ── JSON-API für den In-App-Archiv-Tab (Phase 2) ─────────────────────────────
// Bewusst eigener Pfad /api/v1/woerter (nicht /api/v1/archiv – das ist in
// public.js der tagesbezogene koll-MM-DD.json-Rückblick, ein anderes Feature).
// Frei zugänglich (kein Auth), wie das öffentliche SSR-Archiv.

// GET /api/v1/woerter[?q=] – alphabetische Wortliste, optional gefiltert.
router.get('/api/v1/woerter', validate(woerterQuerySchema, 'query'), (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase()
    let entries = getArchiveEntries()
    if (q) {
      entries = entries.filter((e) => e.lemma.toLowerCase().includes(q))
    }
    // Nur leichte Felder für die Liste; Details kommen über /:slug.
    const woerter = entries.map((e) => ({
      slug: e.slug,
      lemma: e.lemma,
      wortart: e.wortart,
      ipa: e.ipa,
      definition: e.definitionen[0] || '',
    }))
    res.set('Cache-Control', CACHE_CONTROL).json({ count: woerter.length, woerter })
  } catch (err) {
    logger.error({ err }, 'Wörter-Liste (API) fehlgeschlagen')
    res.status(500).json({ error: 'Archiv derzeit nicht verfügbar', code: 'INTERNAL_ERROR' })
  }
})

// GET /api/v1/woerter/:slug – vollständiges Wort-Detail (Muster, Wortnetz, KWiC).
router.get('/api/v1/woerter/:slug', (req, res) => {
  try {
    const slug = slugifyLemma(req.params.slug)
    const entry = getArchiveEntry(slug)
    if (!entry) {
      return res.status(404).set('Cache-Control', 'public, max-age=300').json({ error: 'Wort nicht im Archiv', code: 'NOT_FOUND' })
    }
    // Mehr Belege fürs Aufklappmenü im App-Tab (zeigt 3, „Mehr anzeigen" enthüllt Rest).
    const detail = buildWortDetail(entry, { patternLimit: 10, belegLimit: 8 })
    res.set('Cache-Control', CACHE_CONTROL).json({
      slug: entry.slug,
      lemma: entry.lemma,
      wortart: entry.wortart,
      ipa: entry.ipa,
      definitionen: entry.definitionen,
      dates: entry.dates,
      thema: entry.thema || null,
      detail,
      siblings: getArchiveSiblings(slug, 8),
    })
  } catch (err) {
    logger.error({ err, slug: req.params.slug }, 'Wort-Detail (API) fehlgeschlagen')
    res.status(500).json({ error: 'Archiv derzeit nicht verfügbar', code: 'INTERNAL_ERROR' })
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
