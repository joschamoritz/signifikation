import express         from 'express'
import helmet          from 'helmet'
import cors            from 'cors'
import rateLimit       from 'express-rate-limit'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchBonusQuestion, fetchRelation, POS_ROUNDS } from './dwds.js'
import { fetchZeitreise, debugDiaCollo, clearCorporaCache } from './diacollo.js'
import { fetchWortZwilling } from './wortzwilling.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA      = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

const IS_PROD   = process.env.NODE_ENV === 'production'
const ADMIN_KEY = (process.env.ADMIN_KEY || (IS_PROD ? null : 'dev-only'))?.trim()
const PORT      = process.env.PORT || 3001
if (!ADMIN_KEY) {
  console.error('❌ ADMIN_KEY ist nicht gesetzt – in Produktion erforderlich. Server wird beendet.')
  process.exit(1)
}
if (!process.env.ADMIN_KEY) console.warn('⚠️  ADMIN_KEY nicht gesetzt – Dev-Fallback aktiv (nur lokal!)')

const app = express()

// ── Security Headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:"],
      connectSrc:  ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ── CORS ─────────────────────────────────────────────────────
// In Produktion nur eigene Domain erlauben; lokal offen für Vite-Dev-Server
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3001']

// Capacitor-WebView sendet immer capacitor://localhost als Origin
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'http://localhost']

app.use(cors({
  origin: IS_PROD
    ? (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || CAPACITOR_ORIGINS.includes(origin)) cb(null, true)
        else cb(new Error(`CORS: Unerlaubte Origin ${origin}`))
      }
    : true,   // lokal: alles erlauben
  credentials: false,
}))

app.use(express.json())

// ── Rate Limiting ────────────────────────────────────────────
const belegeLimiter = rateLimit({
  windowMs: 60_000,           // 1 Minute
  max: 30,                    // max 30 Belege-Requests pro IP pro Minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen, bitte kurz warten.' },
})

const adminLimiter = rateLimit({
  windowMs: 60_000,           // 1 Minute
  max: 60,                    // max 60 Admin-Requests pro IP pro Minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Admin-Anfragen, bitte kurz warten.' },
})

// ── Server-seitiger Beleg-Cache (TTL 6h, max 200 Einträge) ──
const _belegeCache = new Map()
const BELEG_TTL_MS  = 6 * 60 * 60 * 1000
const BELEG_MAX     = 200
function cacheGet(key) {
  const entry = _belegeCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > BELEG_TTL_MS) { _belegeCache.delete(key); return null }
  return entry.data
}
function cacheSet(key, data) {
  // LRU: ältesten Eintrag entfernen wenn Limit erreicht
  if (_belegeCache.size >= BELEG_MAX) {
    _belegeCache.delete(_belegeCache.keys().next().value)
  }
  _belegeCache.set(key, { data, ts: Date.now() })
}

// ── Helpers ─────────────────────────────────────────────────
const fileCache = {}
function load(file) {
  if (!fileCache[file]) fileCache[file] = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
  return fileCache[file]
}
function save(file, data) {
  // Atomar: erst in temporäre Datei schreiben, dann umbenennen.
  // Verhindert korrupte JSON-Dateien bei Serverabsturz mitten im Schreiben.
  const target = join(DATA, file)
  const tmp    = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, target)
  fileCache[file] = data
}
function loadZeitreise()    { try { return load('zeitreise.json')    } catch { return {} } }
function loadWortZwilling() { try { return load('wortzwilling.json') } catch { return {} } }

/** Fehlerausgabe: in Produktion keine internen Details preisgeben */
function serverError(res, err) {
  console.error('Server-Fehler:', err)
  res.status(500).json({ error: IS_PROD ? 'Interner Serverfehler' : err.message })
}

function requireAuth(req, res, next) {
  const key = req.headers['x-admin-key']
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Nicht autorisiert' })
  next()
}

function todayDatum() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())
  // d = "2026-03-16"
  const [year, month, day] = d.split('-')
  return { mmdd: `${month}-${day}`, year: Number(year) }
}

// ── Public API ───────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

