import express from 'express'
import db from '../db.js'
import { requireAuth, serverError } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimiter.js'
import { validate, adminFreeDayBodySchema, adminFreeDayParamsSchema } from '../middleware/validate.js'
import logger from '../logger.js'
import { todayBerlin } from '../customLemmaQuota.js'
import { auditCreate, auditUpdate, auditDelete } from '../audit.js'

const router = express.Router()

const listFreeDaysStmt  = db.prepare(`SELECT date, label, bonus_count FROM free_days ORDER BY date ASC`)
const getFreeDayStmt    = db.prepare(`SELECT date, label, bonus_count FROM free_days WHERE date = ?`)
const insertFreeDayStmt = db.prepare(`INSERT OR REPLACE INTO free_days (date, label, bonus_count) VALUES (?, ?, ?)`)
const deleteFreeDayStmt = db.prepare(`DELETE FROM free_days WHERE date = ?`)

const auditOptionen = (req) => ({ adminKey: req.adminSessionId || 'unknown', ip: req.ip })

router.get('/admin/free-days', adminLimiter, requireAuth, (_req, res) => {
  try {
    res.json({ days: listFreeDaysStmt.all() })
  } catch (err) {
    logger.error({ err }, 'free-days GET fehlgeschlagen')
    serverError(res, err)
  }
})

router.post('/admin/free-days', adminLimiter, requireAuth, validate(adminFreeDayBodySchema), (req, res) => {
  const { date, label, bonus_count } = req.body
  // Vergangene Tage haben keine Wirkung mehr (Vergleich als Text: JJJJ-MM-TT sortiert wie das Datum).
  if (date < todayBerlin()) {
    return res.status(400).json({ error: 'Der Tag liegt in der Vergangenheit.' })
  }
  try {
    const vorher = getFreeDayStmt.get(date)
    insertFreeDayStmt.run(date, label, bonus_count)
    logger.info({ date, label, bonus: bonus_count, ersetzt: !!vorher }, 'Bonus-Tag gespeichert')
    // Protokoll erst nach dem Schreiben: Ein gescheiterter Eintrag steht nicht als geschehen im Protokoll.
    if (vorher) auditUpdate('bonus_tag', date, vorher, { date, label, bonus_count }, auditOptionen(req))
    else auditCreate('bonus_tag', date, { date, label, bonus_count }, auditOptionen(req))
    res.json({ ok: true, ersetzt: !!vorher })
  } catch (err) {
    logger.error({ err }, 'free-days POST fehlgeschlagen')
    serverError(res, err)
  }
})

router.delete('/admin/free-days/:date', adminLimiter, requireAuth, validate(adminFreeDayParamsSchema, 'params'), (req, res) => {
  const { date } = req.params
  try {
    const vorher = getFreeDayStmt.get(date)
    deleteFreeDayStmt.run(date)
    logger.info({ date }, 'Freitag entfernt')
    if (vorher) auditDelete('bonus_tag', date, vorher, auditOptionen(req))
    res.json({ ok: true, entfernt: !!vorher })
  } catch (err) {
    logger.error({ err }, 'free-days DELETE fehlgeschlagen')
    serverError(res, err)
  }
})

export default router
