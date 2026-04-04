import express          from 'express'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { createWriteStream, existsSync, renameSync, unlinkSync } from 'fs'
import { fetchLemma, fetchBonusQuestion, fetchRelation, fetchZeitreise, fetchZeitreiseAnalyze, POS_ROUNDS } from '../wortprofil.js'
import { fetchWiktionary } from '../wiktionary.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { load, loadReadOnly, save, loadZeitreise, loadWortZwilling, loadStats, getLemmataIndex, getCacheMetrics, DATA } from '../store.js'
import { getCacheMetrics as getQueryCacheMetrics, clearCache as clearQueryCache } from '../query-cache.js'
import { adminLimiter, loginLimiter, uploadLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, adminAuth, adminLogout, adminError, serverError } from '../middleware/auth.js'
import { validate, qQuerySchema, adminTagSchema, analyzeKollQuerySchema, analyzeWZQuerySchema, analyzeZeitQuerySchema } from '../middleware/validate.js'
import { auditCreate, auditUpdate, auditDelete, getAuditLog } from '../audit.js'
import logger from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = express.Router()

/** POST /admin/auth – tauscht Admin-Key gegen Session-Cookie */
router.post('/admin/auth', loginLimiter, adminAuth)

/** POST /admin/logout – Session beenden */
router.post('/admin/logout', adminLimiter, requireAuth, adminLogout)

/** GET /admin/stats – Spielstatistik der letzten N Tage */
router.get('/admin/stats', adminLimiter, requireAuth, (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30))
  try {
    const stats  = loadReadOnly('stats.json') ?? {}
    const sorted = Object.keys(stats).sort()
    const result = sorted.slice(-days).map(datum => ({ datum, ...stats[datum] }))
    res.json(result)
  } catch (err) { serverError(res, err) }
})

/** GET /admin/cache-metrics – Cache-Performance-Metriken */
router.get('/admin/cache-metrics', adminLimiter, requireAuth, (req, res) => {
  try {
    const belegeCache = getCacheMetrics()
    const queryCache = getQueryCacheMetrics()
    res.json({
      belege: belegeCache,
      queryResults: queryCache,
      timestamp: new Date().toISOString()
    })
  } catch (err) { adminError(res, err) }
})

