import express from 'express'
import db from '../db.js'

const getUserByIdBasicStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    COALESCE(up.role, 'user') AS role
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id = ?
`)

const topUsersByDatesStmt = db.prepare(`
  SELECT
    user_id AS userId,
    SUM(plays) AS plays,
    SUM(scoreSum) AS scoreSum,
    SUM(maxSum) AS maxSum
  FROM stats
  WHERE user_id != ''
    AND datum IN (SELECT value FROM json_each(?))
  GROUP BY user_id
  ORDER BY plays DESC
  LIMIT ?
`)

function toCsvCell(value) {
  const s = String(value ?? '')
  if (/[\",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildStatsCsv(rows) {
  const header = ['datum', 'spiel', 'plays', 'scoreSum', 'maxSum', 'avg10']
  const lines = [header.join(',')]
  for (const row of rows) {
    const avg10 = row.maxSum > 0 ? ((row.scoreSum / row.maxSum) * 10).toFixed(2) : ''
    lines.push([
      toCsvCell(row.datum),
      toCsvCell(row.spiel),
      toCsvCell(row.plays),
      toCsvCell(row.scoreSum),
      toCsvCell(row.maxSum),
      toCsvCell(avg10),
    ].join(','))
  }
  return lines.join('\n')
}

export function createAdminStatsRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminStatsQuerySchema,
  adminStatsSummaryQuerySchema,
  adminStatsExportQuerySchema,
  getStatsWindow,
  loadReadOnly,
  adminError,
  serverError,
}) {
  const router = express.Router()

  router.get('/admin/stats/summary', adminLimiter, requireAuth, validate(adminStatsSummaryQuerySchema, 'query'), (req, res) => {
    const { days, topUsers: topUsersLimit } = req.query

    try {
      const windowStats = getStatsWindow(days)

      const topUserRows = topUsersByDatesStmt.all(
        JSON.stringify(windowStats.selectedDates),
        topUsersLimit
      )

      const topUsers = topUserRows.map((row) => {
        const user = getUserByIdBasicStmt.get(row.userId)
        return {
          userId: row.userId,
          name: user?.name || null,
          email: user?.email || null,
          role: user?.role || 'user',
          plays: Number(row.plays || 0),
          avg10: row.maxSum > 0 ? Number(((row.scoreSum / row.maxSum) * 10).toFixed(2)) : null,
        }
      })

      res.json({
        window: {
          days,
          from: windowStats.selectedDates[0] || null,
          to: windowStats.selectedDates[windowStats.selectedDates.length - 1] || null,
        },
        totals: windowStats.totals,
        byGame: windowStats.byGame,
        scoreDistribution: windowStats.scoreDistribution,
        topUsers,
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/stats/export', adminLimiter, requireAuth, validate(adminStatsExportQuerySchema, 'query'), (req, res) => {
    const { days, format } = req.query

    try {
      const windowStats = getStatsWindow(days)
      if (format === 'json') {
        res.setHeader('Content-Disposition', `attachment; filename="signifikation-stats-${days}d.json"`)
        return res.json(windowStats)
      }

      const csv = buildStatsCsv(windowStats.rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="signifikation-stats-${days}d.csv"`)
      return res.send(csv)
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/stats', adminLimiter, requireAuth, validate(adminStatsQuerySchema, 'query'), (req, res) => {
    const { days } = req.query
    try {
      const stats = loadReadOnly('stats.json') ?? {}
      const sorted = Object.keys(stats).sort()
      const result = sorted.slice(-days).map((datum) => ({ datum, ...stats[datum] }))
      res.json(result)
    } catch (err) {
      serverError(res, err)
    }
  })

  return router
}
