import express from 'express'
import { zeichenZahl, BLUESKY_MAX_ZEICHEN } from '../../shared/socialCards.js'

export function createAdminSocialCardsRouter({
  requireAuth,
  adminLimiter,
  adminBildLimiter,
  validate,
  adminSocialCardsTagesdataSchema,
  adminSocialCardsBelegeSchema,
  adminSocialCardsEntwuerfeQuerySchema,
  adminSocialCardsEntwurfParamsSchema,
  adminSocialCardsEntwurfPatchSchema,
  adminSocialCardsEigenSchema,
  loadKalender,
  loadWortZwilling,
  getLemmataIndex,
  fetchBelege,
  ladeEntwuerfe,
  ladeEntwurf,
  setzeCaption,
  setzeStatus,
  // Veröffentlichte Beiträge (Stufe 2); ohne Angabe: noch nichts gepostet
  ladePost = () => null,
  ladePostsFuer = () => new Map(),
  webUrl = () => null,
  erzeugeEntwuerfe,
  erneuereEntwurf,
  legeEigenenEntwurfAb,
  bildPfad,
  berlinHeute,
  verschiebeDatum,
  auditCreate,
  auditUpdate,
  adminError,
  entwurfEinstellungen,
  kartenModulPath,
}) {
  const router = express.Router()
  // Alle Pfade setzt der Server selbst. dotfiles: 'allow', weil send() sonst
  // jeden Pfad mit Punkt-Ordner ablehnt (z. B. Worktrees unter .claude/).
  const DATEI = { dotfiles: 'allow' }

  // Alte Adresse der eigenständigen Seite: Lesezeichen führen in den Admin. Ohne Anmeldung, weil
  // die Weiterleitung nichts verrät – die Admin-Seite meldet selbst an.
  router.get('/admin/social-cards', (_req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.redirect(302, '/admin#werkzeuge/social-cards')
  })

  // Zeichenmodul (shared/socialCards.js) – dieselbe Datei zeichnet auf dem Server die Entwürfe
  // und im Admin (dynamischer Import) die Vorschau von „Selbst gestalten“. Nur mit Anmeldung;
  // no-cache = bei jedem Aufruf per ETag prüfen, nach einem Deploy also sofort aktuell. Der Limiter
  // steht vor der Anmeldeprüfung, damit auch unangemeldete Abrufe gezählt werden.
  router.get('/admin/social-cards/karten.js', adminBildLimiter, requireAuth, (_req, res) => {
    res.type('text/javascript').setHeader('Cache-Control', 'private, no-cache')
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

  // ── Postfach: automatisch erzeugte Entwürfe, freigegebene gehen auf Bluesky ──

  const istText = (e) => e.spec?.format === 'text'
  // Veröffentlichter Beitrag zu einem Entwurf, so wie die Admin-Ansicht ihn braucht
  const mitPost = (e, post) => ({
    ...ohneBildpfad(e),
    gepostet: post?.uri ? { gepostetAm: post.gepostetAm, url: webUrl(post.uri) } : null,
    ...(post && !post.uri && post.fehler && { postFehler: { versuche: post.versuche, fehler: post.fehler } }),
  })
  const schonGepostet = (id) => !!ladePost(id)?.uri
  const GEPOSTET = 'Schon auf Bluesky veröffentlicht – Änderungen nur dort.'
  const ohneBildpfad = ({ bild: _bild, ...e }) => {
    const basis = `/admin/social-cards/entwuerfe/${e.id}/bild`
    const v = `v=${encodeURIComponent(e.aktualisiertAm)}`
    return {
      ...e,
      bildUrl: istText(e) ? null : `${basis}?${v}`,
      // Kleine Vorschau für die Liste; fehlt sie noch, liefert dieselbe Adresse die volle Fassung
      bildKleinUrl: istText(e) ? null : `${basis}?groesse=klein&${v}`,
    }
  }

  // Zeichenzahl wie Bluesky: Text, Leerzeile, Hashtags
  const postZeichen = (caption, hashtags) => zeichenZahl(hashtags ? `${caption}\n\n${hashtags}` : caption)

  router.get('/admin/social-cards/entwuerfe', adminLimiter, requireAuth, validate(adminSocialCardsEntwuerfeQuerySchema, 'query'), (req, res) => {
    try {
      const heute = berlinHeute()
      const von = req.query.von ?? heute
      const bis = req.query.bis ?? verschiebeDatum(heute, 14)
      res.json({
        von, bis,
        entwuerfe: (() => {
          const posts = ladePostsFuer(von, bis)
          return ladeEntwuerfe(von, bis).map((e) => mitPost(e, posts.get(e.id)))
        })(),
        ...entwurfEinstellungen(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  // „Als Entwurf ablegen“ aus dem Editor: eigener Platz je Tag neben dem Wochenplan, bei Rätsel und Beleg auf Wunsch
  // mit Auflösung am Folgetag. Ein belegter Platz wird nur mit `ersetzen` überschrieben (und nur, solange er offen ist).
  router.post('/admin/social-cards/entwuerfe/eigen', adminLimiter, requireAuth, validate(adminSocialCardsEigenSchema, 'body', { mitFeld: true }), async (req, res) => {
    const { datum, spec, caption, hashtags, mitAufloesung, ersetzen } = req.body
    try {
      if (datum < berlinHeute()) return res.status(400).json({ error: 'Der Tag liegt in der Vergangenheit.', feld: 'datum' })
      const r = await legeEigenenEntwurfAb({ datum, spec, caption, hashtags, mitAufloesung }, { ersetzen })
      if (!r.ok) {
        const wann = r.belegt.datum === datum ? 'diesen Tag' : 'den Folgetag (Auflösung)'
        return res.status(409).json(r.ersetzbar
          ? { error: `Für ${wann} gibt es schon einen eigenen Entwurf.`, ersetzbar: true }
          : { error: `Für ${wann} gibt es schon einen eigenen Entwurf, der ${r.belegt.status === 'offen' ? 'veröffentlicht' : r.belegt.status} ist.` })
      }
      for (const e of r.entwuerfe) {
        auditCreate('social_card_entwurf', String(e.id), { datum: e.datum, slot: e.slot, format: spec.format, eigen: true, ersetzt: ersetzen },
          { adminKey: req.adminSessionId || 'unknown', ip: req.ip })
      }
      res.json(r)
    } catch (err) {
      if (err?.status === 400) return res.status(400).json({ error: err.message })
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

  router.get('/admin/social-cards/entwuerfe/:id/bild', adminBildLimiter, requireAuth, validate(adminSocialCardsEntwurfParamsSchema, 'params'), async (req, res) => {
    try {
      const entwurf = ladeEntwurf(req.params.id)
      if (!entwurf) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      if (istText(entwurf)) return res.status(404).json({ error: 'Textbeitrag ohne Bild' })
      const klein = req.query.groesse === 'klein' && req.query.download === undefined
      const pfad = await bildPfad(entwurf, { groesse: klein ? 'klein' : 'gross' })
      if (!pfad) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      // Fehlt die Vorschau noch, kommt die volle Fassung – dann nicht lange zwischenspeichern
      const ersatz = klein && !pfad.endsWith('-klein.png')
      res.setHeader('Cache-Control', ersatz ? 'private, max-age=60' : 'private, max-age=3600')
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
      // Was schon auf Bluesky steht, lässt sich hier weder ändern noch zurücknehmen
      if (schonGepostet(id)) return res.status(409).json({ error: GEPOSTET })
      if (status === 'freigegeben') {
        // Bluesky lehnt Beiträge über 300 Zeichen ab – gezählt wird, was gepostet würde
        const zuviel = postZeichen(caption ?? vorher.caption, vorher.hashtags) - BLUESKY_MAX_ZEICHEN
        if (zuviel > 0) return res.status(409).json({ error: `Zu lang für Bluesky: ${zuviel} Zeichen kürzen.` })
      }
      if (caption !== undefined && !setzeCaption(id, caption)) {
        return res.status(409).json({ error: 'Caption lässt sich nur bei offenen Entwürfen ändern' })
      }
      if (status !== undefined) setzeStatus(id, status)
      const nachher = ladeEntwurf(id)
      auditUpdate('social_card_entwurf', String(id),
        { status: vorher.status, caption: vorher.caption },
        { status: nachher.status, caption: nachher.caption },
        { adminKey: req.adminSessionId || 'unknown', ip: req.ip })
      res.json({ entwurf: mitPost(nachher, ladePost(id)) })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/social-cards/entwuerfe/:id/neu', adminLimiter, requireAuth, validate(adminSocialCardsEntwurfParamsSchema, 'params'), async (req, res) => {
    try {
      const entwurf = ladeEntwurf(req.params.id)
      if (!entwurf) return res.status(404).json({ error: 'Entwurf nicht gefunden' })
      if (schonGepostet(entwurf.id)) return res.status(409).json({ error: GEPOSTET })
      const { ok, grund, ersetzt = [], bildFehlt = false } = await erneuereEntwurf(entwurf)
      if (!ok) return res.status(409).json({ error: grund })
      // Der alte Text beider Entwürfe geht verloren – das Protokoll hält ihn fest
      for (const e of ersetzt) {
        auditUpdate('social_card_entwurf', String(e.id),
          { caption: e.vorher?.caption ?? null, hashtags: e.vorher?.hashtags ?? null },
          { caption: e.nachher.caption, hashtags: e.nachher.hashtags, neuErstellt: true },
          { adminKey: req.adminSessionId || 'unknown', ip: req.ip })
      }
      // bildFehlt: Der Text ist neu, nur das Bild ließ sich nicht zeichnen (kommt beim nächsten Abruf/Lauf)
      res.json({ ok: true, ersetzt: ersetzt.map((e) => e.id), ...(bildFehlt && { bildFehlt: true }) })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
