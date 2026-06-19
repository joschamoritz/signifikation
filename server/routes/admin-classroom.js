/**
 * server/routes/admin-classroom.js
 *
 * Admin-API fuer Klassenraum-Telemetrie (W2-T6).
 * Auth: requireAuth (Admin-Session).
 *
 * GET /admin/classroom/stats?days=30
 *   Aggregate: Sessions pro Tag, Ø-Teilnehmer, beliebteste Modi,
 *   Auto-End-Quote, Reconnect-Quote, Status-Breakdown, Submission-Stats.
 */

import express from 'express'
import { getAdminStats, getTeacherStats } from '../classroom/telemetry.js'

export function createAdminClassroomRouter({ adminLimiter, requireAuth, validate, adminClassroomStatsQuerySchema, adminClassroomTeachersQuerySchema, adminError }) {
  const router = express.Router()

  router.get(
    '/admin/classroom/stats',
    adminLimiter,
    requireAuth,
    validate(adminClassroomStatsQuerySchema, 'query'),
    (req, res) => {
      try {
        const { days } = req.query
        const stats = getAdminStats({ days })
        if (!stats) {
          return res.status(500).json({ error: 'Telemetrie-Abfrage fehlgeschlagen' })
        }
        return res.json(stats)
      } catch (err) {
        adminError(res, err)
      }
    },
  )

  // Lehrer-Aktivitaet: aktive Lehrer + Sessions-pro-Lehrer-Histogramm.
  router.get(
    '/admin/classroom/teachers',
    adminLimiter,
    requireAuth,
    validate(adminClassroomTeachersQuerySchema, 'query'),
    (req, res) => {
      try {
        const { days } = req.query
        const stats = getTeacherStats({ days })
        if (!stats) {
          return res.status(500).json({ error: 'Telemetrie-Abfrage fehlgeschlagen' })
        }
        return res.json(stats)
      } catch (err) {
        adminError(res, err)
      }
    },
  )

  return router
}
