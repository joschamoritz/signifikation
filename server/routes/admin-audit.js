import express from 'express'
import { AUDIT_SCAN_MAX } from '../audit.js'

export function createAdminAuditRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminAuditLogQuerySchema,
  queryAuditLog,
  adminError,
}) {
  const router = express.Router()

  router.get('/admin/audit-log', adminLimiter, requireAuth, validate(adminAuditLogQuerySchema, 'query'), (req, res) => {
    try {
      // limit ist im Schema deklariert (1–500, Default 100) und kommt bereits als Zahl an.
      // Gefiltert wird in audit.js (SQL + Berliner Kalendertage, Suche ohne Groß-/Kleinschreibung).
      const { action, resource, status, q, from, to, limit } = req.query
      const { entries, totalMatches, begrenzt } = queryAuditLog({ action, resource, status, q, from, to, limit })
      res.json({
        entries,
        count: entries.length,
        totalMatches,
        // true: Es gibt mehr passende Zeilen, als durchsucht werden (AUDIT_SCAN_MAX); die ältesten fehlen.
        begrenzt,
        durchsuchtMax: AUDIT_SCAN_MAX,
        timestamp: new Date().toISOString()
      })
    } catch (err) { adminError(res, err) }
  })

  return router
}
