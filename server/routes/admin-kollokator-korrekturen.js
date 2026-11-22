// Admin › Werkzeuge › Kollokator-Korrekturen und Neubau der Kollokationen-Runde einzelner Tage.
//
// Korrekturen: Anlegen, Ändern und Löschen der DB-Einträge über dem Grundbestand aus
// server/kollokatorKorrektur.js (Store: server/kollokatorKorrekturStore.js). Jede Änderung
// steht im audit_log (Ressource `kollokator_korrektur`) und leert die zwischengespeicherte
// Rangfolge der betroffenen Basen.
//
// Neubau: ersetzt nur runden.kollokatoren der Lemmata künftiger Tage (stmts.setKollokatoren,
// kein voller Upsert, der Lückenfüller und andere Felder aus dem In-Memory-Index
// zurückschriebe). Heute, vergangene Tage und Lemmata, die schon an einem gespielten Tag
// vorkamen, bleiben unverändert (planeNeubau, wie scripts/kollokationen-neubau.mjs).
import express from 'express'
import { schluesselFuer } from '../kollokatorKorrektur.js'
import { planeNeubau, top3, betroffeneTage } from '../kollokationenNeubau.js'
import { berlinTag, plusTage } from '../date-utils.js'

/**
 * @param {object} d Abhängigkeiten (in Tests ersetzbar)
 */
