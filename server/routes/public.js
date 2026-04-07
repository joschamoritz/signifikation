import express        from 'express'
import { join, normalize, sep } from 'path'
import { readFileSync } from 'fs'
import { fetchBelege, belegeVerfuegbar } from '../belege.js'
import { fetchRelation } from '../wortprofil.js'
import { fetchWiktionary } from '../wiktionary.js'
import { load, loadReadOnly, save, loadZeitreise, loadWortZwilling, loadZeitenwende, loadStats, withStatsLock, getLemmataIndex, cacheGet, cacheSet, DATA } from '../store.js'
import { belegeLimiter, statsLimiter, feedbackLimiter } from '../middleware/rateLimiter.js'
import { serverError } from '../middleware/auth.js'
import { validate, statsSchema, feedbackSchema, belegeQuerySchema, archivQuerySchema, qQuerySchema, bonusQuerySchema } from '../middleware/validate.js'
import logger from '../logger.js'

const router = express.Router()

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'

function todayDatum() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
  const [year, month, day] = d.split('-')
  return { mmdd: `${month}-${day}`, year: Number(year) }
}

/** GET /health – öffentlich: nur Status. Details über /admin/health. */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/** GET /api/heute → die 3 Lemmata des Tages */
router.get('/api/v1/heute', (req, res) => {
  try {
    const today     = todayDatum()
    const datum     = req.query.datum || today.mmdd
    const year      = today.year
    const kalender       = loadReadOnly('kalender.json')
    const { byId }       = getLemmataIndex()

    const ids = kalender[datum]
    if (!ids) return res.status(404).json({ error: `Kein Eintrag für ${datum}` })

    const lemmata = ids.map(id => byId.get(id)).filter(Boolean)
    res.json({ datum, year, lemmata })
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/zeitreise → Zeitreise-Eintrag des Tages */
router.get('/api/v1/zeitreise', (req, res) => {
  try {
    const datum     = req.query.datum || todayDatum().mmdd
    const zeitreise = loadReadOnly('zeitreise.json') ?? {}
    const entry     = zeitreise[datum]
    if (!entry) return res.status(404).json({ error: `Kein Zeitreise-Eintrag für ${datum}` })
    // pos aus lemmata.json ergänzen, falls vorhanden
    const { byLemma } = getLemmataIndex()
    const lemmaData   = byLemma.get(entry.lemma)
    res.json({ pos: lemmaData?.pos ?? null, ...entry })
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/wortzwilling → Wort-Zwilling-Eintrag des Tages (ohne Scores) */
router.get('/api/v1/wortzwilling', (req, res) => {
  try {
    const datum = req.query.datum || todayDatum().mmdd
    const wz    = loadReadOnly('wortzwilling.json') ?? {}
    const entry = wz[datum]
    if (!entry) return res.status(404).json({ error: `Kein Wort-Zwilling-Eintrag für ${datum}` })
    // Scores nicht ans Frontend senden (spielrelevante Antworten sind zuordnung-Felder)
    const safe = {
      ...entry,
      kollokatoren: entry.kollokatoren.map(({ wort, zuordnung }) => ({ wort, zuordnung })),
    }
    res.json(safe)
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/zeitenwende → Zeitenwende-Eintrag des Tages (inkl. IPA + Definitionen) */
router.get('/api/v1/zeitenwende', async (req, res) => {
  try {
    const datum = req.query.datum || todayDatum().mmdd
    const zw    = loadZeitenwende()
    const entry = zw[datum]
    if (!entry) return res.status(404).json({ error: `Kein Zeitenwende-Eintrag für ${datum}` })

    const cacheKey = `wikt:${entry.lemma}`
    let wikt = cacheGet(cacheKey)
    if (!wikt) {
      wikt = await fetchWiktionary(entry.lemma)
      cacheSet(cacheKey, wikt)
    }

    res.json({ ...entry, ipa: wikt.ipa || '', definitionen: wikt.definitionen || [] })
  } catch (err) { serverError(res, err) }
})

/**
 * GET /api/v1/belege – Korpusbelege für ein Kollokationspaar
 *
 * Sucht im DWDS-Korpus nach Belegsätzen, in denen lemma und collocate gemeinsam vorkommen.
 * Die Suche verwendet eine Fallback-Strategie: Für jede syntaktische Relation (rel) werden
 * mehrere Query-Varianten von spezifisch (exakte Phrase) bis generisch (Fenstersuche mit #N)
 * nacheinander versucht. Sobald ≥2 Treffer gefunden wurden, wird abgebrochen.
 *
 * Wikipedia-Einträge werden herausgefiltert (noWiki), da sie häufig unnatürliche
 * Kookkurrenzen enthalten und die Belegqualität verschlechtern.
 *
 * Korpora-Fallback-Reihenfolge: kern → kern21 → dtak → dtae → dwdsxl
 * (von moderner Standardsprache zu historischen und Großkorpora)
 *
 * Query-Parameter:
 *   lemma      string  Hauptlemma (z.B. 'Wasser')
 *   collocate  string  Kollokat (z.B. 'trinken')
 *   rel        string  Syntaktische Relation (OBJ, KON, ~ATTR, ~OBJ, SUBJA, SUBJP, ...)
 *   corpus     string  Optional. Bevorzugtes Korpus (kern, dta, dtae, dtak, ...)
 *   year       number  Optional. Zentraljahr für Zeitfenster ±15 Jahre
 *
 * Response 200: { belege: [{ tokens: [{ w, ws, hl }], quelle: string }] }
 */
router.get('/api/v1/belege', belegeLimiter, validate(belegeQuerySchema, 'query'), (req, res) => {
  const { collocate, lemma, year } = req.query

  const cacheKey = `belege:${encodeURIComponent(lemma)}:${encodeURIComponent(collocate)}:${year || ''}`
  const cached = cacheGet(cacheKey)
  if (cached) return res.json(cached)

  if (!belegeVerfuegbar()) {
    return res.json([])
  }

  try {
    const results = fetchBelege(lemma, collocate, { limit: 5, year: year || null })
    cacheSet(cacheKey, results)
    res.json(results)
  } catch (err) {
    logger.error({ err }, 'Belege-Fehler')
    res.json([])
  }
})

/** GET /api/v1/stats – nicht unterstützt (nur POST) */
router.get('/api/v1/stats', (_req, res) => res.status(405).json({ error: 'Method Not Allowed' }))

/** POST /api/stats – anonyme Spielstatistik erfassen */
router.post('/api/v1/stats', statsLimiter, validate(statsSchema), async (req, res) => {
  const { game, datum, score, max } = req.body
  try {
    await withStatsLock(async () => {
      const stats = loadStats()
      if (!stats[datum]) stats[datum] = {}
      if (!stats[datum][game]) stats[datum][game] = { plays: 0, scoreSum: 0, maxSum: 0, dist: Array(11).fill(0) }
      const entry = stats[datum][game]
      entry.plays++
      entry.scoreSum += Math.max(0, score)
      entry.maxSum   += max
      const normalized = Math.min(10, Math.max(0, Math.round((score || 0) / (max || 1) * 10)))
      entry.dist[normalized]++
      await save('stats.json', stats)
    })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, game, datum }, 'Stats-Speicherung fehlgeschlagen')
    serverError(res, err)
  }
})

/** POST /api/feedback – Nutzerfeedback speichern */
router.post('/api/v1/feedback', feedbackLimiter, validate(feedbackSchema), async (req, res) => {
  const { game, emoji, text } = req.body
  const entry = { game, emoji, text, ts: new Date().toISOString() }
  try {
    let list = []
    try { list = load('feedback.json') } catch {}
    list.unshift(entry)
    await save('feedback.json', list)
    res.json({ ok: true })
  } catch (err) { serverError(res, err) }
})

/** GET /api/archiv?date=YYYY-MM-DD – Tageseintrag für vergangene Tage */
router.get('/api/v1/archiv', validate(archivQuerySchema, 'query'), async (req, res) => {
  const { date } = req.query
  const todayBerlin = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
  if (date > todayBerlin) return res.status(403).json({ error: 'Zukünftige Einträge nicht verfügbar' })
  try {
    const mm   = date.slice(5, 7), dd = date.slice(8, 10)
    const file = join(DATA, `koll-${mm}-${dd}.json`)

    // Path-Traversal-Schutz: normalisierter Pfad muss innerhalb DATA bleiben.
    // Separator-Check verhindert Matches wie /data-extra/... gegen /data/...
    const normalized = normalize(file)
    const normalizedData = normalize(DATA) + sep
    if (!normalized.startsWith(normalizedData)) {
      logger.warn({ path: file }, 'Path-Traversal-Versuch blockiert')
      return res.json({ datum: date.slice(5), lemmata: [] })
    }

    const raw  = JSON.parse(readFileSync(file, 'utf8'))
    const lemmata = raw.lemmata || []
    res.json({ datum: `${mm}-${dd}`, year: date.slice(0, 4), lemmata })
  } catch (err) {
    logger.warn({ err, date }, 'Archiv-Abruf fehlgeschlagen')
    res.json({ datum: date.slice(5), lemmata: [] })
  }
})

/** GET /api/ipa – IPA-Aussprache via Wiktionary */
router.get('/api/v1/ipa', validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  try {
    const url = `https://de.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(q)}&prop=wikitext&format=json&formatversion=2`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Signifikation/1.0 (signifikation.de; Bildungsprojekt)' },
    })
    if (!r.ok) return res.json([])
    const data = await r.json()
    const wikitext = data.parse?.wikitext ?? ''
    const matches = [...wikitext.matchAll(/\{\{Lautschrift\|([^|}]+)\}\}/g)]
    if (!matches.length) return res.json([])
    res.json([{ ipa: matches[0][1], status: 'proved' }])
  } catch (err) { serverError(res, err) }
})

/** GET /api/bonus – Bonusfrage für ein Lemma (beim Admin-Eintrag vorberechnet) */
router.get('/api/v1/bonus', validate(bonusQuerySchema, 'query'), (req, res) => {
  const { id } = req.query
  try {
    const { byId } = getLemmataIndex()
    const l = byId.get(id)
    res.json(l?.bonusFrage ?? null)
  } catch {
    res.json(null)
  }
})

export default router
