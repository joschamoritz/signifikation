import express from 'express'
import db from '../db.js'
import { requireAuth, serverError } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimiter.js'
import { validate, adminFreeDayBodySchema, adminFreeDayParamsSchema } from '../middleware/validate.js'
import logger from '../logger.js'

const router = express.Router()

const listFreeDaysStmt  = db.prepare(`SELECT date, label, bonus_count FROM free_days ORDER BY date ASC`)
const insertFreeDayStmt = db.prepare(`INSERT OR REPLACE INTO free_days (date, label, bonus_count) VALUES (?, ?, ?)`)
const deleteFreeDayStmt = db.prepare(`DELETE FROM free_days WHERE date = ?`)

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
  try {
    insertFreeDayStmt.run(date, label, bonus_count)
    logger.info({ date, label, bonus: bonus_count }, 'Bonus-Tag gespeichert')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'free-days POST fehlgeschlagen')
    serverError(res, err)
  }
})

router.delete('/admin/free-days/:date', adminLimiter, requireAuth, validate(adminFreeDayParamsSchema, 'params'), (req, res) => {
  const { date } = req.params
  try {
    deleteFreeDayStmt.run(date)
    logger.info({ date }, 'Freitag entfernt')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'free-days DELETE fehlgeschlagen')
    serverError(res, err)
  }
})

export default router