/** POST /admin/cache-clear – Alle Caches leeren */
router.post('/admin/cache-clear', adminLimiter, requireAuth, (req, res) => {
  try {
    clearQueryCache()
    logger.info('Alle Query-Caches geleert')
    res.json({ ok: true, message: 'Query-Cache geleert' })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/audit-log – Audit-Protokoll der letzten Admin-Änderungen */
router.get('/admin/audit-log', adminLimiter, requireAuth, (req, res) => {
  try {
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 100))
    const entries = getAuditLog(limit)
    res.json({
      entries,
      count: entries.length,
      timestamp: new Date().toISOString()
    })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/feedback – Feedbackliste */
router.get('/admin/feedback', adminLimiter, requireAuth, (req, res) => {
  try {
    let list = []
    try { list = loadReadOnly('feedback.json') } catch {}
    res.json(list)
  } catch (err) { serverError(res, err) }
})


/** GET /admin/wiktionary-def?q=Wort – Definition aus Wiktionary abrufen */
router.get('/admin/wiktionary-def', adminLimiter, requireAuth, validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  try {
    const url = `https://de.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q)}`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Signifikation/1.0 (signifikation.de; Bildungsprojekt)' },
    })
    if (!r.ok) return res.json({ definition: null })
    const data = await r.json()
    const defs = data.de?.[0]?.definitions ?? []
    if (!defs.length) return res.json({ definition: null })
    // HTML-Tags entfernen, numerierte Definitionen zusammenfügen
    const clean = defs
      .map(d => d.definition.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .join(' ')
    res.json({ definition: clean })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-kollokation?q=Wort&pos=Substantiv – Kollokationswort analysieren */
router.get('/admin/analyze-kollokation', adminLimiter, requireAuth, validate(analyzeKollQuerySchema, 'query'), async (req, res) => {
  const { q: lemma, pos } = req.query
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
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-wortzwilling?a=WortA&b=WortB&pos=Substantiv – Wortpaar analysieren */
router.get('/admin/analyze-wortzwilling', adminLimiter, requireAuth, validate(analyzeWZQuerySchema, 'query'), async (req, res) => {
  const { a: wortA, b: wortB, pos } = req.query
  try {
    const result = await fetchWortZwilling(wortA.trim(), wortB.trim(), pos)
    if (!result) return res.json({ usable: false, wortA, wortB, reason: 'Nicht genug distinkte Kollokatoren (mind. 5 pro Seite nötig)' })
    res.json({ ...result, usable: true })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-zeitreise?q=Wort – Zeitreise-Eignung prüfen */
router.get('/admin/analyze-zeitreise', adminLimiter, requireAuth, validate(analyzeZeitQuerySchema, 'query'), async (req, res) => {
  const { q: lemma } = req.query
  try {
    const result = await fetchZeitreiseAnalyze(lemma.trim())
    if (!result) {
      return res.json({ usable: false, noData: true, lemma, reason: 'Keine Zeitreise-Daten für dieses Wort gefunden.' })
    }
    res.json({ usable: result.usable, lemma: result.lemma, decades: result.perioden.length, paare: result.paare, perioden: result.perioden })
  } catch (err) { adminError(res, err) }
})

/** POST /admin/tag – Tageseintrag anlegen/überschreiben */
router.post('/admin/tag', adminLimiter, requireAuth, validate(adminTagSchema), async (req, res) => {
  const { datum, woerter, notizen, links, definitionen, positionen, zeitreise_lemma, zeitreise_wortart, zwilling_paar, zwilling_pos } = req.body

  try {
    const lemmataDB = load('lemmata.json')
    const kalender  = load('kalender.json')
    const ids       = []

    for (const [i, wort] of woerter.entries()) {
      const pos = (positionen?.[i] || 'Substantiv')
      logger.info(`Lade DWDS-Daten für „${wort}" (${pos}) …`)
      const entry   = await fetchLemma(wort, pos)
      entry.notiz       = notizen[i]      || ''
      entry.link        = links[i]        || ''
      entry.definition  = definitionen[i] || ''
      entry.bonusFrage  = await fetchBonusQuestion(wort, pos).catch(() => null)
      // Wiktionary: IPA + Bedeutungen automatisch holen und lokal speichern
      logger.info(`Lade Wiktionary-Daten für „${wort}" …`)
      const wikt        = await fetchWiktionary(wort).catch(() => ({ ipa: '', definitionen: [] }))
      entry.ipa         = wikt.ipa
      entry.definitionen = wikt.definitionen
      // Direkter Index-Lookup statt findIndex
      const { byId } = getLemmataIndex()
      if (byId.has(entry.id)) {
        const idx = lemmataDB.findIndex(l => l.id === entry.id)
        lemmataDB[idx] = entry
      } else {
        lemmataDB.push(entry)
      }
      ids.push(entry.id)
    }

    kalender[datum] = ids
    await save('lemmata.json', lemmataDB)
    await save('kalender.json', kalender)

    // Zeitreise optional
    let zeitreiseOk = null
    if (zeitreise_lemma.trim()) {
      logger.info(`Lade DiaCollo-Daten für „${zeitreise_lemma}" …`)
      try {
        const zr = await fetchZeitreise(zeitreise_lemma.trim())
        const zeitreise = loadZeitreise()
        if (zr) {
          zeitreise[datum] = { ...zr, wortart: zeitreise_wortart?.trim() || 'Substantiv' }
          await save('zeitreise.json', zeitreise)
          zeitreiseOk = true
          logger.info(`Zeitreise gespeichert: ${zr.paare.map(p => `${p.jahrzehnt}:${p.kollokat}`).join(', ')}`)
        } else {
          zeitreiseOk = false
          logger.warn(`Zeitreise: nicht genügend DiaCollo-Daten für „${zeitreise_lemma}"`)
        }
      } catch (err) {
        zeitreiseOk = false
        logger.error({ err }, 'Zeitreise-Fehler')
      }
    }

    // Wort-Zwilling optional
    let zwillingOk = null
    if (Array.isArray(zwilling_paar) && zwilling_paar.length === 2 && zwilling_paar[0] && zwilling_paar[1]) {
      logger.info(`Lade Wort-Zwilling-Daten für „${zwilling_paar[0]}" / „${zwilling_paar[1]}" …`)
      try {
        const wz = await fetchWortZwilling(zwilling_paar[0].trim(), zwilling_paar[1].trim(), zwilling_pos)
        const wortzwilling = loadWortZwilling()
        if (wz) {
          wortzwilling[datum] = wz
          await save('wortzwilling.json', wortzwilling)
          zwillingOk = true
        } else {
          zwillingOk = false
          logger.warn(`Wort-Zwilling: nicht genug distinkte Kollokatoren für „${zwilling_paar.join(' / ')}"`)
        }
      } catch (err) {
        zwillingOk = false
        logger.error({ err }, 'Wort-Zwilling-Fehler')
      }
    }

    logger.info(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)

    // Audit-Log für Create-Operation
    auditCreate('kalender', datum, { ids, woerter, zeitreise: !!zeitreise_lemma, zwilling: !!zwilling_paar[0] }, {
      adminKey: req.headers['x-admin-token'],
      ip: req.ip,
    })

    res.json({ ok: true, datum, ids, zeitreiseOk, zwillingOk })
  } catch (err) {
    serverError(res, err)
  }
})

/** POST /admin/wiktionary-backfill – IPA + Definitionen für alle bestehenden Lemmata nachholen */
router.post('/admin/wiktionary-backfill', adminLimiter, requireAuth, async (req, res) => {
  try {
    const lemmataDB = load('lemmata.json')
    let updated = 0
    let skipped = 0
    for (const entry of lemmataDB) {
      if (entry.ipa && entry.definitionen?.length) { skipped++; continue }
      const wikt = await fetchWiktionary(entry.lemma).catch(() => ({ ipa: '', definitionen: [] }))
      entry.ipa         = wikt.ipa
      entry.definitionen = wikt.definitionen
      updated++
    }
    await save('lemmata.json', lemmataDB)
    logger.info(`Wiktionary-Backfill: ${updated} aktualisiert, ${skipped} bereits vorhanden`)
    res.json({ ok: true, updated, skipped })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/kalender – alle Einträge (inkl. Zeitreise- und Wort-Zwilling-Status) */
router.get('/admin/kalender', adminLimiter, requireAuth, (req, res) => {
  const kalender     = loadReadOnly('kalender.json')
  const { byId }     = getLemmataIndex()
  const zeitreise    = loadReadOnly('zeitreise.json') ?? {}
  const wortzwilling = loadReadOnly('wortzwilling.json') ?? {}
  const result = {}
  for (const [datum, ids] of Object.entries(kalender)) {
    result[datum] = {
      lemmata:         ids.map(id => {
        const l = byId.get(id)
        return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
      }),
      hasZeitreise:    !!zeitreise[datum],
      hasWortZwilling: !!wortzwilling[datum],
    }
  }
  res.json(result)
})

/** GET /admin/tag/:datum – Eintrag zum Bearbeiten laden */
router.get('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
  if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
  const kalender     = loadReadOnly('kalender.json')
  const { byId }     = getLemmataIndex()
  const zeitreise    = loadReadOnly('zeitreise.json') ?? {}
  const ids = kalender[req.params.datum]
  if (!ids) return res.status(404).json({ error: 'Kein Eintrag' })
  const lemmata = ids.map(id => byId.get(id)).filter(Boolean)
  const wz = (loadReadOnly('wortzwilling.json') ?? {})[req.params.datum]
  res.json({
    datum:           req.params.datum,
    woerter:         lemmata.map(l => l.lemma),
    positionen:      lemmata.map(l => l.pos || 'Substantiv'),
    notizen:         lemmata.map(l => l.notiz      || ''),
    links:           lemmata.map(l => l.link       || ''),
    definitionen:    lemmata.map(l => l.definition || ''),
    zeitreise_lemma:   zeitreise[req.params.datum]?.lemma   || '',
    zeitreise_wortart: zeitreise[req.params.datum]?.wortart || 'Substantiv',
    zwilling_paar:   wz ? [wz.wortA, wz.wortB] : [],
    zwilling_pos:    wz?.pos || 'Substantiv',
  })
})

/** DELETE /admin/tag/:datum – Eintrag löschen */
router.delete('/admin/tag/:datum', adminLimiter, requireAuth, async (req, res) => {
  if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
  try {
    const kalender     = load('kalender.json')
    const zeitreise    = loadZeitreise()
    const wortzwilling = loadWortZwilling()
    const datum        = req.params.datum

    // Speichere Daten vor Löschung für Audit-Log
    const deletedData = {
      ids: kalender[datum],
      zeitreise: zeitreise[datum],
      wortzwilling: wortzwilling[datum],
    }

    delete kalender[datum]
    delete zeitreise[datum]
    delete wortzwilling[datum]

    await save('kalender.json', kalender)
    await save('zeitreise.json', zeitreise)
    await save('wortzwilling.json', wortzwilling)

    // Audit-Log für Delete-Operation
    auditDelete('kalender', datum, deletedData, {
      adminKey: req.headers['x-admin-token'],
      ip: req.ip,
    })

    res.json({ ok: true })
  } catch (err) {
    serverError(res, err)
  }
})

/** POST /admin/backup/gist – manuell Backup nach GitHub Gist anstoßen */
router.post('/admin/backup/gist', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { runBackup } = await import('../backup.js')
    const result = await runBackup()
    res.json({ ok: true, ...result })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/backup – alle JSON-Daten als Bundle */
router.get('/admin/backup', adminLimiter, requireAuth, (req, res) => {
  try {
    const files  = ['kalender.json', 'lemmata.json', 'zeitreise.json', 'wortzwilling.json', 'stats.json', 'feedback.json', 'diacollo-config.json']
    const bundle = {}
    for (const f of files) {
      try { bundle[f] = loadReadOnly(f) } catch { bundle[f] = null }
    }
    res.setHeader('Content-Disposition', `attachment; filename="signifikation-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.json({ exportedAt: new Date().toISOString(), files: bundle })
  } catch (err) { serverError(res, err) }
})


/** POST /admin/upload-wortprofil – wortprofil.db in Chunks hochladen (raw binary) */
router.post('/admin/upload-wortprofil', uploadLimiter, requireAuth, (req, res) => {
  const { index, total } = req.query
  if (index === undefined || !total) return res.status(400).json({ error: 'index/total erforderlich' })
  const dataDir = join(__dirname, '../data')
  const tmpPath = join(dataDir, 'wortprofil.db.upload')
  const chunks  = []
  req.on('data', d => chunks.push(d))
  req.on('end', () => {
    try {
      const buf    = Buffer.concat(chunks)
      const stream = createWriteStream(tmpPath, { flags: index === '0' ? 'w' : 'a' })
      stream.write(buf)
      stream.end()
      stream.on('finish', () => {
        if (parseInt(index) === parseInt(total) - 1) {
          const dbPath  = join(dataDir, 'wortprofil.db')
          const bakPath = join(dataDir, 'wortprofil.db.bak')
          if (existsSync(dbPath)) renameSync(dbPath, bakPath)
          renameSync(tmpPath, dbPath)
          if (existsSync(bakPath)) { try { unlinkSync(bakPath) } catch (e) { logger.warn({ err: e }, 'Backup konnte nicht gelöscht werden') } }
          logger.info('wortprofil.db Upload abgeschlossen und aktiviert')
          res.json({ ok: true, done: true })
        } else {
          res.json({ ok: true, done: false, index: parseInt(index) })
        }
      })
    } catch (err) { adminError(res, err) }
  })
  req.on('error', err => adminError(res, err))
})

/** GET /admin – Admin-Oberfläche */
router.get('/admin', (req, res) => {
  // 'unsafe-inline' in script-src und style-src ist weiterhin nötig:
  // - script-src: onclick-Attribute im HTML (TODO: auf Event Listener umstellen)
  // - style-src: dynamische style="…"-Attribute in den JS-Renderfunktionen
  //   (Balkenbreiten, Korpusfarben, logDice-abhängige Werte – können nicht in externe CSS-Klassen).
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  )
  res.sendFile(join(__dirname, '../admin.html'))
})

export default router
