// Vorschlags-API: nimmt geplante Tage als Entwürfe entgegen (Entwurfs-Postfach).
// Schreibt nur in lemma_entwurf, nie in den Kalender. Übernommen wird im
// Admin-Panel mit Login (routes/admin-calendar.js, /admin/entwuerfe).
//
// server/index.js parst den Body für diesen Pfad mit eigenem Limit und erst nach
// Rate-Limit und Schlüsselprüfung: Eine Woche JSON hat rund 14 KB, das globale
// Limit liegt bei 16 KB.
import express from 'express'
import { requireLemmaApiKey } from '../middleware/lemmaApiKey.js'
import { validate, lemmaEntwurfPushSchema } from '../middleware/validate.js'
import { serverError } from '../middleware/auth.js'
import { speichereEntwuerfe } from '../store-entwuerfe.js'
import { auditCreate } from '../audit.js'
import logger from '../logger.js'

export const LEMMA_API_PFAD = '/api/v1/lemma-entwuerfe'
export const LEMMA_API_BODY_LIMIT = '128kb'

const router = express.Router()

// Schlüssel hier erneut prüfen: Der Router bleibt so auch dann geschützt, wenn
// er ohne die Vorschaltung aus index.js eingehängt wird (z. B. in Tests).
router.post(LEMMA_API_PFAD, requireLemmaApiKey, validate(lemmaEntwurfPushSchema), (req, res) => {
  const { tage } = req.body
  try {
    speichereEntwuerfe(tage)
    const daten = tage.map((tag) => tag.datum)
    logger.info({ daten }, `Vorschlags-API: ${tage.length} Entwürfe angelegt`)
    auditCreate('lemma_entwurf', `${daten[0]}..${daten[daten.length - 1]}`, { daten }, {
      adminKey: 'lemma-api',
      ip: req.ip,
    })
    res.status(201).json({ ok: true, angelegt: tage.length, daten })
  } catch (err) {
    serverError(res, err)
  }
})

export default router
