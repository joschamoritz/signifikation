import express          from 'express'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchBonusQuestion, fetchRelation, POS_ROUNDS } from '../dwds.js'
import { fetchZeitreise, debugDiaCollo, clearCorporaCache } from '../diacollo.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { load, save, loadZeitreise, loadWortZwilling, loadStats, DATA } from '../store.js'
import { adminLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, adminAuth, serverError } from '../middleware/auth.js'
import { validate, adminTagSchema, diacolloConfigSchema, qQuerySchema, analyzeKollQuerySchema, analyzeWZQuerySchema } from '../middleware/validate.js'
import logger from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = express.Router()

/** POST /admin/auth – tauscht Admin-Key gegen Session-Token */
router.post('/admin/auth', adminLimiter, adminAuth)

/** GET /admin/stats – Spielstatistik der letzten N Tage */
router.get('/admin/stats', adminLimiter, requireAuth, (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30))
  try {
    const stats  = loadStats()
    const sorted = Object.keys(stats).sort()
    const result = sorted.slice(-days).map(datum => ({ datum, ...stats[datum] }))
    res.json(result)
  } catch (err) { serverError(res, err) }
})

/** GET /admin/feedback – Feedbackliste */
router.get('/admin/feedback', adminLimiter, requireAuth, (req, res) => {
  try {
    let list = []
    try { list = JSON.parse(readFileSync(join(DATA, 'feedback.json'), 'utf8')) } catch {}
    res.json(list)
  } catch (err) { serverError(res, err) }
})

/** GET /admin/diacollo-config – Korpus-Konfiguration laden */
router.get('/admin/diacollo-config', adminLimiter, requireAuth, (req, res) => {
  try {
    const cfg = JSON.parse(readFileSync(join(DATA, 'diacollo-config.json'), 'utf8'))
    res.json(cfg)
  } catch {
    res.status(404).json({ error: 'Keine Konfiguration gefunden' })
  }
})

/** POST /admin/diacollo-config – Korpus-Konfiguration speichern */
router.post('/admin/diacollo-config', adminLimiter, requireAuth, validate(diacolloConfigSchema), (req, res) => {
  const { corpora } = req.body
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
router.get('/admin/debug-diacollo', adminLimiter, requireAuth, validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  try {
    const result = await debugDiaCollo(q)
    res.json({ q, ...result })
  } catch (err) {
    serverError(res, err)
  }
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
  } catch (err) { serverError(res, err) }
})

/** GET /admin/analyze-wortzwilling?a=WortA&b=WortB&pos=Substantiv – Wortpaar analysieren */
router.get('/admin/analyze-wortzwilling', adminLimiter, requireAuth, validate(analyzeWZQuerySchema, 'query'), async (req, res) => {
  const { a: wortA, b: wortB, pos } = req.query
  try {
    const result = await fetchWortZwilling(wortA.trim(), wortB.trim(), pos)
    if (!result) return res.json({ usable: false, wortA, wortB, reason: 'Nicht genug distinkte Kollokatoren (mind. 5 pro Seite nötig)' })
    res.json({ ...result, usable: true })
  } catch (err) { serverError(res, err) }
})

/** POST /admin/tag – Tageseintrag anlegen/überschreiben */
router.post('/admin/tag', adminLimiter, requireAuth, validate(adminTagSchema), async (req, res) => {
  const { datum, woerter, notizen, links, positionen, zeitreise_lemma, zwilling_paar, zwilling_pos } = req.body

  try {
    const lemmataDB = load('lemmata.json')
    const kalender  = load('kalender.json')
    const ids       = []

    for (const [i, wort] of woerter.entries()) {
      const pos = (positionen?.[i] || 'Substantiv')
      logger.info(`Lade DWDS-Daten für „${wort}" (${pos}) …`)
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
      logger.info(`Lade DiaCollo-Daten für „${zeitreise_lemma}" …`)
      try {
        const zr = await fetchZeitreise(zeitreise_lemma.trim())
        const zeitreise = loadZeitreise()
        if (zr) {
          zeitreise[datum] = zr
          save('zeitreise.json', zeitreise)
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
          save('wortzwilling.json', wortzwilling)
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
    res.json({ ok: true, datum, ids, zeitreiseOk, zwillingOk })
  } catch (err) {
    serverError(res, err)
  }
})

/** GET /admin/kalender – alle Einträge (inkl. Zeitreise- und Wort-Zwilling-Status) */
router.get('/admin/kalender', adminLimiter, requireAuth, (req, res) => {
  const kalender     = load('kalender.json')
  const lemmataDB    = load('lemmata.json')
  const zeitreise    = loadZeitreise()
  const wortzwilling = loadWortZwilling()
  const result = {}
  for (const [datum, ids] of Object.entries(kalender)) {
    result[datum] = {
      lemmata:         ids.map(id => {
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
router.get('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
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
router.delete('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
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

/** GET /admin/backup – alle JSON-Daten als Bundle */
router.get('/admin/backup', adminLimiter, requireAuth, (req, res) => {
  try {
    const files  = ['kalender.json', 'lemmata.json', 'zeitreise.json', 'wortzwilling.json', 'stats.json', 'feedback.json', 'diacollo-config.json']
    const bundle = {}
    for (const f of files) {
      try { bundle[f] = load(f) } catch { bundle[f] = null }
    }
    res.setHeader('Content-Disposition', `attachment; filename="signifikation-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.json({ exportedAt: new Date().toISOString(), files: bundle })
  } catch (err) { serverError(res, err) }
})

/** GET /admin – Admin-Oberfläche */
router.get('/admin', (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  )
  res.sendFile(join(__dirname, '../admin.html'))
})

export default router
