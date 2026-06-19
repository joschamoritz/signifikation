/**
 * server/routes/admin-product-metrics.js
 *
 * Macht vorhandene Produkt-/Geschaeftsdaten im Admin-Panel sichtbar
 * (Daten-Instrumentierung aus dem data-analyst-Audit). KEINE neue Migration —
 * alle Aggregate kommen aus bestehenden Tabellen.
 *
 * Endpunkte (alle requireAuth + adminLimiter + Zod-validate):
 *   GET /admin/payments/summary?days=     – Zahlungen (payments)
 *   GET /admin/custom-lemma/summary?days=  – Eigenes-Lemma-Nutzung (custom_lemma_usage)
 *   GET /admin/stats/retention?days=       – DAU/WAU/MAU + Day1->Day7 (stats + user)
 *
 * Lehrer-Aktivitaet liegt unter /admin/classroom/teachers (admin-classroom.js,
 * Domaenenlogik in classroom/telemetry.js).
 *
 * Datenschutz: NUR Aggregate (Zahlen/Verteilungen). Keine E-Mails, Klarnamen
 * oder Einzel-User-Listen verlassen den Server.
 */

import express from 'express'
import db from '../db.js'
import { todayBerlin } from '../customLemmaQuota.js'

// ── Datums-Helfer (Europe/Berlin, wie der Rest der App) ──────────
// Subtrahiert n Tage von einem YYYY-MM-DD-String. Rechnet bewusst in UTC,
// damit reine Datumsarithmetik nicht von Sommerzeit/lokaler TZ verschoben wird.
function berlinDateMinusDays(n, base = todayBerlin()) {
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - n)
  return dt.toISOString().slice(0, 10)
}

// ── Payments (payments-Tabelle) ──────────────────────────────────
// Spalten: id, user_id, amount(TEXT, z.B. "9.99"), currency, status, product,
// processed_at(INTEGER Unix-Ms). Eingefuegt wird nur bei status='paid'.
const paymentsTotalsStmt = db.prepare(`
  SELECT
    COUNT(*)                          AS payments,
    COUNT(DISTINCT user_id)           AS uniquePayers,
    COALESCE(SUM(CAST(amount AS REAL)), 0) AS revenue
  FROM payments
  WHERE status = 'paid' AND processed_at >= @since
`)

const paymentsByProductStmt = db.prepare(`
  SELECT
    product,
    COUNT(*)                          AS count,
    COALESCE(SUM(CAST(amount AS REAL)), 0) AS revenue
  FROM payments
  WHERE status = 'paid' AND processed_at >= @since
  GROUP BY product
  ORDER BY count DESC
`)

const paymentsTrendStmt = db.prepare(`
  SELECT
    date(processed_at / 1000, 'unixepoch') AS day,
    COUNT(*)                          AS count,
    COALESCE(SUM(CAST(amount AS REAL)), 0) AS revenue
  FROM payments
  WHERE status = 'paid' AND processed_at >= @since
  GROUP BY day
  ORDER BY day
`)

// ── Eigenes Lemma (custom_lemma_usage JOIN user_profiles.role) ───
// Spalten custom_lemma_usage: user_id, date(YYYY-MM-DD, Europe/Berlin), count.
// role: 'user' (Basic) | 'premium' | 'admin'.
const customLemmaTotalsStmt = db.prepare(`
  SELECT
    COUNT(DISTINCT user_id)  AS activeUsers,
    COALESCE(SUM(count), 0)  AS totalPlays
  FROM custom_lemma_usage
  WHERE date >= @fromDate
`)

const customLemmaByRoleStmt = db.prepare(`
  SELECT
    COALESCE(up.role, 'user') AS role,
    COUNT(DISTINCT clu.user_id) AS users,
    COALESCE(SUM(clu.count), 0) AS plays
  FROM custom_lemma_usage clu
  LEFT JOIN user_profiles up ON up.user_id = clu.user_id
  WHERE clu.date >= @fromDate
  GROUP BY role
`)

const customLemmaTrendStmt = db.prepare(`
  SELECT
    date                     AS day,
    COUNT(DISTINCT user_id)  AS users,
    COALESCE(SUM(count), 0)  AS plays
  FROM custom_lemma_usage
  WHERE date >= @fromDate
  GROUP BY date
  ORDER BY date
`)

const customLemmaDauStmt = db.prepare(`
  SELECT
    COUNT(DISTINCT user_id)  AS dau,
    COALESCE(SUM(count), 0)  AS plays
  FROM custom_lemma_usage
  WHERE date = @today
`)

// ── Retention (stats + user) ─────────────────────────────────────
// DAU/WAU/MAU = distinkte, identifizierte Nutzer (stats.user_id != '') mit
// Aktivitaet im jeweiligen Fenster. Anonyme Aggregat-Zeile (user_id='')
// wird ausgeschlossen.
const dauWauMauStmt = db.prepare(`
  SELECT
    COUNT(DISTINCT CASE WHEN datum =  @d0  THEN user_id END) AS dau,
    COUNT(DISTINCT CASE WHEN datum >= @d6  THEN user_id END) AS wau,
    COUNT(DISTINCT CASE WHEN datum >= @d29 THEN user_id END) AS mau
  FROM stats
  WHERE user_id != '' AND datum >= @d29
`)

