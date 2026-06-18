import express        from 'express'
import { join, normalize, sep } from 'path'
import { readFileSync } from 'fs'
import { fetchBelege, belegeVerfuegbar } from '../belege.js'
import { fetchWiktionary } from '../wiktionary.js'
import { fetchLemma, fetchBonusQuestion, fetchZeitenwende } from '../wortprofil.js'
import { loadKalenderEntry, loadWortZwillingEntry, loadZeitenwendeEntry, loadSpezialwoche, recordStat, getPercentile, getLemmataIndex, cacheGet, cacheSet, DATA } from '../store.js'
import { belegeLimiter, statsLimiter, debugLogLimiter } from '../middleware/rateLimiter.js'
import { z } from 'zod/v3'
import { auth } from '../auth/index.js'
import { serverError } from '../middleware/auth.js'
import { validate, statsSchema, percentileQuerySchema, belegeQuerySchema, archivQuerySchema, qQuerySchema, bonusQuerySchema, datumQuerySchema, spezialwocheDatumQuerySchema } from '../middleware/validate.js'
import logger from '../logger.js'
import { fromNodeHeaders } from 'better-auth/node'
import db from '../db.js'

const router = express.Router()

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'

function todayDatum() {
  // Gibt das heutige Datum als YYYY-MM-DD zurück (Berliner Zeit)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

/**
 * GET /health – Readiness-Check.
 * Prüft DB-Erreichbarkeit und Belege-Verfügbarkeit.
 * HTTP 503 bei kritischen Fehlern, sonst 200 (auch bei degraded).
 */
router.get('/health', (_req, res) => {
  const checks = {}
  let status = 'ok'

  // DB-Erreichbarkeit: leichter Read-Check statt BEGIN IMMEDIATE — der frühere
  // Write-Lock pro Probe erzeugte unnötige Contention mit echten Writes.
  try {
    db.prepare('SELECT 1').get()
    checks.db = 'ok'
  } catch (err) {
    checks.db = `error: ${err.message}`
    status = 'error'
  }

  // Sprachdatenbank Belege
  checks.belege = belegeVerfuegbar() ? 'ok' : 'unavailable'
  if (checks.belege !== 'ok' && status === 'ok') status = 'degraded'

  res.status(status === 'error' ? 503 : 200).json({ status, checks })
})

/** GET /api/heute → die 3 Lemmata des Tages */
router.get('/api/v1/heute', validate(datumQuerySchema, 'query'), (req, res) => {
  try {
    const datum = req.query.datum || todayDatum()
    const { byId, byLemma } = getLemmataIndex()

    const entry = loadKalenderEntry(datum)
    if (!entry) return res.status(404).json({ error: `Kein Eintrag für ${datum}` })

    const ids              = Array.isArray(entry) ? entry : (entry.ids ?? [])
    const thema            = Array.isArray(entry) ? '' : (entry.thema ?? '')
    const thema_kurz       = Array.isArray(entry) ? '' : (entry.thema_kurz ?? '')
    const thema_quelle     = Array.isArray(entry) ? '' : (entry.thema_quelle ?? '')
    const lueckenfueller_id = Array.isArray(entry) ? '' : (entry.lueckenfueller_id ?? '')
    const lemmata          = ids.map(id => byId.get(id)).filter(Boolean)
    const lueckenfuellerLemma = lueckenfueller_id
      ? (byId.get(lueckenfueller_id) ?? byLemma.get(lueckenfueller_id) ?? null)
      : null
    res.json({ datum, lemmata, thema, thema_kurz, thema_quelle, lueckenfuellerLemma })
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/wortzwilling → Wort-Zwilling-Eintrag des Tages (ohne Scores) */
router.get('/api/v1/wortzwilling', validate(datumQuerySchema, 'query'), (req, res) => {
  try {
    const datum = req.query.datum || todayDatum()
    const entry = loadWortZwillingEntry(datum)
    if (!entry) return res.status(404).json({ error: `Kein Wort-Zwilling-Eintrag für ${datum}` })
    // Scores nicht ans Frontend senden (spielrelevante Antworten sind zuordnung-Felder)
    const safe = {
      ...entry,
      kollokatoren: entry.kollokatoren.map(({ wort, zuordnung }) => ({ wort, zuordnung })),
      notiz: entry.notiz ?? '',
      link:  entry.link  ?? '',
    }
    res.json(safe)
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /api/zeitenwende → Zeitenwende-Eintrag des Tages (inkl. IPA + Definitionen) */
router.get('/api/v1/zeitenwende', validate(datumQuerySchema, 'query'), async (req, res) => {
  try {
    const datum = req.query.datum || todayDatum()
    const entry = loadZeitenwendeEntry(datum)
    if (!entry) return res.status(404).json({ error: `Kein Zeitenwende-Eintrag für ${datum}` })

    const cacheKey = `wikt:${entry.lemma}`
    let wikt = cacheGet(cacheKey)
    if (!wikt) {
      wikt = await fetchWiktionary(entry.lemma)
      cacheSet(cacheKey, wikt)
    }

    res.json({ ...entry, ipa: wikt.ipa || '', definitionen: wikt.definitionen || [], notiz: entry.notiz ?? '', link: entry.link ?? '' })
  } catch (err) {
    logger.error({ err }, 'Zeitenwende-Abruf fehlgeschlagen')
    serverError(res, err)
  }
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
    // 502 statt leerem 200: Clients und Monitoring muessen einen Defekt
    // der Beleg-DB von "keine Belege vorhanden" unterscheiden koennen.
    // Frontend-Fallback: useBelege zeigt "derzeit nicht verfuegbar".
    logger.error({ err }, 'Belege-Fehler')
    res.status(502).json({ error: 'Belege derzeit nicht verfügbar', code: 'BELEGE_UNAVAILABLE' })
  }
})

/** GET /api/v1/stats – nicht unterstützt (nur POST) */
router.get('/api/v1/stats', (_req, res) => res.status(405).json({ error: 'Method Not Allowed' }))

/** GET /api/v1/percentile – Community-Percentile für einen Spielmodus */
router.get('/api/v1/percentile', statsLimiter, validate(percentileQuerySchema, 'query'), (req, res) => {
  const { datum, game, score, max } = req.query
  const result = getPercentile(datum, game, score, max)
  if (!result) return res.json({ available: false })
  res.json({ available: true, percentile: result.percentile, plays: result.plays })
})


/** POST /api/stats – Spielstatistik erfassen (mit Session optional user-gebunden) */
router.post('/api/v1/stats', statsLimiter, validate(statsSchema), async (req, res) => {
  const { game, datum, score, max } = req.body
  let userId = ''

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (session?.user?.id) userId = String(session.user.id)
  } catch (err) {
    logger.debug({ err }, 'Stats: Session konnte nicht aufgeloest werden, speichere anonym')
  }

  try {
    recordStat({ datum, spiel: game, userId, score, max })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, game, datum }, 'Stats-Speicherung fehlgeschlagen')
    serverError(res, err)
  }
})


/** GET /api/archiv?date=YYYY-MM-DD – Tageseintrag für vergangene Tage */
router.get('/api/v1/archiv', validate(archivQuerySchema, 'query'), (req, res) => {
  const { date } = req.query
  const todayBerlin = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
  if (date > todayBerlin) return res.status(403).json({ error: 'Zukünftige Einträge nicht verfügbar' })
  try {
    const mm   = date.slice(5, 7), dd = date.slice(8, 10)

    // Archiv-Dateien (koll-MM-DD.json) sind statische, datierte Inhalte und
    // ändern sich zur Laufzeit nicht. Statt pro Request synchron von Disk zu
    // lesen, das Ergebnis im Beleg-Cache halten (Key nur MM-DD, das Jahr steckt
    // nur im Response). Cache-Miss = null; ein leeres Array (Tag ohne Inhalt)
    // wird also ebenfalls gecacht und vermeidet wiederholte Disk-Misses.
    const cacheKey = `archiv:${mm}-${dd}`
    let lemmata = cacheGet(cacheKey)
    if (lemmata === null) {
      const file = join(DATA, `koll-${mm}-${dd}.json`)

      // Path-Traversal-Schutz: normalisierter Pfad muss innerhalb DATA bleiben.
      // Separator-Check verhindert Matches wie /data-extra/... gegen /data/...
      const normalized = normalize(file)
      const normalizedData = normalize(DATA) + sep
      if (!normalized.startsWith(normalizedData)) {
        logger.warn({ path: file }, 'Path-Traversal-Versuch blockiert')
        return res.status(400).json({ error: 'Ungültiges Datum', code: 'VALIDATION_ERROR' })
      }

      try {
        const raw = JSON.parse(readFileSync(file, 'utf8'))
        lemmata = raw.lemmata || []
      } catch (err) {
        // Fehlende Datei = Tag ohne Archiv-Inhalt → leeres 200 ist korrekt.
        // Alles andere (I/O, kaputtes JSON) ist ein echter Serverfehler.
        if (err?.code !== 'ENOENT') throw err
        lemmata = []
      }
      cacheSet(cacheKey, lemmata)
    }

    res.json({ datum: `${mm}-${dd}`, year: date.slice(0, 4), lemmata })
  } catch (err) {
    logger.error({ err, date }, 'Archiv-Abruf fehlgeschlagen')
    res.status(500).json({ error: 'Archiv derzeit nicht verfügbar', code: 'INTERNAL_ERROR' })
  }
})

/** GET /api/v1/wiktionary – IPA + Definitionen via Wiktionary */
router.get('/api/v1/wiktionary', belegeLimiter, validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  try {
    const cacheKey = `wikt:${q}`
    let result = cacheGet(cacheKey)
    if (!result) {
      result = await fetchWiktionary(q)
      cacheSet(cacheKey, result)
    }
    res.json(result)
  } catch (err) { serverError(res, err) }
})

/** GET /api/ipa – IPA-Aussprache via Wiktionary (gecacht wie /wiktionary) */
router.get('/api/v1/ipa', belegeLimiter, validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  const cacheKey = `ipa:${q}`
  const cached = cacheGet(cacheKey)
  if (cached) return res.json(cached)
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
    const result = matches.length ? [{ ipa: matches[0][1], status: 'proved' }] : []
    cacheSet(cacheKey, result)
    res.json(result)
  } catch (err) {
    // Wiktionary down/Timeout: leeres Ergebnis statt 500 — IPA ist
    // Schmuck, kein Pflichtbestandteil (Graceful Degradation).
    logger.warn({ err, q }, 'IPA-Abruf fehlgeschlagen')
    res.json([])
  }
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

/**
 * GET /api/v1/spezialwoche
 *
 * Gibt die aktuelle Spezialwoche zurück (falls vorhanden), oder null.
 * Enthält das aufgelöste Lemma-Objekt (Kollokationen), Wort-Zwilling-Daten,
 * Zeitenwende-Metadaten und optional das Lückenfüller-Lemma.
 */
router.get('/api/v1/spezialwoche', belegeLimiter, validate(spezialwocheDatumQuerySchema, 'query'), async (req, res) => {
  try {
    const datum = req.query.datum || todayDatum()
    const entry = loadSpezialwoche(datum)
    if (!entry) return res.json(null)

    const lemmaId = entry.lemma_id?.toLowerCase() ?? ''
    if (!lemmaId) return res.json(null)

    // Lemma-Objekt direkt aus wortprofil.db bauen (wie reguläre Tageseinträge),
    // damit auch Lemmata funktionieren die noch nie im Kalender standen.
    const [lemma, bonusFrage] = await Promise.all([
      fetchLemma(lemmaId, 'Substantiv'),
      fetchBonusQuestion(lemmaId, 'Substantiv').catch(() => null),
    ])
    if (!lemma) return res.json(null)
    // Lemma für Anzeige großschreiben (wortprofil.db speichert lowercase)
    lemma.lemma = lemma.lemma.charAt(0).toUpperCase() + lemma.lemma.slice(1)
    lemma.bonusFrage = bonusFrage
    lemma.notiz = entry.notiz || ''
    lemma.link  = entry.link  || ''

    // IPA + Definitionen via Wiktionary (Substantive groß, mit Cache)
    const wiktKey = `wikt:${lemmaId}`
    let wikt = cacheGet(wiktKey)
    if (!wikt) {
      const wiktLemma = lemmaId.charAt(0).toUpperCase() + lemmaId.slice(1)
      wikt = await fetchWiktionary(wiktLemma).catch(() => ({}))
      if (wikt) cacheSet(wiktKey, wikt)
    }
    lemma.ipa          = wikt?.ipa          || ''
    lemma.definitionen = wikt?.definitionen || []

    // Wort-Zwilling: nur ausgeben wenn Partner eingetragen
    let wortzwilling = null
    if (entry.zwilling_partner) {
      wortzwilling = {
        wortA:        lemma.lemma,
        wortB:        entry.zwilling_partner,
        pos:          entry.zwilling_pos,
        kollokatoren: entry.zwilling_kollokatoren.map(({ wort, zuordnung }) => ({ wort, zuordnung })),
        notiz:        '',
        link:         '',
      }
    }

    // Zeitenwende: Wort-Daten (words) aus wortprofil.db generieren
    const zwData = await fetchZeitenwende(lemmaId).catch(() => null)
    const zeitenwende = {
      lemma:  lemma.lemma,
      words:  zwData?.words ?? [],
      ipa:    lemma.ipa          || '',
      definitionen: lemma.definitionen || [],
      notiz:  entry.zeitenwende_notiz ?? '',
      link:   entry.zeitenwende_link  ?? '',
    }

    // Lückenfüller: nur wenn lueckenfueller_id gesetzt
    let lueckenfuellerLemma = null
    if (entry.lueckenfueller_id) {
      const { byId, byLemma } = getLemmataIndex()
      const lfKey = entry.lueckenfueller_id.toLowerCase()
      const lfLemma = byLemma.get(lfKey) ?? byLemma.get(entry.lueckenfueller_id) ?? byId.get(entry.lueckenfueller_id) ?? null
      if (lfLemma?.lueckenfueller) lueckenfuellerLemma = lfLemma
    }

    res.json({
      woche:             entry.woche,
      von:               entry.von,
      bis:               entry.bis,
      lemma,
      wortzwilling,
      zeitenwende,
      lueckenfuellerLemma,
      notiz:             entry.notiz,
      link:              entry.link,
    })
  } catch (err) {
    logger.error({ err }, 'Spezialwoche-Abruf fehlgeschlagen')
    serverError(res, err)
  }
})

// ── Debug-Log-Endpoint (Remote-Logging für TestFlight) ───────────────────────
// Temporär: Die TestFlight-App startet aktuell nicht und wir haben ohne Safari
// Web Inspector keinen Zugriff auf die Console. Dieser Endpoint empfängt
// Bootstrap-Errors und Plugin-Warnings.
//
// Logs landen in zwei Senken:
//   1. pino-Stream (Server-Log via PM2) – für SSH-Zugang
//   2. In-Memory-Ring-Buffer (debugLogBuffer) – ausgelesen über
//      GET /admin/debug-logs durch eingeloggten Admin, kein SSH nötig.
//
// Sicherheit: Rate-limited (60/min/IP), keine Auth zum Posten, aber harte
// Längenlimits. Auslesen erfordert Admin-Session.
const DEBUG_LOG_BUFFER_SIZE = 200
const debugLogBuffer = []

const debugLogSchema = z.object({
  level:   z.enum(['log', 'info', 'warn', 'error']),
  source:  z.string().max(200),
  message: z.string().max(2000),
  stack:   z.string().max(4000).optional(),
  url:     z.string().max(500).optional(),
  ua:      z.string().max(300).optional(),
  ts:      z.number().int().optional(),
})

router.post('/api/v1/debug/log', debugLogLimiter, validate(debugLogSchema), (req, res) => {
  const { level, source, message, stack, url, ua, ts } = req.body
  const entry = {
    level,
    source,
    msg:    message,
    stack:  stack || undefined,
    url:    url   || undefined,
    ua:     ua    || req.headers['user-agent'],
    ts:     ts    || Date.now(),
    ip:     req.ip,
    receivedAt: Date.now(),
  }
  // Ring-Buffer
  debugLogBuffer.push(entry)
  if (debugLogBuffer.length > DEBUG_LOG_BUFFER_SIZE) debugLogBuffer.shift()
  // pino
  if (level === 'error')      logger.error(entry, '[client-debug]')
  else if (level === 'warn')  logger.warn(entry,  '[client-debug]')
  else                        logger.info(entry,  '[client-debug]')
  res.status(204).end()
})

// Export für Admin-Route – kein zusätzliches Modul nötig.
export function getDebugLogs() {
  return debugLogBuffer.slice()
}
export function clearDebugLogs() {
  debugLogBuffer.length = 0
}

export default router
