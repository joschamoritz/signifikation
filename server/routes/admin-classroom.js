/**
 * server/routes/admin-classroom.js
 *
 * Admin-API fuer Klassenraum-Telemetrie (W2-T6).
 * Auth: requireAuth (Admin-Session).
 *
 * GET /admin/classroom/stats?days=30
 *   Alles für Auswertung › Klassenraum (Schritt 8): Sitzungen pro Berliner Tag, wie sie enden,
 *   Teilnehmer, Verbindungen, Antworten je Modus und – bis 30 Tage – die Lehrkräfte.
 *   Nur Summen; Admin-Konten zählen nicht mit (classroom/telemetry.js).
 */

import express from 'express'
import { getKlassenraumAuswertung } from '../classroom/telemetry.js'
import { loadDemoContentMitStand, saveDemoContent, DEMO_CONTENT_DEFAULT } from '../classroom/demoContent.js'

export function createAdminClassroomRouter({ adminLimiter, requireAuth, validate, adminClassroomStatsQuerySchema, auditUpdate, adminError }) {
  const router = express.Router()

  router.get(
    '/admin/classroom/stats',
    adminLimiter,
    requireAuth,
    validate(adminClassroomStatsQuerySchema, 'query'),
    (req, res) => {
      try {
        const { days } = req.query
        const stats = getKlassenraumAuswertung({ days })
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
