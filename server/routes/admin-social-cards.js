import express from 'express'

export function createAdminSocialCardsRouter({
  requireAuth,
  adminLimiter,
  validate,
  adminSocialCardsTagesdataSchema,
  adminSocialCardsBelegeSchema,
  loadKalender,
  loadWortZwilling,
  getLemmataIndex,
  fetchBelege,
  adminError,
  socialCardsPath,
}) {
  const router = express.Router()

  router.get('/admin/social-cards', requireAuth, (_req, res) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data:; " +
      "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; " +
      "frame-ancestors 'none';"
    )
    res.sendFile(socialCardsPath)
  })

  router.get('/admin/social-cards/tagesdata', adminLimiter, requireAuth, validate(adminSocialCardsTagesdataSchema, 'query'), (req, res) => {
    const { datum } = req.query
    try {
      const kalender = loadKalender()
      const { byId } = getLemmataIndex()
      const wortzwilling = loadWortZwilling()
      const ids = kalender[datum] ?? []
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

  return router
}
