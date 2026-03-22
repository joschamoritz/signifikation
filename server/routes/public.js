import express        from 'express'
import { readFileSync } from 'fs'
import { join }         from 'path'
import { fetchBonusQuestion } from '../dwds.js'
import { load, save, loadZeitreise, loadWortZwilling, loadStats, cacheGet, cacheSet, DATA } from '../store.js'
import { belegeLimiter, statsLimiter } from '../middleware/rateLimiter.js'
import { serverError } from '../middleware/auth.js'
import { validate, statsSchema, feedbackSchema, belegeQuerySchema, archivQuerySchema, qQuerySchema, bonusQuerySchema } from '../middleware/validate.js'
import logger from '../logger.js'

const router = express.Router()

function todayDatum() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  const [year, month, day] = d.split('-')
  return { mmdd: `${month}-${day}`, year: Number(year) }
}

/** GET /health */
router.get('/health', (_req, res) => {
  let lastEntry = null
  try {
    const kalender = load('kalender.json')
    const keys = Object.keys(kalender).sort()
    lastEntry = keys[keys.length - 1] || null
  } catch { /* ignorieren */ }
  res.json({
    status:   'ok',
    uptime:   Math.floor(process.uptime()),
    env:      process.env.NODE_ENV === 'production' ? 'production' : 'development',
    lastEntry,
    memMb:    Math.round(process.memoryUsage().rss / 1024 / 1024),
  })
})

