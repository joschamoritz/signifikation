import express from 'express'

export function createAdminAuditRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminAuditLogQuerySchema,
  adminAuditLogDetailParamsSchema,
  getAuditLog,
  adminError,
}) {
  const router = express.Router()

  router.get('/admin/audit-log', adminLimiter, requireAuth, validate(adminAuditLogQuerySchema, 'query'), (req, res) => {
    try {
      const { action, resource, status, q, from: fromRaw, to: toRaw } = req.query

      const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 100))
      const from = fromRaw ? new Date(fromRaw) : null
      const to = toRaw ? new Date(toRaw) : null

      const source = getAuditLog(2000)
      const filtered = source.filter((entry) => {
        if (action && entry.action !== action) return false
        if (resource && String(entry.resource || '').toLowerCase() !== resource) return false
        if (status && entry.status !== status) return false

        if (from || to) {
          const ts = new Date(entry.timestamp || '')
          if (Number.isNaN(ts.getTime())) return false
          if (from && ts < from) return false
          if (to && ts > to) return false
        }

        if (q) {
          const haystack = [
            entry.action,
            entry.resource,
            entry.resourceId,
            entry.status,
            JSON.stringify(entry.changes || {}),
          ].join(' ').toLowerCase()
          if (!haystack.includes(q)) return false
        }

        return true
      })

      const entries = filtered.slice(0, limit)
      res.json({
        entries,
        count: entries.length,
        totalMatches: filtered.length,
        timestamp: new Date().toISOString()
      })
    } catch (err) { adminError(res, err) }
  })

  router.get('/admin/audit-log/:resource/:id', adminLimiter, requireAuth, validate(adminAuditLogDetailParamsSchema, 'params'), (req, res) => {
    try {
      const resource = String(req.params.resource || '').trim().toLowerCase()
      const resourceId = String(req.params.id || '').trim()
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50))
      const entries = getAuditLog(2000)
        .filter((entry) => String(entry.resource || '').toLowerCase() === resource && String(entry.resourceId || '') === resourceId)
        .slice(0, limit)

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
