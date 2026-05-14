import express from 'express'
import { statSync } from 'fs'
import { join } from 'path'
import db from '../db.js'
import { belegeVerfuegbar } from '../belege.js'
import { getEventLoopLagMs, getEventLoopLagLastMs } from '../metrics.js'

function getProcessFingerprint() {
  return {
    pid: process.pid,
    startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    appVersion: process.env.npm_package_version || null,
  }
}

const countStatsRowsStmt = db.prepare(`
  SELECT
    COUNT(*) AS totalRows,
    SUM(CASE WHEN user_id != '' THEN 1 ELSE 0 END) AS identifiedRows,
    SUM(plays) AS totalPlays
  FROM stats
`)

const countClassroomSessionsStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM classroom_sessions
`)

const countUsersStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user
`)

const queueStatusStmt = db.prepare(`
  SELECT status, COUNT(*) AS n
  FROM classroom_exports
  GROUP BY status
`)

const oldestPendingStmt = db.prepare(`
  SELECT MIN(created_at) AS oldest
  FROM classroom_exports
  WHERE status IN ('queued', 'running')
`)

const recentFailuresStmt = db.prepare(`
  SELECT id, session_id, type, error, created_at, finished_at
  FROM classroom_exports
  WHERE status = 'failed'
  ORDER BY finished_at DESC
  LIMIT 5
`)

export function createAdminOpsRouter({
  adminLimiter,
  requireAuth,
  loadKalender,
  getCacheMetrics,
  getQueryCacheMetrics,
  clearQueryCache,
  fetchRelation,
  DATA,
  adminError,
  logger,
}) {
  const router = express.Router()

  router.get('/admin/performance', adminLimiter, requireAuth, (_req, res) => {
    try {
      const queryCache = getQueryCacheMetrics()
      const belegeCache = getCacheMetrics()
      const statsRows = countStatsRowsStmt.get() || { totalRows: 0, identifiedRows: 0, totalPlays: 0 }
      const classSessions = countClassroomSessionsStmt.get()?.total || 0

      let dbSizeBytes = 0
      let walSizeBytes = 0
      try {
        dbSizeBytes = statSync(join(DATA, 'signifikation.db')).size
      } catch {
        dbSizeBytes = 0
      }
      try {
        walSizeBytes = statSync(join(DATA, 'signifikation.db-wal')).size
      } catch {
        walSizeBytes = 0
      }

      const userCount = countUsersStmt.get()?.total || 0

      res.json({
        uptimeSec: Math.floor(process.uptime()),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        eventLoop: {
          lagAvgMs: getEventLoopLagMs(),
          lagLastMs: getEventLoopLagLastMs(),
        },
        process: getProcessFingerprint(),
        db: {
          path: join(DATA, 'signifikation.db'),
          sizeBytes: dbSizeBytes,
          walBytes: walSizeBytes,
        },
        rows: {
          statsRows: Number(statsRows.totalRows || 0),
          identifiedStatsRows: Number(statsRows.identifiedRows || 0),
          totalPlays: Number(statsRows.totalPlays || 0),
        },
        entities: {
          users: Number(userCount || 0),
          classroomSessions: Number(classSessions || 0),
        },
        cache: {
          query: queryCache,
          belege: belegeCache,
        },
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/health', adminLimiter, requireAuth, async (_req, res) => {
    let lastEntry = null
    try {
      const kalender = loadKalender()
      const keys = Object.keys(kalender).sort()
      lastEntry = keys[keys.length - 1] || null
    } catch {
      lastEntry = null
    }

    let wortprofilDb = 'ok'
    try {
      await fetchRelation('haus', 'Substantiv', 'ATTR')
    } catch (err) {
      wortprofilDb = `error: ${err.message}`
    }

    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      process: getProcessFingerprint(),
      lastEntry,
      memMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      wortprofilDb,
      belegeDb: belegeVerfuegbar() ? 'ok' : 'nicht verfügbar',
    })
  })

  router.get('/admin/cache-metrics', adminLimiter, requireAuth, (_req, res) => {
    try {
      const belegeCache = getCacheMetrics()
      const queryCache = getQueryCacheMetrics()
      res.json({
        belege: belegeCache,
        queryResults: queryCache,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/worker-status', adminLimiter, requireAuth, (_req, res) => {
    try {
      const statusRows = queueStatusStmt.all()
      const byStatus = Object.fromEntries(statusRows.map(r => [r.status, Number(r.n)]))
      const counts = {
        queued:  byStatus.queued  ?? 0,
        running: byStatus.running ?? 0,
        done:    byStatus.done    ?? 0,
        failed:  byStatus.failed  ?? 0,
      }

      const oldestPending = oldestPendingStmt.get()?.oldest ?? null
      const oldestPendingAgeMs = oldestPending ? Date.now() - oldestPending : null

      const recentFailures = recentFailuresStmt.all().map(r => ({
        id: r.id,
        sessionId: r.session_id,
        type: r.type,
        error: r.error,
        createdAt: new Date(r.created_at).toISOString(),
        finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      }))

      res.json({
        queue: counts,
        oldestPendingAgeMs,
        stalledThresholdMs: 10 * 60 * 1000,
        isStalled: oldestPendingAgeMs !== null && oldestPendingAgeMs > 10 * 60 * 1000,
        recentFailures,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/cache-clear', adminLimiter, requireAuth, (_req, res) => {
    try {
      clearQueryCache()
      logger.info('Alle Query-Caches geleert')
      res.json({ ok: true, message: 'Query-Cache geleert' })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