/** GET /api/heute → die 3 Lemmata des Tages */
router.get('/api/v1/heute', (req, res) => {
  try {
    const today     = todayDatum()
    const datum     = req.query.datum || today.mmdd
    const year      = today.year
    const kalender  = load('kalender.json')
    const lemmataDB = load('lemmata.json')

    const ids = kalender[datum]
    if (!ids) return res.status(404).json({ error: `Kein Eintrag für ${datum}` })

    const lemmata = ids.map(id => lemmataDB.find(l => l.id === id)).filter(Boolean)
    res.json({ datum, year, lemmata })
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/zeitreise → Zeitreise-Eintrag des Tages */
router.get('/api/v1/zeitreise', (req, res) => {
  try {
    const datum     = req.query.datum || todayDatum().mmdd
    const zeitreise = loadZeitreise()
    const entry     = zeitreise[datum]
    if (!entry) return res.status(404).json({ error: `Kein Zeitreise-Eintrag für ${datum}` })
    res.json(entry)
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/wortzwilling → Wort-Zwilling-Eintrag des Tages (ohne Scores) */
router.get('/api/v1/wortzwilling', (req, res) => {
  try {
    const datum = req.query.datum || todayDatum().mmdd
    const wz    = loadWortZwilling()
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

/** GET /api/belege – Korpusbelege für ein Kollokationspaar */
router.get('/api/v1/belege', belegeLimiter, validate(belegeQuerySchema, 'query'), async (req, res) => {
  const { collocate, lemma, rel, corpus, year } = req.query

  const cacheKey = `${lemma}|${collocate}|${rel||''}|${corpus||''}|${year||''}`
  const cached = cacheGet(cacheKey)
  if (cached) return res.json(cached)

  const VALID_R_CORPORA = new Set(['kern', 'dta', 'dtae', 'dtak', 'ddr', 'politische_reden', 'bundestag', 'reichstag'])
  const corpusForR = corpus && VALID_R_CORPORA.has(corpus) ? corpus : null

  function corpusSuffix() {
    let s = ''
    if (corpusForR) s += `&corpus=${encodeURIComponent(corpusForR)}`
    if (year) {
      const y = parseInt(year)
      if (!isNaN(y)) s += `&date=${y - 15}:${y + 15}`
    }
    return s
  }

  async function tryQuery(q, extra = '') {
    const url = `https://www.dwds.de/r/?q=${encodeURIComponent(q)}&view=json&limit=10${extra}`
    const r = await fetch(url)
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data) ? data.filter(item => Array.isArray(item.ctx_?.[1])) : []
  }

  function noWiki(items) {
    return items.filter(item => !(item.bibl_string || '').toLowerCase().includes('wikipedia'))
  }

  async function runQueries(queries, extra, filterWiki = true) {
    let best = []
    for (const q of queries) {
      const r        = await tryQuery(q, extra)
      const filtered = filterWiki ? noWiki(r) : r
      if (filtered.length >= 2) return filtered
      if (filtered.length > best.length) best = filtered
    }
    return best
  }

  function parseItem(item) {
    const raw = item.ctx_[1]
    const tokens = raw.map(t => ({ w: t.w, ws: t.ws === '1', hl: t.hl_ === 1 }))
    return { tokens, quelle: item.bibl_string || '' }
  }

  try {
    const L = `@${lemma}`
    const C = `@${collocate}`

    let queries
    if (rel === 'OBJ') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
        `${C} #10 ${L}`,
        `${L} #10 ${C}`,
      ]
    } else if (rel === 'KON') {
      queries = [
        `"${collocate} und ${lemma}"`,
        `"${lemma} und ${collocate}"`,
        `"${collocate} oder ${lemma}"`,
        `"${lemma} oder ${collocate}"`,
        `${C} #15 ${L}`,
        `${L} #15 ${C}`,
        `${C} #30 ${L}`,
        `${L} #30 ${C}`,
      ]
    } else if (rel === '~ATTR') {
      queries = [
        `"${lemma}e ${collocate}"`,
        `"${lemma}en ${collocate}"`,
        `"${lemma}er ${collocate}"`,
        `"${lemma} ${collocate}"`,
        `${C} #5 ${L}`,
        `${L} #5 ${C}`,
      ]
    } else if (rel === '~OBJ') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
        `${C} #10 ${L}`,
        `${L} #10 ${C}`,
      ]
    } else if (rel === '~ADV') {
      queries = [
        `"${lemma} ${collocate}"`,
        `"${collocate} ${lemma}"`,
        `${C} #5 ${L}`,
        `${L} #5 ${C}`,
      ]
    } else if (rel === 'ADV') {
      queries = [
        `"${collocate} ${lemma}"`,
        `"${lemma} ${collocate}"`,
        `${C} #5 ${L}`,
        `${L} #5 ${C}`,
      ]
    } else {
      queries = [
        `"${collocate} ${lemma}"`,
        `"${lemma} ${collocate}"`,
        `${C} #10 ${L}`,
        `${L} #10 ${C}`,
        `${collocate} #10 ${lemma}`,
        `${lemma} #10 ${collocate}`,
        `${C} #20 ${L}`,
        `${L} #20 ${C}`,
        `${collocate} #20 ${lemma}`,
        `${lemma} #20 ${collocate}`,
      ]
    }

    const y          = year ? parseInt(year) : null
    const extra      = corpusSuffix()
    const corpusOnly = corpusForR ? `&corpus=${encodeURIComponent(corpusForR)}` : ''
    const dateOnly   = y ? `&date=${y - 15}:${y + 15}` : ''
    const dateWide   = y ? `&date=${y - 40}:${y + 40}` : ''
    let results = []

    if (corpus) {
      results = await runQueries(queries, extra)
      if (!results.length && corpusForR)
        results = await runQueries(queries, corpusOnly)
      if (!results.length && y)
        results = await runQueries(queries, dateOnly)
      if (!results.length && y)
        results = await runQueries(queries, dateWide)
    } else {
      results = await runQueries(queries, '&corpus=kern')
      if (results.length < 2) {
        const r21 = await runQueries(queries, '&corpus=kern21')
        if (r21.length > results.length) results = r21
      }
      if (!results.length) {
        results = await runQueries(queries, '&corpus=dtak')
        if (!results.length) results = await runQueries(queries, '&corpus=dtae')
      }
      if (!results.length) {
        results = await runQueries(queries, '&corpus=dwdsxl')
      }
      if (!results.length) {
        results = await runQueries(queries, '&corpus=dwdsxl', false)
      }
    }
    const final = results.slice(0, 5).map(parseItem)
    cacheSet(cacheKey, final)
    res.json(final)
  } catch (err) {
    logger.error({ err }, 'Belege-Fehler')
    serverError(res, err)
  }
})

/** POST /api/stats – anonyme Spielstatistik erfassen */
router.post('/api/v1/stats', statsLimiter, validate(statsSchema), (req, res) => {
  const { game, datum, score, max } = req.body
  try {
    const stats = loadStats()
    if (!stats[datum]) stats[datum] = {}
    if (!stats[datum][game]) stats[datum][game] = { plays: 0, scoreSum: 0, maxSum: 0, dist: Array(11).fill(0) }
    const entry = stats[datum][game]
    entry.plays++
    entry.scoreSum += Math.max(0, score)
    entry.maxSum   += max
    const normalized = Math.min(10, Math.round(score / max * 10))
    entry.dist[normalized]++
    save('stats.json', stats)
    res.json({ ok: true })
  } catch (err) { serverError(res, err) }
})

/** POST /api/feedback – Nutzerfeedback speichern */
router.post('/api/v1/feedback', validate(feedbackSchema), (req, res) => {
  const { game, emoji, text } = req.body
  const entry = { game, emoji, text, ts: new Date().toISOString() }
  try {
    const file = join(DATA, 'feedback.json')
    let list = []
    try { list = JSON.parse(readFileSync(file, 'utf8')) } catch {}
    list.unshift(entry)
    save('feedback.json', list)
    res.json({ ok: true })
  } catch (err) { serverError(res, err) }
})

/** GET /api/archiv?date=YYYY-MM-DD – Tageseintrag für vergangene Tage */
router.get('/api/v1/archiv', validate(archivQuerySchema, 'query'), async (req, res) => {
  const { date } = req.query
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const req_d = new Date(date); req_d.setHours(0, 0, 0, 0)
  if (req_d > today) return res.status(403).json({ error: 'Zukünftige Einträge nicht verfügbar' })
  try {
    const mm   = date.slice(5, 7), dd = date.slice(8, 10)
    const file = join(DATA, `koll-${mm}-${dd}.json`)
    const raw  = JSON.parse(readFileSync(file, 'utf8'))
    const lemmata = raw.lemmata || []
    res.json({ datum: `${mm}-${dd}`, year: date.slice(0, 4), lemmata })
  } catch {
    res.json({ datum: date.slice(5), lemmata: [] })
  }
})

/** GET /api/ipa – IPA-Aussprache via DWDS-API */
router.get('/api/v1/ipa', validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  try {
    const r = await fetch(`https://www.dwds.de/api/ipa?q=${encodeURIComponent(q)}`)
    if (!r.ok) return res.json([])
    res.json(await r.json())
  } catch (err) { serverError(res, err) }
})

/** GET /api/bonus – Bonusfrage für ein Lemma */
router.get('/api/v1/bonus', validate(bonusQuerySchema, 'query'), async (req, res) => {
  const { id } = req.query
  try {
    const lemmataDB = load('lemmata.json')
    const l = lemmataDB.find(l => l.id === id)
    if (!l) return res.json(null)
    const bonus = await fetchBonusQuestion(l.lemma, l.pos || 'Substantiv')
    res.json(bonus)
  } catch {
    res.json(null)
  }
})

export default router
