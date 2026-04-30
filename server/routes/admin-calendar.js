import express from 'express'

export function createAdminCalendarRouter({
  adminLimiter,
  requireAuth,
  validate,
  qQuerySchema,
  adminTagSchema,
  analyzeKollQuerySchema,
  analyzeWZQuerySchema,
  analyzeZeitQuerySchema,
  analyzeZWendeQuerySchema,
  adminBulkDeleteCalendarSchema,
  adminBulkImportCalendarSchema,
  adminPreviewLemmaSchema,
  adminPreviewDayParamsSchema,
  load,
  loadKalender,
  loadDailyContentMaps,
  loadMutableDailyContentMaps,
  save,
  saveDailyContentMaps,
  loadZeitreise,
  loadWortZwilling,
  loadZeitenwende,
  getLemmataIndex,
  invalidateCache,
  stmts,
  lemmaToRow,
  fetchLemma,
  fetchBonusQuestion,
  fetchRelation,
  fetchZeitreise,
  fetchZeitreiseAnalyze,
  fetchZeitenwende,
  fetchZeitenwendeAnalyze,
  fetchWiktionary,
  fetchWortZwilling,
  POS_ROUNDS,
  parseCalendarBulkImport,
  buildModeGroups,
  auditCreate,
  auditDelete,
  adminError,
  serverError,
  logger,
}) {
  const router = express.Router()

  router.post('/admin/kalender/bulk-delete', adminLimiter, requireAuth, validate(adminBulkDeleteCalendarSchema), async (req, res) => {
    const { dates } = req.body
    try {
      const { kalender, zeitreise, wortzwilling, zeitenwende } = loadMutableDailyContentMaps()

      const removed = []
      const skipped = []

      for (const datum of dates) {
        if (!kalender[datum]) {
          skipped.push(datum)
          continue
        }

        const deletedData = {
          kalender: kalender[datum],
          zeitreise: zeitreise[datum],
          wortzwilling: wortzwilling[datum],
          zeitenwende: zeitenwende[datum],
        }

        delete kalender[datum]
        delete zeitreise[datum]
        delete wortzwilling[datum]
        delete zeitenwende[datum]

        removed.push(datum)

        auditDelete('kalender', datum, deletedData, {
          adminKey: req.adminSessionId || 'unknown',
          ip: req.ip,
        })
      }

      if (removed.length > 0) {
        await saveDailyContentMaps({ kalender, zeitreise, wortzwilling, zeitenwende })
      }

      res.json({ ok: true, removed, skipped, removedCount: removed.length, skippedCount: skipped.length })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/kalender/bulk-import', adminLimiter, requireAuth, validate(adminBulkImportCalendarSchema), async (req, res) => {
    try {
      const entries = parseCalendarBulkImport(req.body.csv)
      const kalender = loadMutableDailyContentMaps().kalender
      const imported = []
      const replaced = []

      for (const entry of entries) {
        const ids = []
        const lemmataDB = load('lemmata.json')

        for (const wort of entry.woerter) {
          const lemma = await fetchLemma(wort, 'Substantiv')
          const { byId } = getLemmataIndex()
          if (byId.has(lemma.id)) {
            const idx = lemmataDB.findIndex((item) => item.id === lemma.id)
            if (idx >= 0) lemmataDB[idx] = { ...lemmataDB[idx], ...lemma }
          } else {
            lemmataDB.push(lemma)
          }
          ids.push(lemma.id)
        }

        await save('lemmata.json', lemmataDB)
        const existed = !!kalender[entry.datum]
        kalender[entry.datum] = { ids, thema: '' }
        imported.push({ datum: entry.datum, ids, woerter: entry.woerter })
        if (existed) replaced.push(entry.datum)

        auditCreate('kalender', entry.datum, { ids, woerter: entry.woerter, importedVia: 'csv' }, {
          adminKey: req.adminSessionId || 'unknown',
          ip: req.ip,
        })
      }

      await saveDailyContentMaps({
        kalender,
        zeitreise: loadZeitreise(),
        wortzwilling: loadWortZwilling(),
        zeitenwende: loadZeitenwende(),
      })

      res.json({
        ok: true,
        importedCount: imported.length,
        replacedCount: replaced.length,
        imported,
        replaced,
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/preview/lemma', adminLimiter, requireAuth, validate(adminPreviewLemmaSchema), async (req, res) => {
    const { lemma, pos } = req.body
    try {
      const [entry, bonusQ, wikt] = await Promise.all([
        fetchLemma(lemma, pos),
        fetchBonusQuestion(lemma, pos).catch(() => null),
        fetchWiktionary(lemma).catch(() => ({ ipa: '', definitionen: [] })),
      ])

      res.json({
        lemma: entry.lemma,
        id: entry.id,
        pos: entry.pos,
        wortart: entry.wortart,
        runden: entry.runden,
        rundenInfo: entry.rundenInfo,
        rundenSummary: Array.isArray(entry.rundenInfo)
          ? entry.rundenInfo.map((round) => ({
              key: round.key,
              label: round.label,
              relCode: round.relCode,
              count: Array.isArray(entry.runden?.[round.key]) ? entry.runden[round.key].length : 0,
            }))
          : [],
        bonusFrage: bonusQ,
        ipa: wikt.ipa,
        definitionen: wikt.definitionen,
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/preview/day/:datum', adminLimiter, requireAuth, validate(adminPreviewDayParamsSchema, 'params'), (req, res) => {
    const { datum } = req.params
    try {
      const { kalender, zeitreise, wortzwilling, zeitenwende } = loadDailyContentMaps()
      const kalEintrag = kalender[datum]
      if (!kalEintrag) return res.status(404).json({ error: 'Kein Eintrag fuer dieses Datum' })
      const ids = Array.isArray(kalEintrag) ? kalEintrag : (kalEintrag.ids ?? [])

      const { byId } = getLemmataIndex()

      const lemmata = ids.map((id) => {
        const l = byId.get(id)
        if (!l) return null
        return {
          id: l.id,
          lemma: l.lemma,
          pos: l.pos,
          wortart: l.wortart,
          notiz: l.notiz || '',
          link: l.link || '',
          definition: l.definition || '',
          ipa: l.ipa || '',
          definitionen: l.definitionen || [],
        }
      }).filter(Boolean)

      const zeitreiseEntry = zeitreise[datum] || null
      const wortzwillingEntry = wortzwilling[datum] || null
      const zeitenwendeEntry = zeitenwende[datum] || null
      const modeGroups = buildModeGroups({
        lemmata,
        zeitreiseEntry,
        wortzwillingEntry,
        zeitenwendeEntry,
      })

      res.json({
        datum,
        lemmata,
        modeGroups,
        modes: {
          kollokationen: { enabled: lemmata.length > 0, count: lemmata.length },
          zeitreise: { enabled: !!zeitreiseEntry, data: zeitreiseEntry },
          wortzwilling: { enabled: !!wortzwillingEntry, data: wortzwillingEntry },
          zeitenwende: { enabled: !!zeitenwendeEntry, data: zeitenwendeEntry },
        },
      })
    } catch (err) {
      adminError(res, err)
    }
  })

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
      const clean = defs
        .map((d) => d.definition.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .join(' ')
      res.json({ definition: clean })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/analyze-kollokation', adminLimiter, requireAuth, validate(analyzeKollQuerySchema, 'query'), async (req, res) => {
    const { q: lemma, pos } = req.query
    const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
    try {
      const [roundResults, bonusQ] = await Promise.all([
        Promise.allSettled(rounds.map((r) => fetchRelation(lemma, pos, r.relCode))),
        fetchBonusQuestion(lemma, pos).catch(() => null),
      ])
      const runden = rounds.map((round, i) => {
        const r = roundResults[i]
        if (r.status === 'rejected') return { ...round, items: [], count: 0, usable: false, error: r.reason.message }
        const items = r.value.filter((it) => !it.lemma.includes(' ') && it.lemma.length > 1)
        return {
          ...round,
          items: items.slice(0, 10).map((it) => ({ wort: it.lemma, logDice: parseFloat(parseFloat(it.logDice).toFixed(2)) })),
          count: items.length,
          usable: items.length >= 5,
        }
      })
      const allItems = runden.flatMap((r) => r.items)
      const seen = new Set()
      const top3 = allItems
        .sort((a, b) => b.logDice - a.logDice)
        .filter((it) => {
          if (seen.has(it.wort)) return false
          seen.add(it.wort)
          return true
        })
        .slice(0, 3)
      const usable = runden.every((r) => r.usable)
      res.json({ lemma, pos, runden, top3, bonus: bonusQ, usable })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/analyze-wortzwilling', adminLimiter, requireAuth, validate(analyzeWZQuerySchema, 'query'), async (req, res) => {
    const { a: wortA, b: wortB, pos } = req.query
    try {
      const result = await fetchWortZwilling(wortA.trim(), wortB.trim(), pos)
      if (!result) return res.json({ usable: false, wortA, wortB, reason: 'Nicht genug distinkte Kollokatoren (mind. 5 pro Seite nötig)' })
      res.json({ ...result, usable: true })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/analyze-zeitreise', adminLimiter, requireAuth, validate(analyzeZeitQuerySchema, 'query'), async (req, res) => {
    const { q: lemma } = req.query
    try {
      const result = await fetchZeitreiseAnalyze(lemma.trim())
      if (!result) {
        return res.json({ usable: false, noData: true, lemma, reason: 'Keine Zeitreise-Daten für dieses Wort gefunden.' })
      }
      res.json({ usable: result.usable, lemma: result.lemma, decades: result.perioden.length, paare: result.paare, perioden: result.perioden })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/analyze-zeitenwende', adminLimiter, requireAuth, validate(analyzeZWendeQuerySchema, 'query'), async (req, res) => {
    const { q: lemma } = req.query
    try {
      const result = await fetchZeitenwendeAnalyze(lemma.trim())
      if (!result) return res.json({ usable: false, noData: true, lemma, reason: 'Keine Zeitenwende-Daten für dieses Wort gefunden.' })
      res.json(result)
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/tag', adminLimiter, requireAuth, validate(adminTagSchema), async (req, res) => {
    const {
      datum, woerter, notizen, links, definitionen, positionen,
      thema, thema_kurz, thema_quelle,
      zeitreise_lemma, zeitreise_wortart, zeitreise_notiz, zeitreise_link,
      zwilling_paar, zwilling_pos, zwilling_notiz, zwilling_link,
      zeitenwende_lemma, zeitenwende_notiz, zeitenwende_link,
    } = req.body

    try {
      const { kalender, zeitreise, wortzwilling, zeitenwende } = loadMutableDailyContentMaps()
      const ids = []

      for (const [i, wort] of woerter.entries()) {
        const pos = (positionen?.[i] || 'Substantiv')
        logger.info(`Lade DWDS-Daten für „${wort}" (${pos}) …`)
        const entry = await fetchLemma(wort, pos)
        entry.notiz = notizen[i] || ''
        entry.link = links[i] || ''
        entry.definition = definitionen[i] || ''
        entry.bonusFrage = await fetchBonusQuestion(wort, pos).catch(() => null)
        
        // Wiktionary-Daten nur holen, wenn noch nicht vorhanden
        const { byId } = getLemmataIndex()
        const existing = byId.get(entry.id)
        if (!existing || !existing.ipa || !existing.definitionen?.length) {
          logger.info(`Lade Wiktionary-Daten für „${wort}" …`)
          const wikt = await fetchWiktionary(wort).catch(() => ({ ipa: '', definitionen: [] }))
          entry.ipa = wikt.ipa
          entry.definitionen = wikt.definitionen
        } else {
          // Vorhandene Wiktionary-Daten beibehalten
          entry.ipa = existing.ipa
          entry.definitionen = existing.definitionen
        }

        stmts.upsertLemma.run(lemmaToRow(entry))
        ids.push(entry.id)
      }

      invalidateCache('lemmata.json')
      kalender[datum] = { ids, thema: thema || '', thema_kurz: thema_kurz || '', thema_quelle: thema_quelle || '' }

      let zeitreiseOk = null
      delete zeitreise[datum]
      if (zeitreise_lemma.trim()) {
        logger.info(`Lade DiaCollo-Daten für „${zeitreise_lemma}" …`)
        try {
          const zr = await fetchZeitreise(zeitreise_lemma.trim())
          if (zr) {
            zeitreise[datum] = { ...zr, wortart: zeitreise_wortart?.trim() || 'Substantiv', notiz: zeitreise_notiz || '', link: zeitreise_link || '' }
            zeitreiseOk = true
            logger.info(`Zeitreise gespeichert: ${zr.paare.map((p) => `${p.jahrzehnt}:${p.kollokat}`).join(', ')}`)
          } else {
            zeitreiseOk = false
            logger.warn(`Zeitreise: nicht genügend DiaCollo-Daten für „${zeitreise_lemma}"`)
          }
        } catch (err) {
          zeitreiseOk = false
          logger.error({ err }, 'Zeitreise-Fehler')
        }
      }

      let zwillingOk = null
      delete wortzwilling[datum]
      if (Array.isArray(zwilling_paar) && zwilling_paar.length === 2 && zwilling_paar[0] && zwilling_paar[1]) {
        logger.info(`Lade Wort-Zwilling-Daten für „${zwilling_paar[0]}" / „${zwilling_paar[1]}" …`)
        try {
          const wz = await fetchWortZwilling(zwilling_paar[0].trim(), zwilling_paar[1].trim(), zwilling_pos)
          if (wz) {
            wortzwilling[datum] = { ...wz, notiz: zwilling_notiz || '', link: zwilling_link || '' }
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

      let zeitenwendeOk = null
      delete zeitenwende[datum]
      if (zeitenwende_lemma?.trim()) {
        logger.info(`Lade Zeitenwende-Daten für „${zeitenwende_lemma}" …`)
        try {
          const zw = await fetchZeitenwende(zeitenwende_lemma.trim())
          if (zw) {
            zeitenwende[datum] = { ...zw, notiz: zeitenwende_notiz || '', link: zeitenwende_link || '' }
            zeitenwendeOk = true
            logger.info(`Zeitenwende gespeichert: ${zw.words.length} Wörter für „${zw.lemma}"`)
          } else {
            zeitenwendeOk = false
            logger.warn(`Zeitenwende: nicht genug distinkte Kollokatoren für „${zeitenwende_lemma}"`)
          }
        } catch (err) {
          zeitenwendeOk = false
          logger.error({ err }, 'Zeitenwende-Fehler')
        }
      }
      await saveDailyContentMaps({ kalender, zeitreise, wortzwilling, zeitenwende })

      logger.info(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)

      auditCreate('kalender', datum, { ids, woerter, zeitreise: !!zeitreise_lemma, zwilling: !!zwilling_paar?.[0], zeitenwende: !!zeitenwende_lemma }, {
        adminKey: req.adminSessionId || 'unknown',
        ip: req.ip,
      })

      res.json({ ok: true, datum, ids, zeitreiseOk, zwillingOk, zeitenwendeOk })
    } catch (err) {
      serverError(res, err)
    }
  })

  router.post('/admin/wiktionary-backfill', adminLimiter, requireAuth, async (_req, res) => {
    try {
      const { byId } = getLemmataIndex()
      let updated = 0
      let skipped = 0
      
      for (const entry of byId.values()) {
        if (entry.ipa && entry.definitionen?.length) { 
          skipped++
          continue 
        }
        
        logger.info(`Backfill: Lade Wiktionary-Daten für „${entry.lemma}" …`)
        const wikt = await fetchWiktionary(entry.lemma).catch(() => ({ ipa: '', definitionen: [] }))
        entry.ipa = wikt.ipa
        entry.definitionen = wikt.definitionen
        
        stmts.upsertLemma.run(lemmaToRow(entry))
        updated++
      }
      
      logger.info(`Wiktionary-Backfill: ${updated} aktualisiert, ${skipped} bereits vorhanden`)
      res.json({ ok: true, updated, skipped })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/kalender', adminLimiter, requireAuth, (_req, res) => {
    try {
      const { kalender, zeitreise, wortzwilling, zeitenwende } = loadDailyContentMaps()
      const { byId } = getLemmataIndex()
      const result = {}
      for (const [datum, eintrag] of Object.entries(kalender)) {
        const ids = Array.isArray(eintrag) ? eintrag : (eintrag.ids ?? [])
        const lemmata = ids.map((id) => {
          const l = byId.get(id)
          return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
        })
        const zeitreiseEntry = zeitreise[datum] || null
        const wortzwillingEntry = wortzwilling[datum] || null
        const zeitenwendeEntry = zeitenwende[datum] || null
        result[datum] = {
          lemmata,
          modeGroups: buildModeGroups({
            lemmata,
            zeitreiseEntry,
            wortzwillingEntry,
            zeitenwendeEntry,
          }),
          hasZeitreise: !!zeitreiseEntry,
          hasWortZwilling: !!wortzwillingEntry,
          hasZeitenwende: !!zeitenwendeEntry,
        }
      }
      res.json(result)
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
    if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
    const { kalender, zeitreise, wortzwilling, zeitenwende } = loadDailyContentMaps()
    const { byId } = getLemmataIndex()
    const kalEintrag = kalender[req.params.datum]
    if (!kalEintrag) return res.status(404).json({ error: 'Kein Eintrag' })
    const ids = Array.isArray(kalEintrag) ? kalEintrag : (kalEintrag.ids ?? [])
    const thema        = Array.isArray(kalEintrag) ? '' : (kalEintrag.thema ?? '')
    const thema_kurz   = Array.isArray(kalEintrag) ? '' : (kalEintrag.thema_kurz ?? '')
    const thema_quelle = Array.isArray(kalEintrag) ? '' : (kalEintrag.thema_quelle ?? '')
    const lemmata = ids.map((id) => byId.get(id)).filter(Boolean)
    const wz = wortzwilling[req.params.datum]
    const zr = zeitreise[req.params.datum]
    const ze = zeitenwende[req.params.datum]
    res.json({
      datum: req.params.datum,
      thema,
      thema_kurz,
      thema_quelle,
      woerter: lemmata.map((l) => l.lemma),
      positionen: lemmata.map((l) => l.pos || 'Substantiv'),
      notizen: lemmata.map((l) => l.notiz || ''),
      links: lemmata.map((l) => l.link || ''),
      definitionen: lemmata.map((l) => l.definition || ''),
      zeitreise_lemma: zr?.lemma || '',
      zeitreise_wortart: zr?.wortart || 'Substantiv',
      zeitreise_notiz: zr?.notiz || '',
      zeitreise_link: zr?.link || '',
      zwilling_paar: wz ? [wz.wortA, wz.wortB] : [],
      zwilling_pos: wz?.pos || 'Substantiv',
      zwilling_notiz: wz?.notiz || '',
      zwilling_link: wz?.link || '',
      zeitenwende_lemma: ze?.lemma || '',
      zeitenwende_notiz: ze?.notiz || '',
      zeitenwende_link: ze?.link || '',
    })
  })

  router.delete('/admin/tag/:datum', adminLimiter, requireAuth, async (req, res) => {
    if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
    try {
      const { kalender, zeitreise, wortzwilling, zeitenwende } = loadMutableDailyContentMaps()
      const datum = req.params.datum

      const deletedData = {
        ids: kalender[datum],
        zeitreise: zeitreise[datum],
        wortzwilling: wortzwilling[datum],
        zeitenwende: zeitenwende[datum],
      }

      delete kalender[datum]
      delete zeitreise[datum]
      delete wortzwilling[datum]
      delete zeitenwende[datum]

      await saveDailyContentMaps({ kalender, zeitreise, wortzwilling, zeitenwende })

      auditDelete('kalender', datum, deletedData, {
        adminKey: req.adminSessionId || 'unknown',
        ip: req.ip,
      })

      res.json({ ok: true })
    } catch (err) {
      serverError(res, err)
    }
  })

  return router
}
