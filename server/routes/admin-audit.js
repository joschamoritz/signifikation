import express from 'express'
import { AUDIT_SCAN_MAX } from '../audit.js'

export function createAdminAuditRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminAuditLogQuerySchema,
  adminAuditLogDetailParamsSchema,
  getAuditLogForResource,
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

  router.get('/admin/audit-log/:resource/:id', adminLimiter, requireAuth, validate(adminAuditLogDetailParamsSchema, 'params'), (req, res) => {
    try {
      const resource = String(req.params.resource || '').trim().toLowerCase()
      const resourceId = String(req.params.id || '').trim()
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
      // Über den Index (Bereich, Kennung, Zeit) statt die neuesten 2000 Zeilen zu laden und zu sieben
      const entries = getAuditLogForResource(resource, resourceId, limit)

      res.json({
        resource,
        resourceId,
        entries,
        count: entries.length,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
