import express from 'express'

/**
 * Admin-Router für Spezialwochen (Wort der Woche).
 *
 * Endpunkte:
 *   GET    /admin/spezialwochen           – Alle Einträge (Liste)
 *   GET    /admin/spezialwoche/:woche     – Einzelner Eintrag
 *   POST   /admin/spezialwoche            – Anlegen / Überschreiben
 *   DELETE /admin/spezialwoche/:woche     – Löschen
 *   GET    /admin/spezialwoche/preview    – WZ-Vorschau (ohne Speichern)
 */
export function createAdminSpezialwocheRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminSpezialwocheSchema,
  adminSpezialwocheParamsSchema,
  analyzeWZQuerySchema,
  loadAllSpezialwochen,
  loadSpezialwocheByWoche,
  saveSpezialwoche,
  deleteSpezialwoche,
  getLemmataIndex,
  fetchWortZwilling,
  auditCreate,
  auditDelete,
  adminError,
  serverError,
  logger,
}) {
  const router = express.Router()

  /** GET /admin/spezialwochen – alle Einträge sortiert nach von DESC */
  router.get('/admin/spezialwochen', adminLimiter, requireAuth, (req, res) => {
    try {
      const { byId, byLemma } = getLemmataIndex()
      const rows = loadAllSpezialwochen()
      const result = rows.map(r => ({
        ...r,
        lemmaName: (byLemma.get(r.lemma_id) ?? byId.get(r.lemma_id))?.lemma ?? r.lemma_id,
      }))
      res.json({ entries: result })
    } catch (err) {
      adminError(res, 500, 'Spezialwochen konnten nicht geladen werden', err)
    }
  })

  /**
   * GET /admin/spezialwoche/preview-wz?a=&b=&pos= – WZ-Vorschau ohne Speichern.
   * Muss VOR /:woche stehen, sonst matched Express "preview-wz" als Woche-Param.
   */
  router.get('/admin/spezialwoche/preview-wz', adminLimiter, requireAuth,
    validate(analyzeWZQuerySchema, 'query'),
    async (req, res) => {
      const { a, b, pos } = req.query
      try {
        const wz = await fetchWortZwilling(a, b, pos)
        if (!wz) return res.json({ usable: false, kollokatoren: [] })
        res.json({ usable: true, ...wz })
      } catch (err) {
        adminError(res, 500, 'WZ-Vorschau fehlgeschlagen', err)
      }
    }
  )

  /** GET /admin/spezialwoche/:woche – einzelner Eintrag */
  router.get('/admin/spezialwoche/:woche', adminLimiter, requireAuth,
    validate(adminSpezialwocheParamsSchema, 'params'),
    (req, res) => {
      try {
        const { woche } = req.params
        const entry = loadSpezialwocheByWoche(woche)
        if (!entry) return res.status(404).json({ error: `Kein Eintrag für ${woche}` })
        const { byId, byLemma } = getLemmataIndex()
        res.json({ entry: { ...entry, lemmaName: (byLemma.get(entry.lemma_id) ?? byId.get(entry.lemma_id))?.lemma ?? entry.lemma_id } })
      } catch (err) {
        adminError(res, 500, 'Spezialwoche konnte nicht geladen werden', err)
      }
    }
  )

  /**
   * POST /admin/spezialwoche – Anlegen oder Überschreiben.
   *
   * Wenn zwilling_partner gesetzt ist, wird automatisch fetchWortZwilling()
   * aufgerufen und die Kollokatoren werden gespeichert.
   */
  router.post('/admin/spezialwoche', adminLimiter, requireAuth,
    validate(adminSpezialwocheSchema),
    async (req, res) => {
      const {
        woche, von, bis, lemma_id,
        zwilling_partner, zwilling_pos,
        zeitenwende_notiz, zeitenwende_link,
        lueckenfueller_id, notiz, link,
      } = req.body

      // Lemma muss in der DB existieren – Suche erst per Lemma-Wort, dann per ID
      const { byId, byLemma } = getLemmataIndex()
      const lemma = byLemma.get(lemma_id) ?? byId.get(lemma_id)
      if (!lemma) {
        return res.status(404).json({ error: `Lemma „${lemma_id}" nicht gefunden` })
      }

      let zwilling_kollokatoren = []

      // Wenn ein Zwillingspartner angegeben ist, Kollokatoren berechnen
      if (zwilling_partner) {
        try {
          logger.info({ lemmaA: lemma.lemma, lemmaB: zwilling_partner, pos: zwilling_pos },
            'Spezialwoche: WortZwilling-Kollokatoren abrufen')
          const wz = await fetchWortZwilling(lemma.lemma, zwilling_partner, zwilling_pos)
          if (wz) {
            zwilling_kollokatoren = wz.kollokatoren
          } else {
            logger.warn({ lemmaA: lemma.lemma, lemmaB: zwilling_partner },
              'Spezialwoche: Nicht genug Kollokatoren – WZ bleibt leer')
          }
        } catch (err) {
          logger.error({ err }, 'Spezialwoche: Fehler beim WZ-Abruf')
          // Nicht abbrechen – Eintrag ohne WZ speichern ist OK
        }
      }

      try {
        saveSpezialwoche({
          woche, von, bis, lemma_id,
          zwilling_partner, zwilling_pos,
          zwilling_kollokatoren,
          zeitenwende_notiz, zeitenwende_link,
          lueckenfueller_id, notiz, link,
        })

        auditCreate?.('spezialwoche', woche, {
          von, bis, lemma: lemma.lemma, zwilling_partner,
        }, req)

        logger.info({ woche, lemma: lemma.lemma }, 'Spezialwoche gespeichert')
        res.json({
          ok: true,
          woche,
          lemmaName: lemma.lemma,
          wzKollokatoren: zwilling_kollokatoren.length,
        })
      } catch (err) {
        serverError(res, err)
      }
    }
  )

  /** DELETE /admin/spezialwoche/:woche */
  router.delete('/admin/spezialwoche/:woche', adminLimiter, requireAuth,
    validate(adminSpezialwocheParamsSchema, 'params'),
    (req, res) => {
      const { woche } = req.params
      try {
        const existing = loadSpezialwocheByWoche(woche)
        if (!existing) return res.status(404).json({ error: `Kein Eintrag für ${woche}` })

        deleteSpezialwoche(woche)
        auditDelete?.('spezialwoche', woche, {}, req)
        logger.info({ woche }, 'Spezialwoche gelöscht')
        res.json({ ok: true })
      } catch (err) {
        serverError(res, err)
      }
    }
  )

  return router
}