/** GET /api/heute → die 3 Lemmata des Tages */
app.get('/api/heute', (req, res) => {
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
app.get('/api/zeitreise', (req, res) => {
  try {
    const datum    = req.query.datum || todayDatum().mmdd
    const zeitreise = loadZeitreise()
    const entry    = zeitreise[datum]
    if (!entry) return res.status(404).json({ error: `Kein Zeitreise-Eintrag für ${datum}` })
    res.json(entry)
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/wortzwilling → Wort-Zwilling-Eintrag des Tages (ohne Scores) */
app.get('/api/wortzwilling', (req, res) => {
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
app.get('/api/belege', belegeLimiter, async (req, res) => {
  const { collocate, lemma, rel, corpus, year } = req.query
  if (!collocate || !lemma) return res.status(400).json({ error: 'collocate und lemma erforderlich' })

  // Server-seitiger Cache: gleiche Parameter → gleicher Key
  const cacheKey = `${lemma}|${collocate}|${rel||''}|${corpus||''}|${year||''}`
  const cached = cacheGet(cacheKey)
  if (cached) return res.json(cached)

  // Korpora die DWDS /r/ als Filter akzeptiert (DiaCollo-IDs ≠ /r/-IDs für manche)
  const VALID_R_CORPORA = new Set(['kern', 'dta', 'dtae', 'dtak', 'ddr', 'politische_reden', 'bundestag', 'reichstag'])
  const corpusForR = corpus && VALID_R_CORPORA.has(corpus) ? corpus : null

  // Build optional corpus + date suffix for DWDS search
  function corpusSuffix() {
    let s = ''
    if (corpusForR) s += `&corpus=${encodeURIComponent(corpusForR)}`
    if (year) {
      const y = parseInt(year)
      if (!isNaN(y)) s += `&date=${y - 15}:${y + 15}`  // ±15 Jahre um das Jahrzehnt
    }
    return s
  }

  async function tryQuery(q, extra = '') {
    const url = `https://www.dwds.de/r/?q=${encodeURIComponent(q)}&view=json&limit=10${extra}`
    const r = await fetch(url)
    if (!r.ok) return []  // ungültiger Korpus (z.B. 404 für reichstag) → leer statt Exception
    const data = await r.json()
    return Array.isArray(data) ? data.filter(item => Array.isArray(item.ctx_?.[1])) : []
  }

  function noWiki(items) {
    return items.filter(item => !(item.bibl_string || '').toLowerCase().includes('wikipedia'))
  }

  /** Durchläuft alle Queries, gibt beste Treffer zurück.
   *  filterWiki=true (default) schließt Wikipedia aus. */
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
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

    // @Wort = Lemmasuche (alle Flexionsformen), wichtig für flektierte Formen im Korpus
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
      // KON = Koordination: Flexionsformen über @ matchen, weites Fenster für Listenkoordination
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
      // Zeitreise: kein fester Relationstyp – sowohl @ (Lemmasuche) als auch Grundform
      queries = [
        `"${collocate} ${lemma}"`,              // exakt benachbart
        `"${lemma} ${collocate}"`,
        `${C} #10 ${L}`,                        // Lemmasuche ±10
        `${L} #10 ${C}`,
        `${collocate} #10 ${lemma}`,            // Grundform ±10 (Fallback falls @ nicht greift)
        `${lemma} #10 ${collocate}`,
        `${C} #20 ${L}`,                        // Lemmasuche ±20
        `${L} #20 ${C}`,
        `${collocate} #20 ${lemma}`,            // Grundform ±20
        `${lemma} #20 ${collocate}`,
      ]
    }

    const y = year ? parseInt(year) : null
    const extra      = corpusSuffix()
    const corpusOnly = corpusForR ? `&corpus=${encodeURIComponent(corpusForR)}` : ''
    const dateOnly   = y ? `&date=${y - 15}:${y + 15}` : ''
    const dateWide   = y ? `&date=${y - 40}:${y + 40}` : ''
    let results = []

    // Zeitreise: Korpus+Datum → Korpus-only → Datum-only → Datum-weit
    // Kein globaler Fallback: lieber leer als Belege aus falscher Zeit (z.B. 2025 statt 1850)
    if (corpus) {
      results = await runQueries(queries, extra)                              // Korpus + Datum (±15)
      if (!results.length && corpusForR)
        results = await runQueries(queries, corpusOnly)                       // Korpus ohne Datum
      if (!results.length && y)
        results = await runQueries(queries, dateOnly)                         // Datum-only ±15
      if (!results.length && y)
        results = await runQueries(queries, dateWide)                         // Datum-only ±40
    } else {
      // Kollokationen-Modus: Prioritätenfolge, kein Zeitfilter
      // Prio 1: kern (1900–1999) + kern21 (2000–2010) — hochwertig, kein Wikipedia
      results = await runQueries(queries, '&corpus=kern')
      if (results.length < 2) {
        const r21 = await runQueries(queries, '&corpus=kern21')
        if (r21.length > results.length) results = r21
      }
      // Prio 2: DTA Kernkorpus + DTA erweitert — historische Texte
      if (!results.length) {
        results = await runQueries(queries, '&corpus=dtak')
        if (!results.length) results = await runQueries(queries, '&corpus=dtae')
      }
      // Prio 3: dwdsxl ohne Wikipedia
      if (!results.length) {
        results = await runQueries(queries, '&corpus=dwdsxl')
      }
      // Prio 4: dwdsxl mit Wikipedia (letzter Ausweg)
      if (!results.length) {
        results = await runQueries(queries, '&corpus=dwdsxl', false)
      }
    }
    const final = results.slice(0, 5).map(parseItem)
    cacheSet(cacheKey, final)
    res.json(final)
  } catch (err) {
    console.error('Belege-Fehler:', err.message)
    serverError(res, err)
  }
})

/** POST /api/feedback – Nutzerfeedback speichern */
app.post('/api/feedback', (req, res) => {
  const { game, emoji, text } = req.body || {}
  if (!game || !emoji) return res.status(400).json({ error: 'game und emoji erforderlich' })
  const entry = { game, emoji, text: (text || '').slice(0, 500), ts: new Date().toISOString() }
  try {
    const file = join(DATA, 'feedback.json')
    let list = []
    try { list = JSON.parse(readFileSync(file, 'utf8')) } catch {}
    list.unshift(entry)
    writeFileSync(file, JSON.stringify(list, null, 2))
    res.json({ ok: true })
  } catch (err) { serverError(res, err) }
})

/** GET /admin/feedback – Feedbackliste */
app.get('/admin/feedback', adminLimiter, requireAuth, (req, res) => {
  try {
    const file = join(DATA, 'feedback.json')
    let list = []
    try { list = JSON.parse(readFileSync(file, 'utf8')) } catch {}
    res.json(list)
  } catch (err) { serverError(res, err) }
})

/** GET /api/ipa – IPA-Aussprache via DWDS-API */
app.get('/api/ipa', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'q erforderlich' })
  try {
    const r = await fetch(`https://www.dwds.de/api/ipa?q=${encodeURIComponent(q)}`)
    if (!r.ok) return res.json([])
    res.json(await r.json())
  } catch (err) { serverError(res, err) }
})

/** GET /api/bonus – Bonusfrage für ein Lemma */
app.get('/api/bonus', async (req, res) => {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id erforderlich' })
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

// ── Admin API ────────────────────────────────────────────────

/** GET /admin/diacollo-config – Korpus-Konfiguration laden */
app.get('/admin/diacollo-config', adminLimiter, requireAuth, (req, res) => {
  try {
    const cfg = JSON.parse(readFileSync(join(DATA, 'diacollo-config.json'), 'utf8'))
    res.json(cfg)
  } catch {
    res.status(404).json({ error: 'Keine Konfiguration gefunden' })
  }
})

/** POST /admin/diacollo-config – Korpus-Konfiguration speichern */
app.post('/admin/diacollo-config', adminLimiter, requireAuth, (req, res) => {
  const { corpora } = req.body
  if (!Array.isArray(corpora)) return res.status(400).json({ error: 'corpora-Array erforderlich' })
  try {
    const cfg = JSON.parse(readFileSync(join(DATA, 'diacollo-config.json'), 'utf8'))
    // Nur enabled-Flag übernehmen, Rest (label, zeitraum, slice) bleibt erhalten
    for (const item of corpora) {
      const entry = cfg.corpora.find(c => c.id === item.id)
      if (entry) entry.enabled = !!item.enabled
    }
    writeFileSync(join(DATA, 'diacollo-config.json'), JSON.stringify(cfg, null, 2))
    clearCorporaCache()
    res.json({ ok: true, active: cfg.corpora.filter(c => c.enabled).map(c => c.id) })
  } catch (err) {
    serverError(res, err)
  }
})


/** GET /admin/debug-diacollo?q=Wort – roher DiaCollo-Test */
app.get('/admin/debug-diacollo', adminLimiter, requireAuth, async (req, res) => {
  const q = req.query.q
  if (!q) return res.status(400).json({ error: 'q= erforderlich' })
  try {
    const result = await debugDiaCollo(q)
    res.json({ q, ...result })
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /admin/analyze-kollokation?q=Wort&pos=Substantiv – Kollokationswort analysieren */
app.get('/admin/analyze-kollokation', adminLimiter, requireAuth, async (req, res) => {
  const { q: lemma, pos = 'Substantiv' } = req.query
  if (!lemma) return res.status(400).json({ error: 'q= erforderlich' })
  const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  try {
    const [roundResults, bonusQ] = await Promise.all([
      Promise.allSettled(rounds.map(r => fetchRelation(lemma, pos, r.relCode))),
      fetchBonusQuestion(lemma, pos).catch(() => null),
    ])
    const runden = rounds.map((round, i) => {
      const r = roundResults[i]
      if (r.status === 'rejected') return { ...round, items: [], count: 0, usable: false, error: r.reason.message }
      const items = r.value.filter(it => !it.lemma.includes(' ') && it.lemma.length > 1)
      return {
        ...round,
        items:  items.slice(0, 10).map(it => ({ wort: it.lemma, logDice: parseFloat(parseFloat(it.logDice).toFixed(2)) })),
        count:  items.length,
        usable: items.length >= 5,
      }
    })
    const allItems = runden.flatMap(r => r.items)
    const seen = new Set()
    const top3 = allItems
      .sort((a, b) => b.logDice - a.logDice)
      .filter(it => { if (seen.has(it.wort)) return false; seen.add(it.wort); return true })
      .slice(0, 3)
    const usable = runden.every(r => r.usable)
    res.json({ lemma, pos, runden, top3, bonus: bonusQ, usable })
  } catch (err) { serverError(res, err) }
})

/** GET /admin/analyze-wortzwilling?a=WortA&b=WortB&pos=Substantiv – Wortpaar analysieren */
app.get('/admin/analyze-wortzwilling', adminLimiter, requireAuth, async (req, res) => {
  const { a: wortA, b: wortB, pos = 'Substantiv' } = req.query
  if (!wortA || !wortB) return res.status(400).json({ error: 'a= und b= erforderlich' })
  try {
    const result = await fetchWortZwilling(wortA.trim(), wortB.trim(), pos)
    if (!result) return res.json({ usable: false, wortA, wortB, reason: 'Nicht genug distinkte Kollokatoren (mind. 5 pro Seite nötig)' })
    res.json({ ...result, usable: true })
  } catch (err) { serverError(res, err) }
})

/** POST /admin/tag – Tageseintrag anlegen/überschreiben */
app.post('/admin/tag', adminLimiter, requireAuth, async (req, res) => {
  const { datum, woerter, notizen = [], links = [], positionen = [], zeitreise_lemma = '',
          zwilling_paar = null, zwilling_pos = 'Substantiv' } = req.body
  if (!datum || !Array.isArray(woerter) || woerter.length !== 3) {
    return res.status(400).json({ error: 'datum (MM-DD) und woerter (3 Einträge) erforderlich' })
  }

  try {
    const lemmataDB = load('lemmata.json')
    const kalender  = load('kalender.json')
    const ids       = []

    for (const [i, wort] of woerter.entries()) {
      const pos = (positionen?.[i] || 'Substantiv')
      console.log(`  Lade DWDS-Daten für „${wort}" (${pos}) …`)
      const entry   = await fetchLemma(wort, pos)
      entry.notiz   = notizen[i] || ''
      entry.link    = links[i]   || ''
      const idx     = lemmataDB.findIndex(l => l.id === entry.id)
      if (idx >= 0) lemmataDB[idx] = entry
      else lemmataDB.push(entry)
      ids.push(entry.id)
    }

    kalender[datum] = ids
    save('lemmata.json', lemmataDB)
    save('kalender.json', kalender)

    // Zeitreise optional
    let zeitreiseOk = null
    if (zeitreise_lemma.trim()) {
      console.log(`  Lade DiaCollo-Daten für „${zeitreise_lemma}" …`)
      try {
        const zr = await fetchZeitreise(zeitreise_lemma.trim())
        const zeitreise = loadZeitreise()
        if (zr) {
          zeitreise[datum] = zr
          save('zeitreise.json', zeitreise)
          zeitreiseOk = true
          console.log(`  Zeitreise gespeichert: ${zr.paare.map(p => `${p.jahrzehnt}:${p.kollokat}`).join(', ')}`)
        } else {
          zeitreiseOk = false
          console.warn(`  Zeitreise: nicht genügend DiaCollo-Daten für „${zeitreise_lemma}"`)
        }
      } catch (err) {
        zeitreiseOk = false
        console.error(`  Zeitreise-Fehler: ${err.message}`)
      }
    }

    // Wort-Zwilling optional
    let zwillingOk = null
    if (Array.isArray(zwilling_paar) && zwilling_paar.length === 2 && zwilling_paar[0] && zwilling_paar[1]) {
      console.log(`  Lade Wort-Zwilling-Daten für „${zwilling_paar[0]}" / „${zwilling_paar[1]}" …`)
      try {
        const wz = await fetchWortZwilling(zwilling_paar[0].trim(), zwilling_paar[1].trim(), zwilling_pos)
        const wortzwilling = loadWortZwilling()
        if (wz) {
          wortzwilling[datum] = wz
          save('wortzwilling.json', wortzwilling)
          zwillingOk = true
        } else {
          zwillingOk = false
          console.warn(`  Wort-Zwilling: nicht genug distinkte Kollokatoren für „${zwilling_paar.join(' / ')}"`)
        }
      } catch (err) {
        zwillingOk = false
        console.error(`  Wort-Zwilling-Fehler: ${err.message}`)
      }
    }

    console.log(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)
    res.json({ ok: true, datum, ids, zeitreiseOk, zwillingOk })
  } catch (err) {
    console.error(err)
    serverError(res, err)
  }
})

/** GET /admin/kalender – alle Einträge (inkl. Zeitreise- und Wort-Zwilling-Status) */
app.get('/admin/kalender', adminLimiter, requireAuth, (req, res) => {
  const kalender     = load('kalender.json')
  const lemmataDB    = load('lemmata.json')
  const zeitreise    = loadZeitreise()
  const wortzwilling = loadWortZwilling()
  const result = {}
  for (const [datum, ids] of Object.entries(kalender)) {
    result[datum] = {
      lemmata:      ids.map(id => {
        const l = lemmataDB.find(l => l.id === id)
        return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
      }),
      hasZeitreise:    !!zeitreise[datum],
      hasWortZwilling: !!wortzwilling[datum],
    }
  }
  res.json(result)
})

/** GET /admin/tag/:datum – Eintrag zum Bearbeiten laden */
app.get('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
  if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
  const kalender  = load('kalender.json')
  const lemmataDB = load('lemmata.json')
  const zeitreise = loadZeitreise()
  const ids = kalender[req.params.datum]
  if (!ids) return res.status(404).json({ error: 'Kein Eintrag' })
  const lemmata = ids.map(id => lemmataDB.find(l => l.id === id)).filter(Boolean)
  const wz = loadWortZwilling()[req.params.datum]
  res.json({
    datum:           req.params.datum,
    woerter:         lemmata.map(l => l.lemma),
    positionen:      lemmata.map(l => l.pos || 'Substantiv'),
    notizen:         lemmata.map(l => l.notiz || ''),
    links:           lemmata.map(l => l.link  || ''),
    zeitreise_lemma: zeitreise[req.params.datum]?.lemma || '',
    zwilling_paar:   wz ? [wz.wortA, wz.wortB] : [],
    zwilling_pos:    wz?.pos || 'Substantiv',
  })
})

/** DELETE /admin/tag/:datum – Eintrag löschen */
app.delete('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
  if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
  const kalender     = load('kalender.json')
  const zeitreise    = loadZeitreise()
  const wortzwilling = loadWortZwilling()
  delete kalender[req.params.datum]
  delete zeitreise[req.params.datum]
  delete wortzwilling[req.params.datum]
  save('kalender.json', kalender)
  save('zeitreise.json', zeitreise)
  save('wortzwilling.json', wortzwilling)
  res.json({ ok: true })
})

/** GET /admin – Admin-Oberfläche (öffentlich – Login erfolgt clientseitig) */
app.get('/admin', (req, res) => {
  // Eigene CSP für admin.html: 'unsafe-inline' für Skripte nötig (inline onclick-Handler)
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  )
  res.sendFile(join(__dirname, 'admin.html'))
})

// ── Statisches Frontend (Produktions-Build) ──────────────────
import { existsSync } from 'fs'
const DIST = join(__dirname, '../dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.use((req, res) => res.sendFile(join(DIST, 'index.html')))
}

// ── Globaler Fehler-Handler ───────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unbehandelter Fehler:', err)
  res.status(500).json({ error: IS_PROD ? 'Interner Serverfehler' : (err.message || 'Interner Serverfehler') })
})

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Signifikation-Server läuft auf http://localhost:${PORT}`)
  console.log(`Admin: http://localhost:${PORT}/admin`)
})
