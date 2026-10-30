import express from 'express'
import { isoWocheSpanne } from '../date-utils.js'
import { findeLueckenfuellerLemma } from '../lueckenfuellerAutoGen.js'

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

/** Alle gespeicherten Felder eines Eintrags für das Änderungsprotokoll (vorher/nachher). */
function protokollFelder(e) {
  return {
    von: e.von, bis: e.bis, lemma: e.lemma_id,
    zwilling_partner: e.zwilling_partner ?? '', zwilling_pos: e.zwilling_pos ?? 'Substantiv',
    zwilling_kollokatoren: e.zwilling_kollokatoren ?? [],
    zeitenwende_notiz: e.zeitenwende_notiz ?? '', zeitenwende_link: e.zeitenwende_link ?? '',
    lueckenfueller_id: e.lueckenfueller_id ?? '', notiz: e.notiz ?? '', link: e.link ?? '',
  }
}

/** Anzeigename: wie die App das Wort der Woche zeigt (erster Buchstabe groß). */
const anzeigeName = (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : '')

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
  lemmaExistsInWortprofil,
  fetchWortZwilling,
  buildLueckenfueller,
  fetchLemma,
  speichereLemma,
  toId,
  auditCreate,
  auditUpdate,
  auditDelete,
  adminError,
  serverError,
  logger,
}) {
  const router = express.Router()

  /** Name des Wortes der Woche für die Anzeige (Lemma aus dem Index, sonst die großgeschriebene Kennung). */
  function lemmaName(lemmaId) {
    const { byId, byLemma } = getLemmataIndex()
    return (byLemma.get(lemmaId) ?? byId.get(lemmaId))?.lemma ?? anzeigeName(lemmaId)
  }

  /** Eintrag für die Seite: mit Anzeigenamen für Wort und Lückenfüller-Wort */
  function fuerAnzeige(r) {
    const { byId } = getLemmataIndex()
    return {
      ...r,
      lemmaName: lemmaName(r.lemma_id),
      lueckenfuellerName: r.lueckenfueller_id ? (byId.get(r.lueckenfueller_id)?.lemma ?? anzeigeName(r.lueckenfueller_id)) : '',
    }
  }

  /**
   * Das Lückenfüller-Wort der Woche muss schon erzeugte Runden haben, sonst fällt der Lückenfüller in der
   * App still weg (routes/public.js). Wort oder Kennung → Lemma mit Runden; gespeichert wird die Kennung.
   */
  function findeLueckenfuellerMitRunden(eingabe) {
    const { byId, byLemma } = getLemmataIndex()
    const gross = anzeigeName(eingabe)
    const kandidaten = [
      byLemma.get(eingabe), byId.get(eingabe), byLemma.get(gross), byId.get(toId(eingabe)),
    ]
    return kandidaten.find((l) => l?.lueckenfueller) ?? null
  }

  /** GET /admin/spezialwochen – alle Einträge sortiert nach von DESC */
  router.get('/admin/spezialwochen', adminLimiter, requireAuth, (req, res) => {
    try {
      res.json({ entries: loadAllSpezialwochen().map(fuerAnzeige) })
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
        if (!wz) return res.json({ usable: false, wortA: a, wortB: b, kollokatoren: [] })
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
        res.json({ entry: fuerAnzeige(entry) })
      } catch (err) {
        adminError(res, 500, 'Spezialwoche konnte nicht geladen werden', err)
      }
    }
  )

  /**
   * POST /admin/spezialwoche – Anlegen oder Überschreiben.
   *
   * Von und Bis rechnet der Server aus der ISO-Woche (Montag–Sonntag); mitgeschickte Werte werden ignoriert.
   * Wenn zwilling_partner gesetzt ist, wird fetchWortZwilling() aufgerufen und die Kollokatoren werden
   * gespeichert. Ist das Paar nicht geeignet, wird nichts gespeichert (422): Die App zeigt ein Paar sonst an,
   * obwohl das Spiel keine Wörter hat.
   *
   * Lückenfüller wie beim Tag (lueckenfuellerAutoGen.js): Ist das Wort das Wort der Woche oder Wort B und hat
   * noch keine Runden, entstehen sie beim Speichern. Für jedes andere Wort braucht es vorher „Runden erzeugen“.
   * Vorhandene Runden werden nie neu gebaut, sie können schon an Tagen gespielt worden sein.
   */
  router.post('/admin/spezialwoche', adminLimiter, requireAuth,
    validate(adminSpezialwocheSchema, 'body', { mitFeld: true }),
    async (req, res) => {
      const {
        woche,
        zwilling_partner, zwilling_pos,
        zeitenwende_notiz, zeitenwende_link,
        notiz, link,
      } = req.body

      const spanne = isoWocheSpanne(woche)
      if (!spanne) return res.status(400).json({ error: `Die Woche ${woche} gibt es nicht.` })
      const { von, bis } = spanne

      // Lemmata sind in der DB kleingeschrieben – normalisieren
      const lemma_id = req.body.lemma_id.trim().toLowerCase()
      const lfEingabe = (req.body.lueckenfueller_id || '').trim()

      // Lemmata direkt in wortprofil.db prüfen (nicht Kalender-Index)
      if (!lemmaExistsInWortprofil(lemma_id)) {
        return res.status(404).json({ error: `„${lemma_id}“: Nicht geeignet, keine Kollokatoren im Korpus.`, feld: 'lemma_id' })
      }

      let lueckenfueller_id = ''
      // Wort der Woche oder Wort B ohne Runden: Runden entstehen weiter unten, nach der Zwilling-Prüfung
      let lfNeu = ''
      if (lfEingabe) {
        if (!lemmaExistsInWortprofil(lfEingabe.toLowerCase())) {
          return res.status(404).json({ error: `Nicht genug Material für „${lfEingabe}“: zu wenige Kollokatoren oder keine Belegsätze, in denen sich eine Lücke setzen lässt.`, feld: 'lueckenfueller_id' })
        }
        const lf = findeLueckenfuellerMitRunden(lfEingabe)
        if (lf) {
          lueckenfueller_id = lf.id
        } else {
          lfNeu = [anzeigeName(lemma_id), zwilling_partner].find((wort) => wort && toId(wort) === toId(lfEingabe)) ?? ''
          if (!lfNeu) {
            return res.status(422).json({ error: `„${lfEingabe}“ hat noch keine Lückenfüller-Runden. Beim Speichern entstehen sie nur für das Wort der Woche und Wort B; für ein anderes Wort vorher unter Tag bearbeiten › Lückenfüller › Runden erzeugen anlegen oder das Feld leeren.`, feld: 'lueckenfueller_id' })
          }
          const { kollision } = findeLueckenfuellerLemma({ name: lfNeu, getLemmataIndex, toId })
          if (kollision) {
            return res.status(422).json({ error: `„${lfNeu}“: Die Kennung „${kollision.id}“ gehört schon zum Wort „${kollision.lemma}“. Runden werden nicht angelegt, Feld leeren.`, feld: 'lueckenfueller_id' })
          }
        }
      }

      let zwilling_kollokatoren = []
      let wzFehler = false

      // Wenn ein Zwillingspartner angegeben ist, Kollokatoren berechnen
      if (zwilling_partner) {
        try {
          logger.info({ lemmaA: lemma_id, lemmaB: zwilling_partner, pos: zwilling_pos },
            'Spezialwoche: WortZwilling-Kollokatoren abrufen')
          const wz = await fetchWortZwilling(lemma_id, zwilling_partner, zwilling_pos)
          if (wz) {
            zwilling_kollokatoren = wz.kollokatoren
          } else {
            logger.warn({ lemmaA: lemma_id, lemmaB: zwilling_partner },
              'Spezialwoche: Nicht genug Kollokatoren – nicht gespeichert')
            return res.status(422).json({
              error: `„${anzeigeName(lemma_id)}“ und „${zwilling_partner}“ sind als Wort-Zwilling nicht geeignet (zu wenige eigene Kollokatoren). Anderes Wort B wählen oder das Feld leeren.`,
              feld: 'zwilling_partner',
            })
          }
        } catch (err) {
          // Ein Abruffehler (Datenbank, Zeitüberschreitung) ist kein Urteil über das Paar: Eintrag ohne
          // Wort-Zwilling speichern, aber der Seite sagen, dass er fehlt.
          logger.error({ err }, 'Spezialwoche: Fehler beim WZ-Abruf')
          wzFehler = true
        }
      }

      let lfRunden = 0
      let lfFehler = false
      if (lfNeu) {
        const { lemma: bestehend } = findeLueckenfuellerLemma({ name: lfNeu, getLemmataIndex, toId })
        // Das Wort der Woche ist immer ein Substantiv (routes/public.js), Wort B hat die Wortart des Paars
        const pos = bestehend?.pos || (lfNeu === anzeigeName(lemma_id) ? 'Substantiv' : zwilling_pos)
        try {
          const runden = await buildLueckenfueller(bestehend?.lemma ?? lfNeu, pos)
          const basis = runden ? (bestehend ?? await fetchLemma(lfNeu, pos)) : null
          if (!basis) {
            return res.status(422).json({ error: `Nicht genug Material für „${lfNeu}“: zu wenige Kollokatoren oder keine Belegsätze, in denen sich eine Lücke setzen lässt.`, feld: 'lueckenfueller_id' })
          }
          // Ein vorhandenes Lemma bleibt vollständig erhalten, nur die Runden kommen dazu
          speichereLemma({ ...basis, lueckenfueller: runden })
          lueckenfueller_id = basis.id
          lfRunden = runden.length
          logger.info({ woche, lemma: basis.lemma, runden: lfRunden }, 'Spezialwoche: Lückenfüller-Runden erzeugt')
        } catch (err) {
          // Wie beim Wort-Zwilling: Ein Abruffehler ist kein Urteil über das Wort. Ohne Lückenfüller
          // speichern und der Seite sagen, dass er fehlt.
          logger.error({ err }, 'Spezialwoche: Fehler beim Erzeugen der Lückenfüller-Runden')
          lfFehler = true
        }
      }

      try {
        const vorher = loadSpezialwocheByWoche(woche)
        const ersetzt = !!vorher
        const neu = {
          woche, von, bis, lemma_id,
          zwilling_partner: wzFehler ? '' : zwilling_partner, zwilling_pos,
          zwilling_kollokatoren,
          zeitenwende_notiz, zeitenwende_link,
          lueckenfueller_id, notiz, link,
        }
        saveSpezialwoche(neu)

        const wer = { adminKey: req.adminSessionId || 'unknown', ip: req.ip }
        if (ersetzt) auditUpdate?.('spezialwoche', woche, protokollFelder(vorher), protokollFelder(neu), wer)
        else auditCreate?.('spezialwoche', woche, protokollFelder(neu), wer)

        logger.info({ woche, lemma: lemma_id }, 'Spezialwoche gespeichert')
        res.json({
          ok: true,
          woche,
          von,
          bis,
          ersetzt,
          lemmaName: anzeigeName(lemma_id),
          wzKollokatoren: zwilling_kollokatoren.length,
          ...(wzFehler ? { wzFehler: true } : {}),
          ...(lfRunden ? { lfRunden } : {}),
          ...(lfFehler ? { lfFehler: true } : {}),
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
        auditDelete?.('spezialwoche', woche, protokollFelder(existing), { adminKey: req.adminSessionId || 'unknown', ip: req.ip })
        logger.info({ woche }, 'Spezialwoche gelöscht')
        res.json({ ok: true })
      } catch (err) {
        serverError(res, err)
      }
    }
  )

  return router
}
