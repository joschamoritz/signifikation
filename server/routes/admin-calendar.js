import express from 'express'
import { ergaenzeLueckenfueller, ermittleLueckenfuellerId, findeLueckenfuellerLemma } from '../lueckenfuellerAutoGen.js'

// Entwürfe, die gerade übernommen werden. Zwischen Statusprüfung und
// entscheideEntwurf liegt ein await (speichereTag); ein zweiter POST in diesem
// Fenster würde den Tag doppelt speichern. Ein Node-Prozess → ein Set genügt.
const laufendeUebernahmen = new Set()

export function createAdminCalendarRouter({
  adminLimiter,
  requireAuth,
  validate,
  qQuerySchema,
  adminTagSchema,
  analyzeKollQuerySchema,
  analyzeWZQuerySchema,
  analyzeZWendeQuerySchema,
  analyzeLueckenfuellerQuerySchema,
  lueckenfuellerGenerateSchema,
  adminBulkDeleteCalendarSchema,
  adminPreviewLemmaSchema,
  adminPreviewDayParamsSchema,
  adminLemmaIdParamsSchema,
  adminEntwurfIdParamsSchema,
  ladeOffeneEntwuerfe,
  ladeEntwurf,
  entscheideEntwurf,
  loadDailyContentMaps,
  deleteTagsAtomically,
  getLemmataIndex,
  invalidateCache,
  stmts,
  lemmaToRow,
  saveTagAtomically,
  fetchLemma,
  fetchBonusQuestion,
  fetchRelation,
  fetchZeitenwende,
  fetchZeitenwendeAnalyze,
  fetchWiktionary,
  fetchWortZwilling,
  buildLueckenfueller,
  toId,
  POS_ROUNDS,
  buildModeGroups,
  auditCreate,
  auditDelete,
  adminError,
  serverError,
  logger,
}) {
  const router = express.Router()

  // Die aus einem Wort abgeleitete Kennung gehört schon zu einem Lemma mit anderer Schreibung
  // („Essen“ → `essen`, das Verb): Dort darf nichts angelegt oder überschrieben werden.
  const kollisionsMeldung = (k) => `Die Kennung „${k.id}“ gehört schon zu „${k.lemma}“ (${k.pos}). Bitte das vorhandene Wort verwenden.`

  // Wird in Phase 1 von speichereTag geworfen; die Routen antworten damit 409.
  function kollisionsFehler(k, feld) {
    return Object.assign(new Error(kollisionsMeldung(k)), { kollision: true, feld })
  }

  // Gemeinsame Antwort auf diesen Fehler (Formular und Übernehmen eines Entwurfs).
  function antworteMitKollision(res, err) {
    return res.status(409).json({ error: err.message, feld: err.feld })
  }

  async function analyzeKollokationForPos(lemma, pos) {
    const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
    const [roundResults, bonusQ] = await Promise.all([
      Promise.allSettled(rounds.map((r) => fetchRelation(lemma, pos, r.relCode))),
      fetchBonusQuestion(lemma, pos).catch(() => null),
    ])

    // Alle Relationen zusammenführen, deduplizieren, nach logDice sortieren
    const allRawItems = roundResults.flatMap((r) =>
      r.status === 'fulfilled'
        ? r.value.filter((it) => !it.lemma.includes(' ') && it.lemma.length > 1)
        : []
    )
    const seen = new Map()
    for (const it of allRawItems) {
      const key = it.lemma.toLowerCase()
      if (!seen.has(key) || parseFloat(it.logDice) > parseFloat(seen.get(key).logDice)) {
        seen.set(key, it)
      }
    }
    const kollokatoren = [...seen.values()]
      .sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))
      .slice(0, 20)
      .map((it) => ({ wort: it.lemma, logDice: parseFloat(parseFloat(it.logDice).toFixed(2)) }))

    const usable = kollokatoren.length >= 5

    return {
      lemma,
      pos,
      kollokatoren,
      bonus: bonusQ,
      usable,
      score: kollokatoren.slice(0, 3).reduce((sum, it) => sum + it.logDice, 0),
      kollCount: kollokatoren.length,
    }
  }

  router.post('/admin/kalender/bulk-delete', adminLimiter, requireAuth, validate(adminBulkDeleteCalendarSchema), async (req, res) => {
    const { dates } = req.body
    try {
      // Gezielte Tages-Deletes (D-M2): das fruehere Load-Mutate-FullReplace
      // ueberschrieb parallele Admin-Aenderungen und schrieb pro Aufruf die
      // kompletten Tabellen neu.
      const removed = []
      const skipped = []
      const auditDaten = new Map()

      for (const datum of dates) {
        const kal = stmts.getKalenderByDatum.get(datum)
        if (!kal) {
          skipped.push(datum)
          continue
        }

        auditDaten.set(datum, {
          kalender: kal,
          wortzwilling: stmts.getWortzwillingByDatum.get(datum) ?? null,
          zeitenwende: stmts.getZeitenwendeByDatum.get(datum) ?? null,
        })
        removed.push(datum)
      }

      if (removed.length > 0) {
        deleteTagsAtomically(removed)
        // Protokoll erst nach dem erfolgreichen Löschen: Scheitert es, steht keine Löschung im Audit, die nicht stattfand.
        for (const datum of removed) {
          auditDelete('kalender', datum, auditDaten.get(datum), {
            adminKey: req.adminSessionId || 'unknown',
            ip: req.ip,
          })
        }
      }

      res.json({ ok: true, removed, skipped, removedCount: removed.length, skippedCount: skipped.length })
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
      const { kalender, wortzwilling, zeitenwende } = loadDailyContentMaps()
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

      const wortzwillingEntry = wortzwilling[datum] || null
      const zeitenwendeEntry = zeitenwende[datum] || null
      const modeGroups = buildModeGroups({
        lemmata,
        wortzwillingEntry,
        zeitenwendeEntry,
      })

      res.json({
        datum,
        lemmata,
        modeGroups,
        modes: {
          kollokationen: { enabled: lemmata.length > 0, count: lemmata.length },
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
    try {
      if (pos) {
        const result = await analyzeKollokationForPos(lemma, pos)
        return res.json({ lemma: result.lemma, pos: result.pos, kollokatoren: result.kollokatoren, bonus: result.bonus, usable: result.usable })
      }

      const posCandidates = ['Substantiv', 'Verb', 'Adjektiv']
      const analyses = await Promise.all(posCandidates.map((candidate) => analyzeKollokationForPos(lemma, candidate)))
      analyses.sort((a, b) => {
        if (b.kollCount !== a.kollCount) return b.kollCount - a.kollCount
        return b.score - a.score
      })

      const best = analyses[0]
      res.json({ lemma: best.lemma, pos: best.pos, kollokatoren: best.kollokatoren, bonus: best.bonus, usable: best.usable })
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

  // Speicherweg eines Kalendertags, gemeinsam für das Formular (POST /admin/tag)
  // und das Übernehmen eines Entwurfs. Erwartet einen per adminTagSchema
  // validierten Body und wirft bei Fehlern; die Routen machen daraus eine Antwort.
  async function speichereTag(body, { adminSessionId, ip }) {
    const {
      datum, woerter, notizen, links, definitionen, positionen,
      thema, thema_kurz, thema_quelle,
      zwilling_paar, zwilling_pos, zwilling_notiz, zwilling_link,
      zeitenwende_lemma, zeitenwende_notiz, zeitenwende_link,
    } = body

    // ── Phase 1: Alle Daten async sammeln – noch nichts schreiben ──
    // Zuerst prüfen (schnell, ohne Abrufe): Gehört die Kennung eines Wortes schon zu einem Lemma
    // mit anderer Schreibung, würde saveTagAtomically dessen ganze Zeile ersetzen (Name, Wortart,
    // Runden, Notiz …). Gleicher Name mit anderer Wortart bleibt erlaubt (Korrektur der Wortart).
    {
      const { byId } = getLemmataIndex()
      for (const [i, wort] of woerter.entries()) {
        const fremd = byId.get(toId(wort))
        if (fremd && fremd.lemma !== wort) {
          logger.warn(`Tag ${datum}: „${wort}“ nicht gespeichert, Kennung „${fremd.id}“ gehört zu „${fremd.lemma}“`)
          throw kollisionsFehler(fremd, i)
        }
      }
    }

    const lemmaEntries = []
    const ids = []

    for (const [i, wort] of woerter.entries()) {
      const pos = (positionen?.[i] || 'Substantiv')
      logger.info(`Lade Wortprofil-Daten für „${wort}“ (${pos}) …`)
      const entry = await fetchLemma(wort, pos)
      entry.notiz = notizen[i] || ''
      entry.link = links[i] || ''
      entry.definition = definitionen[i] || ''
      entry.bonusFrage = await fetchBonusQuestion(wort, pos).catch(() => null)

      const { byId } = getLemmataIndex()
      const existing = byId.get(entry.id)
      if (!existing || !existing.ipa || !existing.definitionen?.length) {
        logger.info(`Lade Wiktionary-Daten für „${wort}“ …`)
        const wikt = await fetchWiktionary(wort).catch(() => ({ ipa: '', definitionen: [] }))
        entry.ipa = wikt.ipa
        entry.definitionen = wikt.definitionen
      } else {
        entry.ipa = existing.ipa
        entry.definitionen = existing.definitionen
      }

      if (existing?.lueckenfueller) {
        entry.lueckenfueller = existing.lueckenfueller
      }

      lemmaEntries.push(entry)
      ids.push(entry.id)
    }

    let wzEntry = null
    let zwillingOk = null
    if (Array.isArray(zwilling_paar) && zwilling_paar.length === 2 && zwilling_paar[0] && zwilling_paar[1]) {
      logger.info(`Lade Wort-Zwilling-Daten für „${zwilling_paar[0]}“ / „${zwilling_paar[1]}“ …`)
      try {
        const wz = await fetchWortZwilling(zwilling_paar[0].trim(), zwilling_paar[1].trim(), zwilling_pos)
        if (wz) {
          wzEntry = { ...wz, notiz: zwilling_notiz || '', link: zwilling_link || '' }
          zwillingOk = true
        } else {
          zwillingOk = false
          logger.warn(`Wort-Zwilling: nicht genug distinkte Kollokatoren für „${zwilling_paar.join(' / ')}“`)
        }
      } catch (err) {
        zwillingOk = false
        logger.error({ err }, 'Wort-Zwilling-Fehler')
      }
    }

    let zwEntry = null
    let zeitenwendeOk = null
    if (zeitenwende_lemma?.trim()) {
      logger.info(`Lade Zeitenwende-Daten für „${zeitenwende_lemma}“ …`)
      try {
        const zw = await fetchZeitenwende(zeitenwende_lemma.trim())
        if (zw) {
          zwEntry = { ...zw, notiz: zeitenwende_notiz || '', link: zeitenwende_link || '' }
          zeitenwendeOk = true
          logger.info(`Zeitenwende geladen: ${zw.words.length} Wörter für „${zw.lemma}“`)
        } else {
          zeitenwendeOk = false
          logger.warn(`Zeitenwende: nicht genug distinkte Kollokatoren für „${zeitenwende_lemma}“`)
        }
      } catch (err) {
        zeitenwendeOk = false
        logger.error({ err }, 'Zeitenwende-Fehler')
      }
    }

    // Lückenfüller-Runden fehlen bei neuen Wörtern — gleich mit erzeugen,
    // sonst bleibt der Modus für den Tag leer (siehe lueckenfuellerAutoGen.js).
    // Scheitert der Bau, wird der Tag trotzdem gespeichert, wie bei Zwilling
    // und Zeitenwende; die Antwort meldet es.
    // Das Formular schickt das Wort, ältere Aufrufer (Entwurfs-Postfach, Altdaten)
    // die Kennung; gespeichert wird immer die Kennung.
    // Die bisher für diesen Tag gespeicherte Kennung hat Vorrang, wenn ihr Lemma so heißt wie die Eingabe.
    const bisherigerEintrag = loadDailyContentMaps().kalender[datum]
    const zuordnung = ermittleLueckenfuellerId({
      eingabe: body.lueckenfueller_id,
      lemmaEntries,
      getLemmataIndex,
      toId,
      bisherigeKennung: Array.isArray(bisherigerEintrag) ? '' : (bisherigerEintrag?.lueckenfueller_id ?? ''),
    })
    const lueckenfuellerKennung = zuordnung.kennung
    let lueckenfuellerStatus = null
    if (zuordnung.mehrdeutig) {
      // Die aus dem Wort abgeleitete Kennung gehört schon zu einem Lemma mit anderem Namen:
      // nichts übernehmen (weder anlegen noch zuordnen), der Tag wird trotzdem gespeichert.
      lueckenfuellerStatus = 'mehrdeutig'
      logger.warn(`Lückenfüller „${String(body.lueckenfueller_id).trim()}“: Kennung gehört zu einem anderen Wort, nicht übernommen`)
    }
    try {
      const lf = zuordnung.mehrdeutig ? { status: 'mehrdeutig' } : await ergaenzeLueckenfueller({
        lueckenfuellerId: lueckenfuellerKennung,
        lemmaEntries,
        weitereWoerter: [...(Array.isArray(zwilling_paar) ? zwilling_paar : []), zeitenwende_lemma],
        getLemmataIndex,
        buildLueckenfueller,
        resolveCandidate: resolveLueckenfuellerCandidate,
        fetchLemma,
        toId,
      })
      lueckenfuellerStatus = lf.status
      if (lf.lemma) {
        const index = lemmaEntries.findIndex((entry) => entry.id === lf.lemma.id)
        if (index >= 0) lemmaEntries[index] = lf.lemma
        else lemmaEntries.push(lf.lemma)
        logger.info(`Lückenfüller erzeugt für „${lf.lemma.lemma}“ (${lf.id}): ${lf.runden} Runden`)
      } else if (lf.status && lf.status !== 'vorhanden' && lf.status !== 'mehrdeutig') {
        logger.warn(`Lückenfüller „${lueckenfuellerKennung}“: ${lf.status}`)
      }
    } catch (err) {
      lueckenfuellerStatus = 'fehler'
      logger.error({ err }, 'Lückenfüller-Fehler')
    }
    const lueckenfuellerOk = lueckenfuellerStatus === null
      ? null
      : lueckenfuellerStatus === 'vorhanden' || lueckenfuellerStatus === 'erzeugt'

    // ── Phase 2: Alles in einer DB-Transaktion atomar schreiben ────
    saveTagAtomically({
      datum,
      lemmaEntries,
      kalenderEntry: {
        ids,
        thema: thema || '',
        thema_kurz: thema_kurz || '',
        thema_quelle: thema_quelle || '',
        lueckenfueller_id: lueckenfuellerKennung,
      },
      wzEntry,
      zwEntry,
    })

    logger.info(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)

    auditCreate('kalender', datum, { ids, woerter, zwilling: !!zwilling_paar?.[0], zeitenwende: !!zeitenwende_lemma }, {
      adminKey: adminSessionId || 'unknown',
      ip,
    })

    return {
      ok: true, datum, ids, zwillingOk, zeitenwendeOk,
      lueckenfuellerId: lueckenfuellerKennung || null, lueckenfuellerOk, lueckenfuellerStatus,
    }
  }

  router.post('/admin/tag', adminLimiter, requireAuth, validate(adminTagSchema), async (req, res) => {
    try {
      res.json(await speichereTag(req.body, { adminSessionId: req.adminSessionId, ip: req.ip }))
    } catch (err) {
      if (err?.kollision) return antworteMitKollision(res, err)
      serverError(res, err)
    }
  })

  // ── Entwurfs-Postfach: Vorschläge, die per API-Schlüssel hereinkommen ──
  // Hier nur die Admin-Seite (Session-Login). Übernehmen nutzt speichereTag(),
  // also exakt denselben Weg wie das Formular inklusive Lückenfüller-Erzeugung.

  router.get('/admin/entwuerfe', adminLimiter, requireAuth, (_req, res) => {
    try {
      const { kalender } = loadDailyContentMaps()
      const { byId } = getLemmataIndex()
      // Steht am Datum schon ein Eintrag, ersetzt Übernehmen ihn — das Panel warnt.
      const entwuerfe = ladeOffeneEntwuerfe().map((entwurf) => {
        const eintrag = kalender[entwurf.datum]
        if (!eintrag) return { ...entwurf, belegt: null }
        const ids = Array.isArray(eintrag) ? eintrag : (eintrag.ids ?? [])
        return { ...entwurf, belegt: { woerter: ids.map((id) => byId.get(id)?.lemma || id) } }
      })
      res.json({ entwuerfe })
    } catch (err) {
      serverError(res, err)
    }
  })

  router.post('/admin/entwuerfe/:id/uebernehmen', adminLimiter, requireAuth, validate(adminEntwurfIdParamsSchema, 'params'), async (req, res) => {
    const { id } = req.params
    const schluessel = String(id)
    let reserviert = false
    try {
      const entwurf = ladeEntwurf(id)
      if (!entwurf) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      if (entwurf.status !== 'offen') return res.status(409).json({ error: 'Entwurf ist bereits abgeschlossen' })
      if (laufendeUebernahmen.has(schluessel)) return res.status(409).json({ error: 'Entwurf wird gerade übernommen' })

      // Erneut prüfen: Das Speicherformat kann sich seit dem Push geändert haben.
      const parsed = adminTagSchema.safeParse(entwurf.tag)
      if (!parsed.success) return res.status(422).json({ error: 'Entwurf passt nicht mehr zum Speicherformat' })

      // Erst speichern, dann abschließen: Scheitert das Speichern, bleibt der
      // Entwurf offen und kann erneut übernommen werden.
      // Reservieren und speichereTag() starten ohne await dazwischen.
      laufendeUebernahmen.add(schluessel)
      reserviert = true
      const ergebnis = await speichereTag(parsed.data, { adminSessionId: req.adminSessionId, ip: req.ip })
      // false heißt: Der Entwurf wurde während des Speicherns ersetzt (neuer Push
      // für dasselbe Datum). Der Tag ist trotzdem gespeichert.
      if (!entscheideEntwurf(id, 'uebernommen')) {
        logger.warn({ entwurfId: id, datum: entwurf.datum }, 'Entwurf beim Abschließen nicht mehr offen')
      }
      res.json({ ...ergebnis, entwurfId: id })
    } catch (err) {
      // Entwurf bleibt offen (entscheideEntwurf wurde nicht erreicht); der Fehler steht am Vorschlag.
      if (err?.kollision) return antworteMitKollision(res, err)
      serverError(res, err)
    } finally {
      if (reserviert) laufendeUebernahmen.delete(schluessel)
    }
  })

  router.post('/admin/entwuerfe/:id/verwerfen', adminLimiter, requireAuth, validate(adminEntwurfIdParamsSchema, 'params'), (req, res) => {
    const { id } = req.params
    try {
      const entwurf = ladeEntwurf(id)
      if (!entwurf) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      // Sonst stünde der Tag nach dem laufenden Speichern im Kalender, der Entwurf aber als verworfen.
      if (laufendeUebernahmen.has(String(id))) return res.status(409).json({ error: 'Entwurf wird gerade übernommen' })
      if (!entscheideEntwurf(id, 'verworfen')) return res.status(409).json({ error: 'Entwurf ist bereits abgeschlossen' })

      auditDelete('lemma_entwurf', String(id), { datum: entwurf.datum, woerter: entwurf.tag.woerter }, {
        adminKey: req.adminSessionId || 'unknown',
        ip: req.ip,
      })
      res.json({ ok: true, entwurfId: id })
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
        
        logger.info(`Backfill: Lade Wiktionary-Daten für „${entry.lemma}“ …`)
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

  router.post('/admin/lemma/:id/lueckenfueller', adminLimiter, requireAuth, validate(adminLemmaIdParamsSchema, 'params'), async (req, res) => {
    const { id } = req.params
    try {
      const { byId } = getLemmataIndex()
      const entry = byId.get(id)
      if (!entry) return res.status(404).json({ error: 'Lemma nicht gefunden' })

      const result = await buildLueckenfueller(entry.lemma, entry.pos)
      if (!result) return res.json({ ok: false, reason: 'Nicht genug Material (Pool zu klein oder keine blankbaren Sätze)' })

      stmts.upsertLemma.run(lemmaToRow({ ...entry, lueckenfueller: result }))
      invalidateCache('lemmata.json')

      logger.info(`Lückenfüller gespeichert für „${entry.lemma}“ (${id}): ${result.length} Runden`)
      res.json({ ok: true, lemma: entry.lemma, rounds: result.length, data: result })
    } catch (err) {
      serverError(res, err)
    }
  })

  const LUECKENFUELLER_POS_CANDIDATEN = ['Substantiv', 'Verb', 'Adjektiv']

  // Ermittelt Wortart + buildLueckenfueller-Ergebnis für ein Wort. Existiert
  // bereits ein Lemma dazu, gilt zwingend dessen Wortart (eine ID/Zeile pro
  // Wort). Sonst: ohne Vorgabe alle drei Wortarten testen (analog
  // analyzeKollokationForPos) statt ein POS-Feld in der UI zu erzwingen —
  // Lückenfüller ist nicht mehr an ein vorher über Kollokationen angelegtes
  // Lemma gebunden.
  async function resolveLueckenfuellerCandidate(lemma, existingPos, posParam) {
    const candidates = existingPos ? [existingPos] : posParam ? [posParam] : LUECKENFUELLER_POS_CANDIDATEN
    const attempts = await Promise.all(
      candidates.map((pos) => buildLueckenfueller(lemma, pos).then((result) => ({ pos, result }))),
    )
    return attempts.find((a) => a.result) || attempts[0]
  }

  const zuordneLueckenfuellerLemma = (name) => findeLueckenfuellerLemma({ name, getLemmataIndex, toId })
  router.post('/admin/lueckenfueller/generate', adminLimiter, requireAuth, validate(lueckenfuellerGenerateSchema), async (req, res) => {
    const { lemmaName, pos: posParam } = req.body
    const name = lemmaName.trim()
    try {
      const { lemma: existing, kollision } = zuordneLueckenfuellerLemma(name)
      // Die abgeleitete Kennung gehört schon zu einem Lemma mit anderem Namen: nichts
      // anlegen und nichts überschreiben (sonst ersetzt der Upsert dessen Daten).
      if (kollision) {
        logger.warn(`Runden erzeugen für „${name}“ abgebrochen: ${kollisionsMeldung(kollision)}`)
        return res.json({ ok: false, reason: kollisionsMeldung(kollision) })
      }
      // Bei Eingabe einer Kennung gilt der Name des vorhandenen Lemmas.
      const wort = existing?.lemma ?? name
      const best = await resolveLueckenfuellerCandidate(wort, existing?.pos, posParam)
      if (!best.result) return res.json({ ok: false, reason: 'Nicht genug Material (Pool zu klein oder keine blankbaren Sätze)' })

      let entry = existing
      let neuAngelegt = false
      if (!entry) {
        logger.info(`Lege neues Lemma „${name}“ (${best.pos}) für Lückenfüller an …`)
        entry = await fetchLemma(name, best.pos)
        neuAngelegt = true
      }

      // Ein vorhandenes Lemma bleibt vollständig erhalten, nur die Runden ändern sich.
      stmts.upsertLemma.run(lemmaToRow({ ...entry, lueckenfueller: best.result }))
      invalidateCache('lemmata.json')

      logger.info(`Lückenfüller generiert für „${entry.lemma}“ (${entry.id}): ${best.result.length} Runden${neuAngelegt ? ' — neues Lemma angelegt' : ''}`)
      res.json({ ok: true, lemma: entry.lemma, id: entry.id, pos: entry.pos, rounds: best.result.length, neuAngelegt })
    } catch (err) {
      serverError(res, err)
    }
  })

  // Anzahl der Lückenfüller-Runden, die ein Lemma schon hat (0: kein Lemma oder keine
  // Runden). Rein lesend, nur Lemma-Index im Speicher, keine Korpusabfrage. Gleiche
  // Zuordnung wie Speichern und Erzeugen; das Wort kann auch eine Kennung sein (Altdaten).
  function zaehleVorhandeneRunden(name) {
    const { lemma } = zuordneLueckenfuellerLemma(name)
    return Array.isArray(lemma?.lueckenfueller) ? lemma.lueckenfueller.length : 0
  }

  // Leichte Abfrage vor „Runden erzeugen“: Erzeugen ersetzt vorhandene Runden, die
  // Seite fragt deshalb nur nach, wenn es welche gibt.
  router.get('/admin/lueckenfueller/runden', adminLimiter, requireAuth, validate(analyzeLueckenfuellerQuerySchema, 'query'), (req, res) => {
    try {
      res.json({ vorhandeneRunden: zaehleVorhandeneRunden(req.query.q.trim()) })
    } catch (err) {
      adminError(res, err)
    }
  })

  // Analyse-Endpunkt: prüft Eignung ohne zu speichern — auch für Woerter, die
  // noch kein Lemma haben.
  router.get('/admin/analyze-lueckenfueller', adminLimiter, requireAuth, validate(analyzeLueckenfuellerQuerySchema, 'query'), async (req, res) => {
    const { q: lemmaName, pos: posParam } = req.query
    const name = lemmaName.trim()
    try {
      const { lemma: existing, kollision } = zuordneLueckenfuellerLemma(name)
      if (kollision) return res.json({ ok: false, usable: false, lemma: name, neuesLemma: false, vorhandeneRunden: 0, reason: kollisionsMeldung(kollision) })
      const best = await resolveLueckenfuellerCandidate(existing?.lemma ?? name, existing?.pos, posParam)

      if (!best.result) return res.json({
        ok: false,
        usable: false,
        lemma: name,
        pos: best.pos,
        neuesLemma: !existing,
        vorhandeneRunden: zaehleVorhandeneRunden(name),
        reason: 'Nicht genug Material (Pool zu klein oder keine blankbaren Sätze)',
      })

      res.json({
        ok: true,
        usable: true,
        lemma: name,
        pos: best.pos,
        neuesLemma: !existing,
        vorhandeneRunden: zaehleVorhandeneRunden(name),
        rounds: best.result.length,
        roundTypes: best.result.map(r => r.type),
        preview: best.result.map(r => ({
          type: r.type,
          kollokator: r.kollokator ?? r.sentences?.map(s => s.kollokator).join(' / '),
          punkte: r.punkte,
        })),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/kalender', adminLimiter, requireAuth, (_req, res) => {
    try {
      const { kalender, wortzwilling, zeitenwende } = loadDailyContentMaps()
      const { byId } = getLemmataIndex()
      const result = {}
      for (const [datum, eintrag] of Object.entries(kalender)) {
        const ids = Array.isArray(eintrag) ? eintrag : (eintrag.ids ?? [])
        const lemmata = ids.map((id) => {
          const l = byId.get(id)
          return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
        })
        const wortzwillingEntry = wortzwilling[datum] || null
        const zeitenwendeEntry = zeitenwende[datum] || null
        const lueckenfuellerId = Array.isArray(eintrag) ? '' : (eintrag.lueckenfueller_id ?? '')
        const lueckenfuellerLemma = lueckenfuellerId
          ? (byId.get(lueckenfuellerId) ?? null)
          : null
        const hasLueckenfueller = !!(lueckenfuellerLemma?.lueckenfueller)
        // Thema für die Wochenansicht (Planen › Woche); rein lesend, wie /admin/tag/:datum
        const thema      = Array.isArray(eintrag) ? '' : (eintrag.thema ?? '')
        const thema_kurz = Array.isArray(eintrag) ? '' : (eintrag.thema_kurz ?? '')
        result[datum] = {
          thema,
          thema_kurz,
          lemmata,
          modeGroups: buildModeGroups({
            lemmata,
            wortzwillingEntry,
            zeitenwendeEntry,
            lueckenfuellerLemma: hasLueckenfueller ? lueckenfuellerLemma : null,
          }),
          hasWortZwilling: !!wortzwillingEntry,
          hasZeitenwende: !!zeitenwendeEntry,
          hasLueckenfueller,
        }
      }
      res.json(result)
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
    const { kalender, wortzwilling, zeitenwende } = loadDailyContentMaps()
    const { byId, byLemma } = getLemmataIndex()
    const kalEintrag = kalender[req.params.datum]
    if (!kalEintrag) return res.status(404).json({ error: 'Kein Eintrag' })
    const ids = Array.isArray(kalEintrag) ? kalEintrag : (kalEintrag.ids ?? [])
    const thema             = Array.isArray(kalEintrag) ? '' : (kalEintrag.thema ?? '')
    const thema_kurz        = Array.isArray(kalEintrag) ? '' : (kalEintrag.thema_kurz ?? '')
    const thema_quelle      = Array.isArray(kalEintrag) ? '' : (kalEintrag.thema_quelle ?? '')
    const lueckenfueller_id = Array.isArray(kalEintrag) ? '' : (kalEintrag.lueckenfueller_id ?? '')
    // Das Formular zeigt das Wort statt der Kennung. Auflösung wie im Spielweg
    // (routes/public.js: Kennung, sonst Wortname); fehlt das Lemma, bleibt es leer
    // und die Seite zeigt die Kennung mit einem Hinweis.
    const lueckenfueller_lemma = lueckenfueller_id
      ? (byId.get(lueckenfueller_id)?.lemma ?? byLemma.get(lueckenfueller_id)?.lemma ?? '')
      : ''
    const lemmata = ids.map((id) => byId.get(id)).filter(Boolean)
    const wz = wortzwilling[req.params.datum]
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
      zwilling_paar: wz ? [wz.wortA, wz.wortB] : [],
      zwilling_pos: wz?.pos || 'Substantiv',
      zwilling_notiz: wz?.notiz || '',
      zwilling_link: wz?.link || '',
      zeitenwende_lemma: ze?.lemma || '',
      zeitenwende_notiz: ze?.notiz || '',
      zeitenwende_link: ze?.link || '',
      lueckenfueller_id,
      lueckenfueller_lemma,
    })
  })

  router.delete('/admin/tag/:datum', adminLimiter, requireAuth, async (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
    try {
      const datum = req.params.datum

      const kal = stmts.getKalenderByDatum.get(datum)
      const deletedData = {
        ids: kal,
        wortzwilling: stmts.getWortzwillingByDatum.get(datum) ?? null,
        zeitenwende: stmts.getZeitenwendeByDatum.get(datum) ?? null,
      }

      // Gezielter atomarer Delete statt Full-Map-Replace (D-M2)
      deleteTagsAtomically([datum])

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