export function createAdminKollokatorKorrekturenRouter({
  adminLimiter,
  requireAuth,
  validate,
  schemas,
  korrekturen,
  fetchLemma,
  // optional: Abgleich der gespeicherten Ablenker mit Platz 1–25 (veraltete Optionen)
  fetchKollokatorenAnalyse = null,
  MIN_KOLLOKATOREN,
  getLemmataIndex,
  loadKalender,
  loadAllSpezialwochen = () => [],
  setzeKollokatoren,
  invalidateCache,
  planeBelegPruefung = async () => ({ status: 'aus' }),
  auditCreate,
  auditUpdate,
  auditDelete,
  adminError,
  logger,
  heute = () => berlinTag(),
}) {
  const router = express.Router()
  const auditOptionen = (req) => ({ adminKey: req.adminSessionId || 'unknown', ip: req.ip })
  const adminUserId = (req) => req.session?.userId ?? null

  const betroffen = (k) => {
    try {
      return betroffeneTage(k, { kalender: loadKalender(), byId: getLemmataIndex().byId, heute: heute() })
    } catch (err) {
      logger.warn({ err }, 'Betroffene Tage einer Kollokator-Korrektur nicht ermittelt')
      return []
    }
  }

  const ausBody = (b) => ({
    art: b.art,
    schluessel: schluesselFuer(b.art, b),
    ersatz: b.ersatz ?? null,
    notiz: b.notiz ?? '',
  })

  router.get('/admin/kollokator-korrekturen', adminLimiter, requireAuth, validate(schemas.query, 'query'), (req, res) => {
    try {
      const eintraege = korrekturen.listeKorrekturen()
      const antwort = { eintraege }
      if (req.query.grundbestand === '1') antwort.grundbestand = korrekturen.listeGrundbestand(eintraege)
      res.json(antwort)
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/kollokator-korrekturen', adminLimiter, requireAuth, validate(schemas.body), (req, res) => {
    try {
      const k = ausBody(req.body)
      const { vorher, nachher } = korrekturen.speichereKorrektur({ ...k, adminUserId: adminUserId(req) })
      logger.info({ art: k.art, schluessel: k.schluessel, ersatz: k.ersatz, ersetzt: !!vorher }, 'Kollokator-Korrektur gespeichert')
      if (vorher) auditUpdate('kollokator_korrektur', String(nachher.id), vorher, nachher, auditOptionen(req))
      else auditCreate('kollokator_korrektur', String(nachher.id), nachher, auditOptionen(req))
      res.json({ ok: true, eintrag: nachher, ersetzt: !!vorher, betroffen: betroffen(nachher) })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.put('/admin/kollokator-korrekturen/:id', adminLimiter, requireAuth, validate(schemas.params, 'params'), validate(schemas.body), (req, res) => {
    try {
      const k = ausBody(req.body)
      const ergebnis = korrekturen.aendereKorrektur(req.params.id, { ...k, adminUserId: adminUserId(req) })
      if (!ergebnis) return res.status(404).json({ error: 'Diesen Eintrag gibt es nicht mehr.' })
      const { vorher, nachher } = ergebnis
      logger.info({ id: nachher.id, art: k.art, schluessel: k.schluessel }, 'Kollokator-Korrektur geändert')
      auditUpdate('kollokator_korrektur', String(nachher.id), vorher, nachher, auditOptionen(req))
      // Betroffen sind die Tage des alten und des neuen Worts
      const tage = new Map([...betroffen(vorher), ...betroffen(nachher)].map((t) => [t.datum, t]))
      res.json({ ok: true, eintrag: nachher, betroffen: [...tage.values()].sort((a, b) => a.datum.localeCompare(b.datum)) })
    } catch (err) {
      if (err instanceof korrekturen.KorrekturKonflikt) return res.status(409).json({ error: err.message })
      adminError(res, err)
    }
  })

  router.delete('/admin/kollokator-korrekturen/:id', adminLimiter, requireAuth, validate(schemas.params, 'params'), (req, res) => {
    try {
      const vorher = korrekturen.loescheKorrektur(req.params.id)
      if (!vorher) return res.status(404).json({ error: 'Diesen Eintrag gibt es nicht mehr.' })
      logger.info({ id: vorher.id, art: vorher.art, schluessel: vorher.schluessel }, 'Kollokator-Korrektur gelöscht')
      auditDelete('kollokator_korrektur', String(vorher.id), vorher, auditOptionen(req))
      res.json({ ok: true, betroffen: betroffen(vorher) })
    } catch (err) {
      adminError(res, err)
    }
  })

  /** Gespeicherte Optionen, die in der aktuellen Liste (Platz 1–25) nicht mehr vorkommen. */
  async function veralteteOptionen(lemma, pos, alt) {
    if (!fetchKollokatorenAnalyse || !Array.isArray(alt) || !alt.length) return []
    try {
      const { kollokatoren } = await fetchKollokatorenAnalyse(lemma, pos)
      const aktuell = new Set((kollokatoren ?? []).map((k) => String(k.wort).toLowerCase()))
      if (!aktuell.size) return []
      return alt.map((o) => String(o?.wort ?? '')).filter((w) => w && !aktuell.has(w.toLowerCase()))
    } catch (err) {
      logger.warn({ err, lemma }, 'Neubau: Abgleich der Ablenker fehlgeschlagen')
      return []
    }
  }

  /**
   * Rechnet die Kollokationen-Runde der Lemmata dieser Tage neu.
   * @returns {Promise<Array<{ datum: string, status?: string, eintraege: Array<object> }>>}
   */
  async function berechneNeubau(daten) {
    const h = heute()
    const kalender = loadKalender()
    const { byId } = getLemmataIndex()
    const plan = planeNeubau({ kalender, spezialwochen: loadAllSpezialwochen(), byId, ab: plusTage(h, 1) })
    const geplant = new Map(plan.neu.map((e) => [e.id, e]))
    const uebersprungen = new Map(plan.uebersprungen.map((u) => [u.id, u]))
    const frisch = new Map() // id → Promise der neuen Optionen (ein Lemma an mehreren Tagen nur einmal)

    const tage = []
    for (const datum of [...new Set(daten)].sort()) {
      if (datum <= h) { tage.push({ datum, status: 'vergangen', eintraege: [] }); continue }
      const k = kalender?.[datum]
      const ids = Array.isArray(k) ? k : (k?.ids ?? [])
      if (!ids.length) { tage.push({ datum, status: 'leer', eintraege: [] }); continue }
      const eintraege = []
      for (const id of ids) {
        const u = uebersprungen.get(id)
        const g = geplant.get(id)
        if (!g) {
          eintraege.push({ id, lemma: u?.lemma ?? byId.get(id)?.lemma ?? id, status: 'uebersprungen', grund: u?.grund ?? 'nicht geplant' })
          continue
        }
        const lemma = g.lemma
        const pos = lemma.pos || 'Substantiv'
        if (!frisch.has(id)) frisch.set(id, fetchLemma(lemma.lemma, pos).then((l) => l?.runden?.kollokatoren ?? []))
        const auchAm = g.daten.filter((x) => x !== datum)
        try {
          const neu = await frisch.get(id)
          const alt = lemma.runden?.kollokatoren ?? []
          if (neu.length < MIN_KOLLOKATOREN) {
            eintraege.push({ id, lemma: lemma.lemma, status: 'uebersprungen', grund: `nur ${neu.length} Kollokatoren als ${pos} – Wortart prüfen`, alt: top3(alt), auchAm })
            continue
          }
          const gleich = top3(alt).join('|') === top3(neu).join('|')
          // Gleiche Top 3, aber ein gespeicherter Ablenker steht nicht mehr in Platz 1–25
          // (korrigiert oder gesperrt, z. B. die Dublette „Sofortmassnahm“): auch neu bauen
          const veraltet = gleich ? await veralteteOptionen(lemma.lemma, pos, alt) : []
          const status = !gleich || veraltet.length ? 'neu' : 'gleich'
          eintraege.push({ id, lemma: lemma.lemma, status, alt: top3(alt), neu: top3(neu), ...(veraltet.length ? { veraltet } : {}), auchAm, _optionen: neu, _alt: alt })
        } catch (err) {
          logger.warn({ err, lemma: lemma.lemma }, 'Neubau: fetchLemma fehlgeschlagen')
          eintraege.push({ id, lemma: lemma.lemma, status: 'uebersprungen', grund: 'Fehler bei der Abfrage', auchAm })
        }
      }
      tage.push({ datum, eintraege })
    }
    return tage
  }

  // Interne Felder (_optionen, _alt) nicht an den Client
  const ohneIntern = (tage) => tage.map((t) => ({
    ...t,
    eintraege: t.eintraege.map(({ _optionen: _o, _alt: _a, ...rest }) => rest),
  }))

  router.post('/admin/kollokationen-neubau/vorschau', adminLimiter, requireAuth, validate(schemas.neubau), async (req, res) => {
    try {
      res.json({ tage: ohneIntern(await berechneNeubau(req.body.daten)) })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/kollokationen-neubau/uebernehmen', adminLimiter, requireAuth, validate(schemas.neubau), async (req, res) => {
    try {
      const tage = await berechneNeubau(req.body.daten)
      // Nur Lemmata, deren Top 3 sich ändern; ein Lemma an zwei Tagen nur einmal schreiben
      const zuSchreiben = new Map()
      for (const t of tage) for (const e of t.eintraege) if (e.status === 'neu') zuSchreiben.set(e.id, e)
      for (const e of zuSchreiben.values()) {
        setzeKollokatoren({ id: e.id, kollokatoren: JSON.stringify(e._optionen) })
        auditUpdate('lemma_kollokatoren', e.id, { kollokatoren: e._alt }, { kollokatoren: e._optionen }, auditOptionen(req))
      }
      if (zuSchreiben.size) invalidateCache('lemmata.json')
      for (const t of tage) for (const e of t.eintraege) if (e.status === 'neu') e.status = 'geschrieben'
      logger.info({ daten: req.body.daten, lemmata: [...zuSchreiben.values()].map((e) => e.lemma) }, 'Kollokationen neu gebaut')

      let belegPruefung = null
      const geschriebeneTage = tage.filter((t) => t.eintraege.some((e) => e.status === 'geschrieben')).map((t) => t.datum)
      if (geschriebeneTage.length) {
        try {
          belegPruefung = (await planeBelegPruefung(geschriebeneTage)).status
        } catch (err) {
          belegPruefung = 'fehler'
          logger.error({ err }, 'Belegprüfung nach dem Kollokationen-Neubau nicht eingeplant')
        }
      }
      res.json({ ok: true, geschrieben: zuSchreiben.size, belegPruefung, tage: ohneIntern(tage) })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
