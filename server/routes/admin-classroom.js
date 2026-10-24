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
import { loadDemoContentMitStand, saveDemoContent, DEMO_CONTENT_DEFAULT } from '../classroom/demoContent.js'

export function createAdminClassroomRouter({ adminLimiter, requireAuth, validate, adminClassroomStatsQuerySchema, adminClassroomTeachersQuerySchema, auditUpdate, adminError }) {
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

  // ── Demo-Inhalte (login-freie Lehrer-Vorschau) ──────────────────
  // GET liefert die aktuellen (oder Default-)Inhalte fuer den Editor, ob die Standardinhalte gelten
  // und wann zuletzt gespeichert wurde.
  router.get('/admin/classroom/demo-content', adminLimiter, requireAuth, (req, res) => {
    try {
      // standard: für „Standardinhalte einsetzen“ im Editor
      return res.json({ ...loadDemoContentMitStand(), standard: DEMO_CONTENT_DEFAULT })
    } catch (err) {
      adminError(res, err)
    }
  })

  // Kurzfassung für das Änderungsprotokoll: die Wörter, nicht die ganzen Listen
  const zusammenfassung = (c) => ({
    basis: c.kollokationen.lemma.lemma,
    wortzwilling: `${c.wortzwilling.wortA} / ${c.wortzwilling.wortB}`,
    zeitenwende: c.zeitenwende.lemma.lemma,
    lueckenfueller: c.lueckenfueller.lemma.lemma,
  })

  // PUT speichert validierte Inhalte; ungueltige Eingaben werden abgelehnt
  // (alter Stand bleibt erhalten — saveDemoContent schreibt nur bei Erfolg).
  router.put('/admin/classroom/demo-content', adminLimiter, requireAuth, (req, res) => {
    try {
      const vorher = loadDemoContentMitStand()
      const result = saveDemoContent(req.body)
      if (result.error) {
        return res.status(400).json({ error: 'Ungültige Demo-Inhalte', issues: result.issues })
      }
      auditUpdate?.('demo', 'klassenraum-demo', { ...zusammenfassung(vorher.content), standard: vorher.istStandard }, zusammenfassung(result.content),
        { adminKey: req.adminSessionId || 'unknown', ip: req.ip })
      return res.json({ ok: true, content: result.content })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