// Day1->Day7-Wiederkehr: Kohorte = identifizierte Nutzer, die im Fenster
// registriert wurden UND mindestens 7 Tage alt sind. "Zurueckgekehrt" =
// hat eine stats-Zeile mit datum >= Registrierungstag + 7 Tage.
const retentionStmt = db.prepare(`
  WITH cohort AS (
    SELECT id AS user_id, date(createdAt) AS reg_date
    FROM user
    WHERE date(createdAt) >= @cohortFrom AND date(createdAt) <= @cohortTo
  )
  SELECT
    COUNT(*) AS cohortSize,
    SUM(CASE WHEN EXISTS (
      SELECT 1 FROM stats s
      WHERE s.user_id = cohort.user_id
        AND s.datum >= date(cohort.reg_date, '+7 days')
    ) THEN 1 ELSE 0 END) AS returned
  FROM cohort
`)

const isPremiumRole = (role) => role === 'premium' || role === 'admin'

export function createAdminProductMetricsRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminPaymentsSummaryQuerySchema,
  adminCustomLemmaSummaryQuerySchema,
  adminRetentionQuerySchema,
  adminError,
}) {
  const router = express.Router()

  // ── GET /admin/payments/summary ────────────────────────────────
  router.get('/admin/payments/summary', adminLimiter, requireAuth, validate(adminPaymentsSummaryQuerySchema, 'query'), (req, res) => {
    const { days } = req.query
    try {
      const since = Date.now() - days * 24 * 60 * 60 * 1000
      const totals = paymentsTotalsStmt.get({ since }) || {}
      const byProduct = paymentsByProductStmt.all({ since })
      const trend = paymentsTrendStmt.all({ since })

      const payments = Number(totals.payments || 0)
      const revenue = Number(totals.revenue || 0)

      res.json({
        window: { days, since },
        totals: {
          payments,
          uniquePayers: Number(totals.uniquePayers || 0),
          revenue: Math.round(revenue * 100) / 100,
          avgValue: payments > 0 ? Math.round((revenue / payments) * 100) / 100 : null,
          currency: 'EUR',
        },
        byProduct: byProduct.map((r) => ({
          product: r.product,
          count: Number(r.count || 0),
          revenue: Math.round(Number(r.revenue || 0) * 100) / 100,
        })),
        trend: trend.map((r) => ({
          day: r.day,
          count: Number(r.count || 0),
          revenue: Math.round(Number(r.revenue || 0) * 100) / 100,
        })),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  // ── GET /admin/custom-lemma/summary ────────────────────────────
  router.get('/admin/custom-lemma/summary', adminLimiter, requireAuth, validate(adminCustomLemmaSummaryQuerySchema, 'query'), (req, res) => {
    const { days } = req.query
    try {
      const today = todayBerlin()
      const fromDate = berlinDateMinusDays(days - 1, today) // inkl. heute → days Tage

      const totals = customLemmaTotalsStmt.get({ fromDate }) || {}
      const byRoleRows = customLemmaByRoleStmt.all({ fromDate })
      const trend = customLemmaTrendStmt.all({ fromDate })
      const dauRow = customLemmaDauStmt.get({ today }) || {}

      const activeUsers = Number(totals.activeUsers || 0)
      let premiumUsers = 0
      let basicUsers = 0
      for (const r of byRoleRows) {
        if (isPremiumRole(r.role)) premiumUsers += Number(r.users || 0)
        else basicUsers += Number(r.users || 0)
      }

      res.json({
        window: { days, from: fromDate, to: today },
        totals: {
          activeUsers,
          totalPlays: Number(totals.totalPlays || 0),
          dau: Number(dauRow.dau || 0),
          dauPlays: Number(dauRow.plays || 0),
          premiumUsers,
          basicUsers,
          premiumRate: activeUsers > 0 ? Math.round((premiumUsers / activeUsers) * 1000) / 1000 : null,
        },
        byRole: byRoleRows.map((r) => ({
          role: r.role,
          users: Number(r.users || 0),
          plays: Number(r.plays || 0),
        })),
        trend: trend.map((r) => ({
          day: r.day,
          users: Number(r.users || 0),
          plays: Number(r.plays || 0),
        })),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  // ── GET /admin/stats/retention ─────────────────────────────────
  router.get('/admin/stats/retention', adminLimiter, requireAuth, validate(adminRetentionQuerySchema, 'query'), (req, res) => {
    const { days } = req.query
    try {
      const today = todayBerlin()
      const d0 = today
      const d6 = berlinDateMinusDays(6, today)
      const d29 = berlinDateMinusDays(29, today)

      const active = dauWauMauStmt.get({ d0, d6, d29 }) || {}

      // Kohorte: registriert im days-Fenster, aber mind. 7 Tage alt.
      const cohortFrom = berlinDateMinusDays(days, today)
      const cohortTo = berlinDateMinusDays(7, today)
      const ret = retentionStmt.get({ cohortFrom, cohortTo }) || {}
      const cohortSize = Number(ret.cohortSize || 0)
      const returned = Number(ret.returned || 0)

      // Ehrlichkeits-Hinweis: nach 180 Tagen werden per-User-stats-Zeilen in die
      // anonyme Zeile gefaltet (Migration/Job dataRetention). DAU/WAU/MAU (max
      // 30 Tage) sind davon nicht betroffen; die Day1->Day7-Kohorte nur, wenn
      // das Fenster bis kurz vor die 180-Tage-Grenze reicht.
      const caveat = days > 173
        ? 'Day1->Day7-Wiederkehr unterschaetzt fuer Registrierungen aelter als 180 Tage (stats-Kompaktierung).'
        : null

      res.json({
        window: { days, from: berlinDateMinusDays(days - 1, today), to: today },
        active: {
          dau: Number(active.dau || 0),
          wau: Number(active.wau || 0),
          mau: Number(active.mau || 0),
        },
        retentionDay7: {
          cohortFrom,
          cohortTo,
          cohortSize,
          returned,
          rate: cohortSize > 0 ? Math.round((returned / cohortSize) * 1000) / 1000 : null,
        },
        caveat,
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
