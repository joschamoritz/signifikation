import express from 'express'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { adminLimiter } from '../middleware/rateLimiter.js'
import logger from '../logger.js'

const router = express.Router()

const listFreeDaysStmt  = db.prepare(`SELECT date, label FROM free_days ORDER BY date ASC`)
const insertFreeDayStmt = db.prepare(`INSERT OR REPLACE INTO free_days (date, label) VALUES (?, ?)`)
const deleteFreeDayStmt = db.prepare(`DELETE FROM free_days WHERE date = ?`)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

router.get('/admin/free-days', adminLimiter, requireAuth, (_req, res) => {
  try {
    res.json({ days: listFreeDaysStmt.all() })
  } catch (err) {
    logger.error({ err }, 'free-days GET fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

router.post('/admin/free-days', adminLimiter, requireAuth, (req, res) => {
  const { date, label = '' } = req.body ?? {}
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Datum ungültig (YYYY-MM-DD erwartet)' })
  }
  try {
    insertFreeDayStmt.run(date, String(label).trim().slice(0, 100))
    logger.info({ date, label }, 'Freitag hinzugefügt')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'free-days POST fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

router.delete('/admin/free-days/:date', adminLimiter, requireAuth, (req, res) => {
  const { date } = req.params
  if (!DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Datum ungültig' })
  }
  try {
    deleteFreeDayStmt.run(date)
    logger.info({ date }, 'Freitag entfernt')
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err }, 'free-days DELETE fehlgeschlagen')
    res.status(500).json({ error: 'Interner Fehler' })
  }
})

export default router
