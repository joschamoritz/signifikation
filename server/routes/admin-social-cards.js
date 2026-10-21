import express from 'express'

export function createAdminSocialCardsRouter({
  requireAuth,
  adminLimiter,
  validate,
  adminSocialCardsTagesdataSchema,
  adminSocialCardsBelegeSchema,
  adminSocialCardsEntwuerfeQuerySchema,
  adminSocialCardsEntwurfParamsSchema,
  adminSocialCardsEntwurfPatchSchema,
  loadKalender,
  loadWortZwilling,
  getLemmataIndex,
  fetchBelege,
  ladeEntwuerfe,
  ladeEntwurf,
  setzeCaption,
  setzeStatus,
  erzeugeEntwuerfe,
  erneuereEntwurf,
  bildPfad,
  berlinHeute,
  verschiebeDatum,
  auditUpdate,
  adminError,
  socialCardsPath,
  kartenModulPath,
}) {
  const router = express.Router()
  // Alle Pfade setzt der Server selbst. dotfiles: 'allow', weil send() sonst
  // jeden Pfad mit Punkt-Ordner ablehnt (z. B. Worktrees unter .claude/).
  const DATEI = { dotfiles: 'allow' }

  router.get('/admin/social-cards', requireAuth, (_req, res) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none';"
    )
    res.sendFile(socialCardsPath, DATEI)
  })

  // Zeichenmodul (shared/socialCards.js) für den Editor – dieselbe Datei
  // zeichnet auf dem Server die Entwürfe.
  router.get('/admin/social-cards/karten.js', requireAuth, (_req, res) => {
    res.type('text/javascript').setHeader('Cache-Control', 'no-cache')
    res.sendFile(kartenModulPath, DATEI)
  })

  router.get('/admin/social-cards/tagesdata', adminLimiter, requireAuth, validate(adminSocialCardsTagesdataSchema, 'query'), (req, res) => {
    const { datum } = req.query
    try {
      const kalender = loadKalender()
      const { byId } = getLemmataIndex()
      const wortzwilling = loadWortZwilling()
      const entry = kalender[datum]
      const ids = entry?.ids ?? (Array.isArray(entry) ? entry : [])
      const lemmata = ids.map((id) => {
        const l = byId.get(id)
        if (!l) return null
        return {
          id: l.id,
          lemma: l.lemma,
          pos: l.pos,
          ipa: l.ipa || '',
          definitionen: Array.isArray(l.definitionen) ? l.definitionen : [],
        }
      }).filter(Boolean)
      const wz = wortzwilling[datum] ?? null
      res.json({ datum, lemmata, wortzwilling: wz })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/social-cards/belege', adminLimiter, requireAuth, validate(adminSocialCardsBelegeSchema, 'query'), (req, res) => {
    const { lemma, collocate } = req.query
    try {
      const belege = fetchBelege(lemma, collocate, { limit: 5 })
      res.json({ belege })
    } catch (err) {
      adminError(res, err)
    }
  })

  // ── Postfach: automatisch erzeugte Entwürfe (Stufe 1, ohne Veröffentlichen) ──

  const ohneBildpfad = ({ bild: _bild, ...e }) => ({ ...e, bildUrl: `/admin/social-cards/entwuerfe/${e.id}/bild?v=${encodeURIComponent(e.aktualisiertAm)}` })

  router.get('/admin/social-cards/entwuerfe', adminLimiter, requireAuth, validate(adminSocialCardsEntwuerfeQuerySchema, 'query'), (req, res) => {
    try {
      const heute = berlinHeute()
      const von = req.query.von ?? heute
      const bis = req.query.bis ?? verschiebeDatum(heute, 14)
      res.json({ von, bis, entwuerfe: ladeEntwuerfe(von, bis).map(ohneBildpfad) })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/social-cards/entwuerfe/erzeugen', adminLimiter, requireAuth, async (_req, res) => {
    try {
      res.json(await erzeugeEntwuerfe())
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/social-cards/entwuerfe/:id/bild', adminLimiter, requireAuth, validate(adminSocialCardsEntwurfParamsSchema, 'params'), async (req, res) => {
    try {
      const entwurf = ladeEntwurf(req.params.id)
      if (!entwurf) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      const pfad = await bildPfad(entwurf)
      res.setHeader('Cache-Control', 'private, max-age=3600')
      if (req.query.download !== undefined) {
        res.attachment(`signifikation-${entwurf.datum}-${entwurf.slot}.png`)
      }
      res.sendFile(pfad, DATEI)
    } catch (err) {
      adminError(res, err)
    }
  })

  // POST statt PATCH: csrfProtect prüft nur POST/PUT/DELETE
  router.post('/admin/social-cards/entwuerfe/:id',adminLimiter, requireAuth, validate(adminSocialCardsEntwurfParamsSchema, 'params'), validate(adminSocialCardsEntwurfPatchSchema), (req, res) => {
    const { id } = req.params
    const { caption, status } = req.body
    try {
      const vorher = ladeEntwurf(id)
      if (!vorher) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      if (caption !== undefined && !setzeCaption(id, caption)) {
        return res.status(409).json({ error: 'Caption lässt sich nur bei offenen Entwürfen ändern' })
      }
      if (status !== undefined) setzeStatus(id, status)
      const nachher = ladeEntwurf(id)
      auditUpdate('social_card_entwurf', String(id),
        { status: vorher.status, caption: vorher.caption },
        { status: nachher.status, caption: nachher.caption },
        { adminKey: req.adminSessionId || 'unknown', ip: req.ip })
      res.json({ entwurf: ohneBildpfad(nachher) })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/social-cards/entwuerfe/:id/neu', adminLimiter, requireAuth, validate(adminSocialCardsEntwurfParamsSchema, 'params'), async (req, res) => {
    try {
      const entwurf = ladeEntwurf(req.params.id)
      if (!entwurf) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      const { ok, grund } = await erneuereEntwurf(entwurf)
      if (!ok) return res.status(409).json({ error: grund })
      res.json({ ok: true })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
