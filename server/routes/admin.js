import express          from 'express'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'fs'
import { fetchLemma, fetchBonusQuestion, fetchRelation, fetchZeitreise, fetchZeitreiseAnalyze, fetchZeitenwende, fetchZeitenwendeAnalyze, POS_ROUNDS } from '../wortprofil.js'
import { belegeVerfuegbar, fetchBelege } from '../belege.js'
import { fetchWiktionary } from '../wiktionary.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { load, loadReadOnly, save, loadZeitreise, loadWortZwilling, loadZeitenwende, loadStats, loadStatsRows, getLemmataIndex, getCacheMetrics, DATA } from '../store.js'
import { getCacheMetrics as getQueryCacheMetrics, clearCache as clearQueryCache } from '../query-cache.js'
import { adminLimiter, loginLimiter, uploadLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, adminAuth, adminLogout, adminError, serverError, createSession } from '../middleware/auth.js'
import { validate, qQuerySchema, adminTagSchema, analyzeKollQuerySchema, analyzeWZQuerySchema, analyzeZeitQuerySchema, analyzeZWendeQuerySchema, adminUsersQuerySchema, adminSetUserRoleSchema, adminUserIdParamsSchema, adminUsersBulkUpdateSchema, adminBulkDeleteCalendarSchema, adminBulkImportCalendarSchema, adminPreviewLemmaSchema, adminPreviewDayParamsSchema, adminAuditLogDetailParamsSchema, adminBackupRestoreSchema, adminStatsQuerySchema, adminStatsSummaryQuerySchema, adminStatsExportQuerySchema, adminAuditLogQuerySchema, adminSocialCardsTagesdataSchema, adminSocialCardsBelegeSchema } from '../middleware/validate.js'
import { auditCreate, auditUpdate, auditDelete, getAuditLog } from '../audit.js'
import logger from '../logger.js'
import db from '../db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = express.Router()

const countUsersStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user
`)

const countUsersByRoleStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN COALESCE(up.role, 'user') = 'teacher' THEN 1 ELSE 0 END) AS teachers,
    SUM(CASE WHEN COALESCE(up.role, 'user') != 'teacher' THEN 1 ELSE 0 END) AS users
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
`)

const listUsersStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.emailVerified,
    u.createdAt,
    COALESCE(up.role, 'user') AS role
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE (
    @q = ''
    OR u.email LIKE @qLike
    OR u.name LIKE @qLike
  )
  AND (
    @role = ''
    OR COALESCE(up.role, 'user') = @role
  )
  ORDER BY u.createdAt DESC
  LIMIT @limit
`)

const getUserDetailsStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.emailVerified,
    u.createdAt,
    COALESCE(up.role, 'user') AS role
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id = ?
`)

const getUserStatsByGameStmt = db.prepare(`
  SELECT
    spiel,
    SUM(plays) AS plays,
    SUM(scoreSum) AS scoreSum,
    SUM(maxSum) AS maxSum
  FROM stats
  WHERE user_id = ?
  GROUP BY spiel
  ORDER BY spiel ASC
`)

const getUserRecentStatsStmt = db.prepare(`
  SELECT
    datum,
    spiel,
    SUM(plays) AS plays,
    SUM(scoreSum) AS scoreSum,
    SUM(maxSum) AS maxSum
  FROM stats
  WHERE user_id = ?
  GROUP BY datum, spiel
  ORDER BY datum DESC, spiel ASC
  LIMIT 20
`)

const deleteUserProfileStmt = db.prepare(`
  DELETE FROM user_profiles
  WHERE user_id = ?
`)

const deleteUserEntitlementsStmt = db.prepare(`
  DELETE FROM user_entitlements
  WHERE user_id = ?
`)

const deleteUserStatsStmt = db.prepare(`
  DELETE FROM stats
  WHERE user_id = ?
`)

const deleteClassroomSessionsByTeacherStmt = db.prepare(`
  DELETE FROM classroom_sessions
  WHERE teacher_user_id = ?
`)

const deleteUserStmt = db.prepare(`
  DELETE FROM user
  WHERE id = ?
`)

const ensureProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, 'user', ?, ?)
  ON CONFLICT(user_id) DO NOTHING
`)

const setUserRoleStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id)
  DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)

const userExistsStmt = db.prepare(`
  SELECT id
  FROM user
  WHERE id = ?
`)

const getUsersByIdsStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.emailVerified,
    u.createdAt,
    COALESCE(up.role, 'user') AS role
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id IN (SELECT value FROM json_each(?))
`)

const deleteUserTx = db.transaction((userId) => {
  deleteUserProfileStmt.run(userId)
  deleteUserEntitlementsStmt.run(userId)
  deleteUserStatsStmt.run(userId)
  deleteClassroomSessionsByTeacherStmt.run(userId)
  deleteUserStmt.run(userId)
})

const adminUsersStatsStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN createdAt >= @fromIso THEN 1 ELSE 0 END) AS newLast7Days,
    SUM(CASE WHEN createdAt >= @from30Iso THEN 1 ELSE 0 END) AS newLast30Days
  FROM user
`)

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




function mmddToIsoDate(mmdd) {
  const value = String(mmdd || '').trim()
  if (!/^\d{2}-\d{2}$/.test(value)) return null
  const [month, day] = value.split('-').map(Number)
  if (!month || !day) return null
  const now = new Date()
  const currentYear = now.getFullYear()
  const today = new Date(currentYear, now.getMonth(), now.getDate()).getTime()
  const candidateThisYear = new Date(currentYear, month - 1, day)
  const candidateYear = candidateThisYear.getTime() < today ? currentYear + 1 : currentYear
  return `${candidateYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isoDateToMmdd(value) {
  const normalized = String(value || '').trim()
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return `${match[2]}-${match[3]}`
}

function parseCalendarBulkImport(csv) {
  const lines = String(csv || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    throw new Error('CSV enthält keine Daten')
  }

  const entries = []
  for (const [index, line] of lines.entries()) {
    if (index === 0 && /^date[,;\t]/i.test(line)) continue

    const parts = line.split(/[;,\t]/).map((part) => part.trim())
    if (parts.length < 2) {
      throw new Error(`CSV-Zeile ${index + 1} ist unvollständig`)
    }

    const rawDate = parts[0]
    const words = parts.slice(1).filter(Boolean)
    if (words.length !== 3) {
      throw new Error(`CSV-Zeile ${index + 1} benötigt genau 3 Lemmata`)
    }

    const mmdd = isoDateToMmdd(rawDate) || (/^\d{2}-\d{2}$/.test(rawDate) ? rawDate : null)
    if (!mmdd) {
      throw new Error(`CSV-Zeile ${index + 1} enthält ein ungültiges Datum`)
    }

    entries.push({ datum: mmdd, woerter: words })
  }

  return entries
}

function sanitizeBackupBundle(payload) {
  if (!payload || typeof payload !== 'object' || !payload.files || typeof payload.files !== 'object') {
    throw new Error('Ungültiges Backup-Format')
  }

  const files = payload.files
  const lemmata = Array.isArray(files['lemmata.json']) ? files['lemmata.json'] : []
  const kalender = files['kalender.json'] && typeof files['kalender.json'] === 'object' ? files['kalender.json'] : {}
  const zeitreise = files['zeitreise.json'] && typeof files['zeitreise.json'] === 'object' ? files['zeitreise.json'] : {}
  const wortzwilling = files['wortzwilling.json'] && typeof files['wortzwilling.json'] === 'object' ? files['wortzwilling.json'] : {}
  const zeitenwende = files['zeitenwende.json'] && typeof files['zeitenwende.json'] === 'object' ? files['zeitenwende.json'] : {}
  const statsRows = Array.isArray(files['stats-rows.json'])
    ? files['stats-rows.json']
    : Array.isArray(files['stats.json']) ? files['stats.json'] : []

  return { lemmata, kalender, zeitreise, wortzwilling, zeitenwende, statsRows }
}

function sortDatumKeys(keys) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const today = new Date(currentYear, now.getMonth(), now.getDate()).getTime()

  return [...keys].sort((a, b) => {
    const [ma, da] = String(a).split('-').map(Number)
    const [mb, db_] = String(b).split('-').map(Number)
    const dateAThisYear = new Date(currentYear, (ma || 1) - 1, da || 1)
    const dateBThisYear = new Date(currentYear, (mb || 1) - 1, db_ || 1)
    const dateA = dateAThisYear.getTime() >= today
      ? dateAThisYear
      : new Date(currentYear + 1, (ma || 1) - 1, da || 1)
    const dateB = dateBThisYear.getTime() >= today
      ? dateBThisYear
      : new Date(currentYear + 1, (mb || 1) - 1, db_ || 1)
    return dateA - dateB
  })
}

function uniqueLabels(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const label = String(item || '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(label)
  }
  return result
}

function buildModeGroups({ lemmata = [], zeitreiseEntry = null, wortzwillingEntry = null, zeitenwendeEntry = null }) {
  const groups = []

  const kollokationen = uniqueLabels(lemmata.map((item) => item?.lemma))
  if (kollokationen.length) {
    groups.push({ key: 'kollokationen', label: 'Kollokationen', items: kollokationen })
  }

  const zeitreiseItems = uniqueLabels([
    zeitreiseEntry?.lemma,
    ...(Array.isArray(zeitreiseEntry?.paare) ? zeitreiseEntry.paare.map((pair) => pair?.kollokat) : []),
  ])
  if (zeitreiseItems.length) {
    groups.push({ key: 'zeitreise', label: 'Zeitreise', items: zeitreiseItems })
  }

  const wortzwillingItems = uniqueLabels([
    wortzwillingEntry?.wortA,
    wortzwillingEntry?.wortB,
  ])
  if (wortzwillingItems.length) {
    groups.push({ key: 'wortzwilling', label: 'Wort-Zwilling', items: wortzwillingItems })
  }

  const zeitenwendeItems = uniqueLabels([
    zeitenwendeEntry?.lemma,
  ])
  if (zeitenwendeItems.length) {
    groups.push({ key: 'zeitenwende', label: 'Zeitenwende', items: zeitenwendeItems })
  }

  return groups
}

let _statsWindowCache = {
  key: null,
  value: null,
  ts: 0,
}

const STATS_WINDOW_CACHE_TTL_MS = 30 * 1000

function aggregateStatsWindow(days) {
  const stats = loadReadOnly('stats.json') ?? {}
  const statsKeys = Object.keys(stats)
  const cacheKey = `${days}|${statsKeys.length}|${statsKeys.join(',')}`
  if (_statsWindowCache.key === cacheKey && Date.now() - _statsWindowCache.ts < STATS_WINDOW_CACHE_TTL_MS) {
    return _statsWindowCache.value
  }

  const orderedDates = sortDatumKeys(statsKeys)
  const selectedDates = orderedDates.slice(-days)

  const byGameMap = new Map()
  const scoreDistribution = Array(11).fill(0)
  let totalPlays = 0
  let totalScoreSum = 0
  let totalMaxSum = 0

  const rows = []

  for (const datum of selectedDates) {
    const games = stats[datum] || {}
    for (const [spiel, bucket] of Object.entries(games)) {
      const plays = Number(bucket?.plays || 0)
      const scoreSum = Number(bucket?.scoreSum || 0)
      const maxSum = Number(bucket?.maxSum || 0)
      const dist = Array.isArray(bucket?.dist) ? bucket.dist : []

      totalPlays += plays
      totalScoreSum += scoreSum
      totalMaxSum += maxSum

      for (let i = 0; i <= 10; i += 1) {
        scoreDistribution[i] += Number(dist[i] || 0)
      }

      const prev = byGameMap.get(spiel) || { spiel, plays: 0, scoreSum: 0, maxSum: 0 }
      prev.plays += plays
      prev.scoreSum += scoreSum
      prev.maxSum += maxSum
      byGameMap.set(spiel, prev)

      rows.push({ datum, spiel, plays, scoreSum, maxSum })
    }
  }

  const byGame = [...byGameMap.values()]
    .map((row) => ({
      ...row,
      avg10: row.maxSum > 0 ? Number(((row.scoreSum / row.maxSum) * 10).toFixed(2)) : null,
    }))
    .sort((a, b) => b.plays - a.plays)

  const result = {
    days,
    selectedDates,
    rows,
    totals: {
      plays: totalPlays,
      scoreSum: totalScoreSum,
      maxSum: totalMaxSum,
      avg10: totalMaxSum > 0 ? Number(((totalScoreSum / totalMaxSum) * 10).toFixed(2)) : null,
    },
    byGame,
    scoreDistribution,
  }

  _statsWindowCache = {
    key: cacheKey,
    value: result,
    ts: Date.now(),
  }

  return result
}

function toCsvCell(value) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
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

/** POST /admin/auth – tauscht Admin-Key gegen Session-Cookie */
router.post('/admin/auth', loginLimiter, adminAuth)

/** POST /admin/logout – Session beenden */
router.post('/admin/logout', adminLimiter, requireAuth, adminLogout)

/** POST /admin/refresh – Session-Token erneuern (verhindert plötzlichen Logout nach 8h) */
router.post('/admin/refresh', adminLimiter, requireAuth, (_req, res) => {
  try {
    const { token, expiresAt } = createSession()
    const IS_PROD = process.env.NODE_ENV === 'production'
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
    })
    res.json({ ok: true, expiresAt })
  } catch (err) {
    adminError(res, err)
  }
})

/** GET /admin/users – Registrierte Nutzer inkl. Rollen */
router.get('/admin/users', adminLimiter, requireAuth, validate(adminUsersQuerySchema, 'query'), (req, res) => {
  const { limit, role, q } = req.query
  try {
    const search = (q || '').trim()
    const rows = listUsersStmt.all({
      limit,
      role: role || '',
      q: search,
      qLike: `%${search}%`,
    })

    const total = countUsersStmt.get()?.total || 0
    const roleCounts = countUsersByRoleStmt.get() || { teachers: 0, users: 0 }

    const now = Date.now()
    const from7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const from30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
    const growth = adminUsersStatsStmt.get({ fromIso: from7, from30Iso: from30 }) || { newLast7Days: 0, newLast30Days: 0 }

    res.json({
      summary: {
        total,
        users: Number(roleCounts.users || 0),
        teachers: Number(roleCounts.teachers || 0),
        newLast7Days: Number(growth.newLast7Days || 0),
        newLast30Days: Number(growth.newLast30Days || 0),
      },
      users: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: !!row.emailVerified,
        role: row.role,
        createdAt: row.createdAt,
      })),
    })
  } catch (err) {
    adminError(res, err)
  }
})

/** GET /admin/users/:id – Nutzerdetails inkl. Spielstatistik */
router.get('/admin/users/:id', adminLimiter, requireAuth, validate(adminUserIdParamsSchema, 'params'), (req, res) => {
  const userId = String(req.params.id || '').trim()
  if (!userId) return res.status(400).json({ error: 'userId erforderlich' })

  try {
    const user = getUserDetailsStmt.get(userId)
    if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' })

    const byGame = getUserStatsByGameStmt.all(userId).map((row) => ({
      spiel: row.spiel,
      plays: Number(row.plays || 0),
      scoreSum: Number(row.scoreSum || 0),
      maxSum: Number(row.maxSum || 0),
    }))

    const totals = byGame.reduce((acc, row) => {
      acc.plays += Number(row.plays || 0)
      acc.scoreSum += Number(row.scoreSum || 0)
      acc.maxSum += Number(row.maxSum || 0)
      return acc
    }, { plays: 0, scoreSum: 0, maxSum: 0 })

    const recent = getUserRecentStatsStmt.all(userId).map((row) => ({
      datum: row.datum,
      spiel: row.spiel,
      plays: Number(row.plays || 0),
      scoreSum: Number(row.scoreSum || 0),
      maxSum: Number(row.maxSum || 0),
    }))

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: !!user.emailVerified,
        role: user.role,
        createdAt: user.createdAt,
      },
      stats: {
        totals,
        byGame,
        recent,
      },
    })
  } catch (err) {
    adminError(res, err)
  }
})

/** GET /admin/users/:id/stats – Nutzerdetails nur als Statistik-Payload */
router.get('/admin/users/:id/stats', adminLimiter, requireAuth, validate(adminUserIdParamsSchema, 'params'), (req, res) => {
  const userId = String(req.params.id || '').trim()
  if (!userId) return res.status(400).json({ error: 'userId erforderlich' })

  try {
    const user = getUserDetailsStmt.get(userId)
    if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' })

    const byGame = getUserStatsByGameStmt.all(userId).map((row) => ({
      spiel: row.spiel,
      plays: Number(row.plays || 0),
      scoreSum: Number(row.scoreSum || 0),
      maxSum: Number(row.maxSum || 0),
    }))

    const totals = byGame.reduce((acc, row) => {
      acc.plays += Number(row.plays || 0)
      acc.scoreSum += Number(row.scoreSum || 0)
      acc.maxSum += Number(row.maxSum || 0)
      return acc
    }, { plays: 0, scoreSum: 0, maxSum: 0 })

    const recent = getUserRecentStatsStmt.all(userId).map((row) => ({
      datum: row.datum,
      spiel: row.spiel,
      plays: Number(row.plays || 0),
      scoreSum: Number(row.scoreSum || 0),
      maxSum: Number(row.maxSum || 0),
    }))

    res.json({
      userId,
      totals,
      byGame,
      recent,
    })
  } catch (err) {
    adminError(res, err)
  }
})

/** PATCH /admin/users/:id/role – Rolle setzen (user|teacher) */
const setUserRoleHandler = (req, res) => {
  const userId = String(req.params.id || '').trim()
  if (!userId) return res.status(400).json({ error: 'userId erforderlich' })

  try {
    if (!userExistsStmt.get(userId)) {
      return res.status(404).json({ error: 'Nutzer nicht gefunden' })
    }

    const now = Date.now()
    ensureProfileStmt.run(userId, now, now)
    setUserRoleStmt.run(userId, req.body.role, now, now)

    auditUpdate('user', userId, null, { role: req.body.role }, {
      adminKey: req.adminSessionId || 'unknown',
      ip: req.ip,
    })

    logger.info({ userId, role: req.body.role }, 'Nutzerrolle aktualisiert')
    res.json({ ok: true, userId, role: req.body.role })
  } catch (err) {
    adminError(res, err)
  }
}

router.patch('/admin/users/:id/role', adminLimiter, requireAuth, validate(adminSetUserRoleSchema), setUserRoleHandler)
router.post('/admin/users/:id/role', adminLimiter, requireAuth, validate(adminSetUserRoleSchema), setUserRoleHandler)

/** DELETE /admin/users/:id – Nutzer löschen */
router.delete('/admin/users/:id', adminLimiter, requireAuth, validate(adminUserIdParamsSchema, 'params'), (req, res) => {
  const userId = String(req.params.id || '').trim()
  if (!userId) return res.status(400).json({ error: 'userId erforderlich' })

  try {
    const existing = getUserDetailsStmt.get(userId)
    if (!existing) return res.status(404).json({ error: 'Nutzer nicht gefunden' })

    deleteUserTx(userId)

    auditDelete('user', userId, {
      email: existing.email,
      role: existing.role,
    }, {
      adminKey: req.adminSessionId || 'unknown',
      ip: req.ip,
    })

    logger.info({ userId }, 'Nutzer geloescht')
    res.json({ ok: true, userId })
  } catch (err) {
    adminError(res, err)
  }
})

/** POST /admin/users/bulk-update – Bulk-Aktionen fuer Nutzer */
router.post('/admin/users/bulk-update', adminLimiter, requireAuth, validate(adminUsersBulkUpdateSchema), (req, res) => {
  const { action, userIds, role, format } = req.body
  try {
    const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))]
    if (!uniqueIds.length) return res.status(400).json({ error: 'Keine gueltigen userIds uebergeben' })

    const users = getUsersByIdsStmt.all(JSON.stringify(uniqueIds))
    const byId = new Map(users.map((user) => [user.id, user]))
    const foundIds = new Set(users.map((user) => user.id))
    const skipped = uniqueIds.filter((id) => !foundIds.has(id))

    if (action === 'setRole') {
      const now = Date.now()
      const updated = []
      for (const user of users) {
        ensureProfileStmt.run(user.id, now, now)
        setUserRoleStmt.run(user.id, role, now, now)
        updated.push(user.id)
        auditUpdate('user', user.id, { role: user.role }, { role }, {
          adminKey: req.adminSessionId || 'unknown',
          ip: req.ip,
        })
      }

      return res.json({
        ok: true,
        action,
        role,
        requestedCount: uniqueIds.length,
        changedCount: updated.length,
        changed: updated,
        skipped,
      })
    }

    if (action === 'delete') {
      const deleted = []
      for (const user of users) {
        deleteUserTx(user.id)
        deleted.push(user.id)
        auditDelete('user', user.id, { email: user.email, role: user.role }, {
          adminKey: req.adminSessionId || 'unknown',
          ip: req.ip,
        })
      }

      return res.json({
        ok: true,
        action,
        requestedCount: uniqueIds.length,
        deletedCount: deleted.length,
        deleted,
        skipped,
      })
    }

    if (action === 'export') {
      const exportRows = users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: !!user.emailVerified,
        createdAt: user.createdAt,
      }))

      if (format === 'csv') {
        const header = ['id', 'name', 'email', 'role', 'emailVerified', 'createdAt']
        const csvLines = [header.join(',')]
        for (const row of exportRows) {
          csvLines.push([
            toCsvCell(row.id),
            toCsvCell(row.name || ''),
            toCsvCell(row.email || ''),
            toCsvCell(row.role || 'user'),
            toCsvCell(row.emailVerified ? '1' : '0'),
            toCsvCell(row.createdAt || ''),
          ].join(','))
        }

        const csv = csvLines.join('\n')
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="signifikation-users-bulk-${new Date().toISOString().slice(0, 10)}.csv"`)
        res.setHeader('X-Exported-Count', String(exportRows.length))
        res.setHeader('X-Skipped-Count', String(skipped.length))
        return res.send(csv)
      }

      return res.json({
        ok: true,
        action,
        requestedCount: uniqueIds.length,
        exportedCount: exportRows.length,
        users: exportRows,
        skipped,
      })
    }

    return res.status(400).json({ error: 'Unbekannte Bulk-Aktion' })
  } catch (err) {
    adminError(res, err)
  }
})

/** GET /admin/stats/summary – Aggregierte Stats + Top-Nutzer */
router.get('/admin/stats/summary', adminLimiter, requireAuth, validate(adminStatsSummaryQuerySchema, 'query'), (req, res) => {
  const { days, topUsers: topUsersLimit } = req.query

  try {
    const windowStats = aggregateStatsWindow(days)

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

/** GET /admin/stats/export – CSV/JSON Export aggregierter Stats */
router.get('/admin/stats/export', adminLimiter, requireAuth, validate(adminStatsExportQuerySchema, 'query'), (req, res) => {
  const { days, format } = req.query

  try {
    const windowStats = aggregateStatsWindow(days)
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

/** GET /admin/performance – Performance-Metriken fuer Dashboard */
router.get('/admin/performance', adminLimiter, requireAuth, (req, res) => {
  try {
    const queryCache = getQueryCacheMetrics()
    const belegeCache = getCacheMetrics()
    const statsRows = countStatsRowsStmt.get() || { totalRows: 0, identifiedRows: 0, totalPlays: 0 }
    const userCount = countUsersStmt.get()?.total || 0
    const classSessions = countClassroomSessionsStmt.get()?.total || 0

    let dbSizeBytes = 0
    let walSizeBytes = 0
    try {
      dbSizeBytes = statSync(join(__dirname, '../data/signifikation.db')).size
    } catch {
      dbSizeBytes = 0
    }
    try {
      walSizeBytes = statSync(join(__dirname, '../data/signifikation.db-wal')).size
    } catch {
      walSizeBytes = 0
    }

    res.json({
      uptimeSec: Math.floor(process.uptime()),
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      db: {
        path: join(__dirname, '../data/signifikation.db'),
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

/** GET /admin/stats – Spielstatistik der letzten N Tage */
router.get('/admin/stats', adminLimiter, requireAuth, validate(adminStatsQuerySchema, 'query'), (req, res) => {
  const { days } = req.query
  try {
    const stats  = loadReadOnly('stats.json') ?? {}
    const sorted = Object.keys(stats).sort()
    const result = sorted.slice(-days).map(datum => ({ datum, ...stats[datum] }))
    res.json(result)
  } catch (err) { serverError(res, err) }
})

/** GET /admin/health – Systemdetails (auth-required) */
router.get('/admin/health', adminLimiter, requireAuth, async (_req, res) => {
  let lastEntry = null
  try {
    const kalender = loadReadOnly('kalender.json')
    const keys = Object.keys(kalender).sort()
    lastEntry = keys[keys.length - 1] || null
  } catch { /* ignorieren */ }

  let wortprofilDb = 'ok'
  try {
    await fetchRelation('haus', 'Substantiv', 'ATTR')
  } catch (err) {
    wortprofilDb = `error: ${err.message}`
  }

  res.json({
    status:      'ok',
    uptime:      Math.floor(process.uptime()),
    env:         process.env.NODE_ENV === 'production' ? 'production' : 'development',
    lastEntry,
    memMb:       Math.round(process.memoryUsage().rss / 1024 / 1024),
    wortprofilDb,
    belegeDb:    belegeVerfuegbar() ? 'ok' : 'nicht verfügbar',
  })
})

/** GET /admin/cache-metrics – Cache-Performance-Metriken */
router.get('/admin/cache-metrics', adminLimiter, requireAuth, (req, res) => {
  try {
    const belegeCache = getCacheMetrics()
    const queryCache = getQueryCacheMetrics()
    res.json({
      belege: belegeCache,
      queryResults: queryCache,
      timestamp: new Date().toISOString()
    })
  } catch (err) { adminError(res, err) }
})

/** POST /admin/cache-clear – Alle Caches leeren */
router.post('/admin/cache-clear', adminLimiter, requireAuth, (req, res) => {
  try {
    clearQueryCache()
    logger.info('Alle Query-Caches geleert')
    res.json({ ok: true, message: 'Query-Cache geleert' })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/audit-log – Audit-Protokoll der letzten Admin-Änderungen */
router.get('/admin/audit-log', adminLimiter, requireAuth, validate(adminAuditLogQuerySchema, 'query'), (req, res) => {
  try {
    const { action, resource, status, q, from: fromRaw, to: toRaw } = req.query

    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 100))
    const from = fromRaw ? new Date(fromRaw) : null
    const to = toRaw ? new Date(toRaw) : null

    // Groesseres Fenster laden und danach filtern, damit Filter wirklich greifen.
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

/** GET /admin/audit-log/:resource/:id – Audit-Historie für eine konkrete Entität */
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

/** POST /admin/kalender/bulk-delete – mehrere Kalendereintraege gleichzeitig loeschen */
router.post('/admin/kalender/bulk-delete', adminLimiter, requireAuth, validate(adminBulkDeleteCalendarSchema), async (req, res) => {
  const { dates } = req.body
  try {
    const kalender = load('kalender.json')
    const zeitreise = loadZeitreise()
    const wortzwilling = loadWortZwilling()
    const zeitenwende = loadZeitenwende()

    const removed = []
    const skipped = []

    for (const datum of dates) {
      if (!kalender[datum]) {
        skipped.push(datum)
        continue
      }

      const deletedData = {
        ids: kalender[datum],
        zeitreise: zeitreise[datum],
        wortzwilling: wortzwilling[datum],
        zeitenwende: zeitenwende[datum],
      }

      delete kalender[datum]
      delete zeitreise[datum]
      delete wortzwilling[datum]
      delete zeitenwende[datum]

      removed.push(datum)

      auditDelete('kalender', datum, deletedData, {
        adminKey: req.adminSessionId || 'unknown',
        ip: req.ip,
      })
    }

    if (removed.length > 0) {
      await save('kalender.json', kalender)
      await save('zeitreise.json', zeitreise)
      await save('wortzwilling.json', wortzwilling)
      await save('zeitenwende.json', zeitenwende)
    }

    res.json({ ok: true, removed, skipped, removedCount: removed.length, skippedCount: skipped.length })
  } catch (err) {
    adminError(res, err)
  }
})

/** POST /admin/kalender/bulk-import – mehrere Kalendereinträge per CSV anlegen */
router.post('/admin/kalender/bulk-import', adminLimiter, requireAuth, validate(adminBulkImportCalendarSchema), async (req, res) => {
  try {
    const entries = parseCalendarBulkImport(req.body.csv)
    const kalender = load('kalender.json')
    const imported = []
    const replaced = []

    for (const entry of entries) {
      const ids = []
      const lemmataDB = load('lemmata.json')

      for (const wort of entry.woerter) {
        const lemma = await fetchLemma(wort, 'Substantiv')
        const { byId } = getLemmataIndex()
        if (byId.has(lemma.id)) {
          const idx = lemmataDB.findIndex((item) => item.id === lemma.id)
          if (idx >= 0) lemmataDB[idx] = { ...lemmataDB[idx], ...lemma }
        } else {
          lemmataDB.push(lemma)
        }
        ids.push(lemma.id)
      }

      await save('lemmata.json', lemmataDB)
      const existed = Array.isArray(kalender[entry.datum])
      kalender[entry.datum] = ids
      imported.push({ datum: entry.datum, ids, woerter: entry.woerter })
      if (existed) replaced.push(entry.datum)

      auditCreate('kalender', entry.datum, { ids, woerter: entry.woerter, importedVia: 'csv' }, {
        adminKey: req.adminSessionId || 'unknown',
        ip: req.ip,
      })
    }

    await save('kalender.json', kalender)

    res.json({
      ok: true,
      importedCount: imported.length,
      replacedCount: replaced.length,
      imported,
      replaced,
    })
  } catch (err) {
    adminError(res, err)
  }
})

/** POST /admin/preview/lemma – Vorschau fuer ein einzelnes Lemma */
router.post('/admin/preview/lemma', adminLimiter, requireAuth, validate(adminPreviewLemmaSchema), async (req, res) => {
  const { lemma, pos } = req.body
  try {
    const [entry, bonusQ, wikt] = await Promise.all([
      fetchLemma(lemma, pos),
      fetchBonusQuestion(lemma, pos).catch(() => null),
      fetchWiktionary(lemma).catch(() => ({ ipa: '', definitionen: [] })),
    ])

    res.json({
      lemma: entry.lemma,
      id: entry.id,
      pos: entry.pos,
      wortart: entry.wortart,
      runden: entry.runden,
      rundenInfo: entry.rundenInfo,
      rundenSummary: Array.isArray(entry.rundenInfo)
        ? entry.rundenInfo.map((round) => ({
            key: round.key,
            label: round.label,
            relCode: round.relCode,
            count: Array.isArray(entry.runden?.[round.key]) ? entry.runden[round.key].length : 0,
          }))
        : [],
      bonusFrage: bonusQ,
      ipa: wikt.ipa,
      definitionen: wikt.definitionen,
    })
  } catch (err) {
    adminError(res, err)
  }
})

/** GET /admin/preview/day/:datum – Vorschau fuer einen kompletten Tag */
router.get('/admin/preview/day/:datum', adminLimiter, requireAuth, validate(adminPreviewDayParamsSchema, 'params'), (req, res) => {
  const { datum } = req.params
  try {
    const kalender = loadReadOnly('kalender.json')
    const ids = kalender[datum]
    if (!ids) return res.status(404).json({ error: 'Kein Eintrag fuer dieses Datum' })

    const { byId } = getLemmataIndex()
    const zeitreise = loadZeitreise()
    const wortzwilling = loadWortZwilling()
    const zeitenwende = loadZeitenwende()

    const lemmata = ids.map((id) => {
      const l = byId.get(id)
      if (!l) return null
      return {
        id: l.id,
        lemma: l.lemma,
        pos: l.pos,
        wortart: l.wortart,
        notiz: l.notiz || '',
        link: l.link || '',
        definition: l.definition || '',
        ipa: l.ipa || '',
        definitionen: l.definitionen || [],
      }
    }).filter(Boolean)

    const zeitreiseEntry = zeitreise[datum] || null
    const wortzwillingEntry = wortzwilling[datum] || null
    const zeitenwendeEntry = zeitenwende[datum] || null
    const modeGroups = buildModeGroups({
      lemmata,
      zeitreiseEntry,
      wortzwillingEntry,
      zeitenwendeEntry,
    })

    res.json({
      datum,
      lemmata,
      modeGroups,
      modes: {
        kollokationen: { enabled: lemmata.length > 0, count: lemmata.length },
        zeitreise: { enabled: !!zeitreiseEntry, data: zeitreiseEntry },
        wortzwilling: { enabled: !!wortzwillingEntry, data: wortzwillingEntry },
        zeitenwende: { enabled: !!zeitenwendeEntry, data: zeitenwendeEntry },
      },
    })
  } catch (err) {
    adminError(res, err)
  }
})


/** GET /admin/wiktionary-def?q=Wort – Definition aus Wiktionary abrufen */
router.get('/admin/wiktionary-def', adminLimiter, requireAuth, validate(qQuerySchema, 'query'), async (req, res) => {
  const { q } = req.query
  try {
    const url = `https://de.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(q)}`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Signifikation/1.0 (signifikation.de; Bildungsprojekt)' },
    })
    if (!r.ok) return res.json({ definition: null })
    const data = await r.json()
    const defs = data.de?.[0]?.definitions ?? []
    if (!defs.length) return res.json({ definition: null })
    // HTML-Tags entfernen, numerierte Definitionen zusammenfügen
    const clean = defs
      .map(d => d.definition.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .join(' ')
    res.json({ definition: clean })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-kollokation?q=Wort&pos=Substantiv – Kollokationswort analysieren */
router.get('/admin/analyze-kollokation', adminLimiter, requireAuth, validate(analyzeKollQuerySchema, 'query'), async (req, res) => {
  const { q: lemma, pos } = req.query
  const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  try {
    const [roundResults, bonusQ] = await Promise.all([
      Promise.allSettled(rounds.map(r => fetchRelation(lemma, pos, r.relCode))),
      fetchBonusQuestion(lemma, pos).catch(() => null),
    ])
    const runden = rounds.map((round, i) => {
      const r = roundResults[i]
      if (r.status === 'rejected') return { ...round, items: [], count: 0, usable: false, error: r.reason.message }
      const items = r.value.filter(it => !it.lemma.includes(' ') && it.lemma.length > 1)
      return {
        ...round,
        items:  items.slice(0, 10).map(it => ({ wort: it.lemma, logDice: parseFloat(parseFloat(it.logDice).toFixed(2)) })),
        count:  items.length,
        usable: items.length >= 5,
      }
    })
    const allItems = runden.flatMap(r => r.items)
    const seen = new Set()
    const top3 = allItems
      .sort((a, b) => b.logDice - a.logDice)
      .filter(it => { if (seen.has(it.wort)) return false; seen.add(it.wort); return true })
      .slice(0, 3)
    const usable = runden.every(r => r.usable)
    res.json({ lemma, pos, runden, top3, bonus: bonusQ, usable })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-wortzwilling?a=WortA&b=WortB&pos=Substantiv – Wortpaar analysieren */
router.get('/admin/analyze-wortzwilling', adminLimiter, requireAuth, validate(analyzeWZQuerySchema, 'query'), async (req, res) => {
  const { a: wortA, b: wortB, pos } = req.query
  try {
    const result = await fetchWortZwilling(wortA.trim(), wortB.trim(), pos)
    if (!result) return res.json({ usable: false, wortA, wortB, reason: 'Nicht genug distinkte Kollokatoren (mind. 5 pro Seite nötig)' })
    res.json({ ...result, usable: true })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-zeitreise?q=Wort – Zeitreise-Eignung prüfen */
router.get('/admin/analyze-zeitreise', adminLimiter, requireAuth, validate(analyzeZeitQuerySchema, 'query'), async (req, res) => {
  const { q: lemma } = req.query
  try {
    const result = await fetchZeitreiseAnalyze(lemma.trim())
    if (!result) {
      return res.json({ usable: false, noData: true, lemma, reason: 'Keine Zeitreise-Daten für dieses Wort gefunden.' })
    }
    res.json({ usable: result.usable, lemma: result.lemma, decades: result.perioden.length, paare: result.paare, perioden: result.perioden })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/analyze-zeitenwende?q=Wort – Zeitenwende-Eignung prüfen */
router.get('/admin/analyze-zeitenwende', adminLimiter, requireAuth, validate(analyzeZWendeQuerySchema, 'query'), async (req, res) => {
  const { q: lemma } = req.query
  try {
    const result = await fetchZeitenwendeAnalyze(lemma.trim())
    if (!result) return res.json({ usable: false, noData: true, lemma, reason: 'Keine Zeitenwende-Daten für dieses Wort gefunden.' })
    res.json(result)
  } catch (err) { adminError(res, err) }
})

/** POST /admin/tag – Tageseintrag anlegen/überschreiben */
router.post('/admin/tag', adminLimiter, requireAuth, validate(adminTagSchema), async (req, res) => {
  const { datum, woerter, notizen, links, definitionen, positionen, zeitreise_lemma, zeitreise_wortart, zwilling_paar, zwilling_pos, zeitenwende_lemma } = req.body

  try {
    const lemmataDB = load('lemmata.json')
    const kalender  = load('kalender.json')
    const ids       = []

    for (const [i, wort] of woerter.entries()) {
      const pos = (positionen?.[i] || 'Substantiv')
      logger.info(`Lade DWDS-Daten für „${wort}" (${pos}) …`)
      const entry   = await fetchLemma(wort, pos)
      entry.notiz       = notizen[i]      || ''
      entry.link        = links[i]        || ''
      entry.definition  = definitionen[i] || ''
      entry.bonusFrage  = await fetchBonusQuestion(wort, pos).catch(() => null)
      // Wiktionary: IPA + Bedeutungen automatisch holen und lokal speichern
      logger.info(`Lade Wiktionary-Daten für „${wort}" …`)
      const wikt        = await fetchWiktionary(wort).catch(() => ({ ipa: '', definitionen: [] }))
      entry.ipa         = wikt.ipa
      entry.definitionen = wikt.definitionen
      // Direkter Index-Lookup statt findIndex
      const { byId } = getLemmataIndex()
      if (byId.has(entry.id)) {
        const idx = lemmataDB.findIndex(l => l.id === entry.id)
        lemmataDB[idx] = entry
      } else {
        lemmataDB.push(entry)
      }
      ids.push(entry.id)
    }

    kalender[datum] = ids
    await save('lemmata.json', lemmataDB)
    await save('kalender.json', kalender)

    // Zeitreise optional
    let zeitreiseOk = null
    if (zeitreise_lemma.trim()) {
      logger.info(`Lade DiaCollo-Daten für „${zeitreise_lemma}" …`)
      try {
        const zr = await fetchZeitreise(zeitreise_lemma.trim())
        const zeitreise = loadZeitreise()
        if (zr) {
          zeitreise[datum] = { ...zr, wortart: zeitreise_wortart?.trim() || 'Substantiv' }
          await save('zeitreise.json', zeitreise)
          zeitreiseOk = true
          logger.info(`Zeitreise gespeichert: ${zr.paare.map(p => `${p.jahrzehnt}:${p.kollokat}`).join(', ')}`)
        } else {
          zeitreiseOk = false
          logger.warn(`Zeitreise: nicht genügend DiaCollo-Daten für „${zeitreise_lemma}"`)
        }
      } catch (err) {
        zeitreiseOk = false
        logger.error({ err }, 'Zeitreise-Fehler')
      }
    }

    // Wort-Zwilling optional
    let zwillingOk = null
    if (Array.isArray(zwilling_paar) && zwilling_paar.length === 2 && zwilling_paar[0] && zwilling_paar[1]) {
      logger.info(`Lade Wort-Zwilling-Daten für „${zwilling_paar[0]}" / „${zwilling_paar[1]}" …`)
      try {
        const wz = await fetchWortZwilling(zwilling_paar[0].trim(), zwilling_paar[1].trim(), zwilling_pos)
        const wortzwilling = loadWortZwilling()
        if (wz) {
          wortzwilling[datum] = wz
          await save('wortzwilling.json', wortzwilling)
          zwillingOk = true
        } else {
          zwillingOk = false
          logger.warn(`Wort-Zwilling: nicht genug distinkte Kollokatoren für „${zwilling_paar.join(' / ')}"`)
        }
      } catch (err) {
        zwillingOk = false
        logger.error({ err }, 'Wort-Zwilling-Fehler')
      }
    }

    // Zeitenwende optional
    let zeitenwendeOk = null
    if (zeitenwende_lemma?.trim()) {
      logger.info(`Lade Zeitenwende-Daten für „${zeitenwende_lemma}" …`)
      try {
        const zw = await fetchZeitenwende(zeitenwende_lemma.trim())
        const zeitenwende = loadZeitenwende()
        if (zw) {
          zeitenwende[datum] = zw
          await save('zeitenwende.json', zeitenwende)
          zeitenwendeOk = true
          logger.info(`Zeitenwende gespeichert: ${zw.words.length} Wörter für „${zw.lemma}"`)
        } else {
          zeitenwendeOk = false
          logger.warn(`Zeitenwende: nicht genug distinkte Kollokatoren für „${zeitenwende_lemma}"`)
        }
      } catch (err) {
        zeitenwendeOk = false
        logger.error({ err }, 'Zeitenwende-Fehler')
      }
    }

    logger.info(`Eintrag gespeichert: ${datum} → ${ids.join(', ')}`)

    // Audit-Log für Create-Operation
    auditCreate('kalender', datum, { ids, woerter, zeitreise: !!zeitreise_lemma, zwilling: !!zwilling_paar?.[0], zeitenwende: !!zeitenwende_lemma }, {
      adminKey: req.adminSessionId || 'unknown',
      ip: req.ip,
    })

    res.json({ ok: true, datum, ids, zeitreiseOk, zwillingOk, zeitenwendeOk })
  } catch (err) {
    serverError(res, err)
  }
})

/** POST /admin/wiktionary-backfill – IPA + Definitionen für alle bestehenden Lemmata nachholen */
router.post('/admin/wiktionary-backfill', adminLimiter, requireAuth, async (req, res) => {
  try {
    const lemmataDB = load('lemmata.json')
    let updated = 0
    let skipped = 0
    for (const entry of lemmataDB) {
      if (entry.ipa && entry.definitionen?.length) { skipped++; continue }
      const wikt = await fetchWiktionary(entry.lemma).catch(() => ({ ipa: '', definitionen: [] }))
      entry.ipa         = wikt.ipa
      entry.definitionen = wikt.definitionen
      updated++
    }
    await save('lemmata.json', lemmataDB)
    logger.info(`Wiktionary-Backfill: ${updated} aktualisiert, ${skipped} bereits vorhanden`)
    res.json({ ok: true, updated, skipped })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/kalender – alle Einträge (inkl. Zeitreise-, Wort-Zwilling- und Zeitenwende-Status) */
router.get('/admin/kalender', adminLimiter, requireAuth, (req, res) => {
  try {
  const kalender     = loadReadOnly('kalender.json')
  const { byId }     = getLemmataIndex()
  const zeitreise    = loadZeitreise()
  const wortzwilling = loadWortZwilling()
  const zeitenwende  = loadZeitenwende()
  const result = {}
  for (const [datum, ids] of Object.entries(kalender)) {
    const lemmata = ids.map(id => {
      const l = byId.get(id)
      return { id, lemma: l?.lemma || id, notiz: l?.notiz || '' }
    })
    const zeitreiseEntry = zeitreise[datum] || null
    const wortzwillingEntry = wortzwilling[datum] || null
    const zeitenwendeEntry = zeitenwende[datum] || null
    result[datum] = {
      lemmata,
      modeGroups: buildModeGroups({
        lemmata,
        zeitreiseEntry,
        wortzwillingEntry,
        zeitenwendeEntry,
      }),
      hasZeitreise:      !!zeitreiseEntry,
      hasWortZwilling:   !!wortzwillingEntry,
      hasZeitenwende:    !!zeitenwendeEntry,
    }
  }
  res.json(result)
  } catch (err) { adminError(res, err) }
})

/** GET /admin/tag/:datum – Eintrag zum Bearbeiten laden */
router.get('/admin/tag/:datum', adminLimiter, requireAuth, (req, res) => {
  if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
  const kalender    = loadReadOnly('kalender.json')
  const { byId }    = getLemmataIndex()
  const zeitreise   = loadZeitreise()
  const zeitenwende = loadZeitenwende()
  const ids = kalender[req.params.datum]
  if (!ids) return res.status(404).json({ error: 'Kein Eintrag' })
  const lemmata = ids.map(id => byId.get(id)).filter(Boolean)
  const wz = (loadReadOnly('wortzwilling.json') ?? {})[req.params.datum]
  res.json({
    datum:              req.params.datum,
    woerter:            lemmata.map(l => l.lemma),
    positionen:         lemmata.map(l => l.pos || 'Substantiv'),
    notizen:            lemmata.map(l => l.notiz      || ''),
    links:              lemmata.map(l => l.link       || ''),
    definitionen:       lemmata.map(l => l.definition || ''),
    zeitreise_lemma:    zeitreise[req.params.datum]?.lemma   || '',
    zeitreise_wortart:  zeitreise[req.params.datum]?.wortart || 'Substantiv',
    zwilling_paar:      wz ? [wz.wortA, wz.wortB] : [],
    zwilling_pos:       wz?.pos || 'Substantiv',
    zeitenwende_lemma:  zeitenwende[req.params.datum]?.lemma || '',
  })
})

/** DELETE /admin/tag/:datum – Eintrag löschen */
router.delete('/admin/tag/:datum', adminLimiter, requireAuth, async (req, res) => {
  if (!/^\d{2}-\d{2}$/.test(req.params.datum)) return res.status(400).json({ error: 'Ungültiges Datumsformat' })
  try {
    const kalender     = load('kalender.json')
    const zeitreise    = loadZeitreise()
    const wortzwilling = loadWortZwilling()
    const zeitenwende  = loadZeitenwende()
    const datum        = req.params.datum

    // Speichere Daten vor Löschung für Audit-Log
    const deletedData = {
      ids:          kalender[datum],
      zeitreise:    zeitreise[datum],
      wortzwilling: wortzwilling[datum],
      zeitenwende:  zeitenwende[datum],
    }

    delete kalender[datum]
    delete zeitreise[datum]
    delete wortzwilling[datum]
    delete zeitenwende[datum]

    await save('kalender.json', kalender)
    await save('zeitreise.json', zeitreise)
    await save('wortzwilling.json', wortzwilling)
    await save('zeitenwende.json', zeitenwende)

    // Audit-Log für Delete-Operation
    auditDelete('kalender', datum, deletedData, {
      adminKey: req.adminSessionId || 'unknown',
      ip: req.ip,
    })

    res.json({ ok: true })
  } catch (err) {
    serverError(res, err)
  }
})

/** POST /admin/backup/gist – manuell Backup nach GitHub Gist anstoßen */
router.post('/admin/backup/gist', adminLimiter, requireAuth, async (req, res) => {
  try {
    const { runBackup } = await import('../backup.js')
    const result = await runBackup()
    res.json({ ok: true, ...result })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/backup – alle Daten als Bundle */
router.get('/admin/backup', adminLimiter, requireAuth, (req, res) => {
  try {
    const files  = ['kalender.json', 'lemmata.json', 'zeitreise.json', 'wortzwilling.json', 'zeitenwende.json', 'stats.json', 'stats-rows.json']
    const bundle = {}
    for (const f of files) {
      try {
        bundle[f] = f === 'stats-rows.json' ? loadStatsRows() : loadReadOnly(f)
      } catch {
        bundle[f] = null
      }
    }
    res.setHeader('Content-Disposition', `attachment; filename="signifikation-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.json({ exportedAt: new Date().toISOString(), files: bundle })
  } catch (err) { serverError(res, err) }
})

/** POST /admin/backup/restore – JSON-Backup in den aktuellen Datenbestand zurückspielen */
router.post('/admin/backup/restore', adminLimiter, requireAuth, validate(adminBackupRestoreSchema), async (req, res) => {
  try {
    const bundle = sanitizeBackupBundle(req.body)

    await save('lemmata.json', bundle.lemmata)
    await save('kalender.json', bundle.kalender)
    await save('zeitreise.json', bundle.zeitreise)
    await save('wortzwilling.json', bundle.wortzwilling)
    await save('zeitenwende.json', bundle.zeitenwende)
    await save('stats-rows.json', bundle.statsRows)

    auditUpdate('backup', 'restore', null, {
      exportedAt: req.body.exportedAt || null,
      files: Object.keys(req.body.files || {}),
    }, {
      adminKey: req.adminSessionId || 'unknown',
      ip: req.ip,
    })

    res.json({
      ok: true,
      restored: {
        lemmata: Array.isArray(bundle.lemmata) ? bundle.lemmata.length : 0,
        kalender: Object.keys(bundle.kalender || {}).length,
        zeitreise: Object.keys(bundle.zeitreise || {}).length,
        wortzwilling: Object.keys(bundle.wortzwilling || {}).length,
        zeitenwende: Object.keys(bundle.zeitenwende || {}).length,
        statsRows: Array.isArray(bundle.statsRows) ? bundle.statsRows.length : 0,
      },
    })
  } catch (err) {
    adminError(res, err)
  }
})


/** POST /admin/upload-wortprofil – wortprofil.db in Chunks hochladen (raw binary) */
const UPLOAD_CHUNK_LIMIT = 10 * 1024 * 1024  // 10 MB pro Chunk
const UPLOAD_TOTAL_LIMIT = 2.5 * 1024 * 1024 * 1024  // 2.5 GB gesamt (wortprofil.db ~1.9 GB)

router.post('/admin/upload-wortprofil', uploadLimiter, requireAuth, (req, res) => {
  const idxRaw   = parseInt(req.query.index, 10)
  const totalRaw = parseInt(req.query.total, 10)
  if (!Number.isFinite(idxRaw) || !Number.isFinite(totalRaw) || totalRaw < 1)
    return res.status(400).json({ error: 'index/total müssen gültige Zahlen sein' })

  const dataDir = join(__dirname, '../data')
  const tmpPath = join(dataDir, 'wortprofil.db.upload')
  const chunks  = []
  let   received = 0

  req.on('data', d => {
    received += d.length
    if (received > UPLOAD_CHUNK_LIMIT) {
      req.destroy(new Error('Chunk überschreitet Limit'))
      return
    }
    chunks.push(d)
  })

  req.on('end', () => {
    try {
      // Gesamtgröße prüfen: vorhandene tmp-Datei + dieser Chunk
      const existingSize = existsSync(tmpPath) ? statSync(tmpPath).size : 0
      if (existingSize + received > UPLOAD_TOTAL_LIMIT) {
        try { unlinkSync(tmpPath) } catch {}
        return res.status(413).json({ error: 'Upload überschreitet Gesamtlimit' })
      }

      const buf    = Buffer.concat(chunks)
      // Einzelnen Stream pro Chunk öffnen, sequenziell über 'finish' abwarten
      const stream = createWriteStream(tmpPath, { flags: idxRaw === 0 ? 'w' : 'a' })
      stream.once('error', err => adminError(res, err))
      stream.once('finish', () => {
        if (idxRaw === totalRaw - 1) {
          const dbPath  = join(dataDir, 'wortprofil.db')
          const bakPath = join(dataDir, 'wortprofil.db.bak')
          if (existsSync(dbPath)) renameSync(dbPath, bakPath)
          renameSync(tmpPath, dbPath)
          if (existsSync(bakPath)) { try { unlinkSync(bakPath) } catch (e) { logger.warn({ err: e }, 'Backup konnte nicht gelöscht werden') } }
          logger.info('wortprofil.db Upload abgeschlossen und aktiviert')
          res.json({ ok: true, done: true })
        } else {
          res.json({ ok: true, done: false, index: idxRaw })
        }
      })
      stream.end(buf)
    } catch (err) { adminError(res, err) }
  })

  req.on('error', err => {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch {}
    adminError(res, err)
  })
})

/** GET /admin/social-cards – Social Cards Generator */
router.get('/admin/social-cards', requireAuth, (req, res) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "frame-ancestors 'none';"
  )
  res.sendFile(join(__dirname, '../social-cards.html'))
})

/** GET /admin/social-cards/tagesdata?datum=MM-DD – Lemmata + WZ für ein Datum */
router.get('/admin/social-cards/tagesdata', adminLimiter, requireAuth, validate(adminSocialCardsTagesdataSchema, 'query'), (req, res) => {
  const { datum } = req.query
  try {
    const kalender     = loadReadOnly('kalender.json')
    const { byId }     = getLemmataIndex()
    const wortzwilling = loadWortZwilling()
    const ids = kalender[datum] ?? []
    const lemmata = ids.map(id => {
      const l = byId.get(id)
      if (!l) return null
      return {
        id:          l.id,
        lemma:       l.lemma,
        pos:         l.pos,
        ipa:         l.ipa || '',
        definitionen: Array.isArray(l.definitionen) ? l.definitionen : [],
      }
    }).filter(Boolean)
    const wz = wortzwilling[datum] ?? null
    res.json({ datum, lemmata, wortzwilling: wz })
  } catch (err) { adminError(res, err) }
})

/** GET /admin/social-cards/belege?lemma=X&collocate=Y – Korpusbelege für ein Paar */
router.get('/admin/social-cards/belege', adminLimiter, requireAuth, validate(adminSocialCardsBelegeSchema, 'query'), (req, res) => {
  const { lemma, collocate } = req.query
  try {
    const belege = fetchBelege(lemma, collocate, { limit: 5 })
    res.json({ belege })
  } catch (err) { adminError(res, err) }
})

/** GET /admin – Admin-Oberfläche */
router.get('/admin', (req, res) => {
  // 'unsafe-inline' in script-src und style-src ist weiterhin nötig:
  // - script-src: onclick-Attribute im HTML (TODO: auf Event Listener umstellen)
  // - style-src: dynamische style="…"-Attribute in den JS-Renderfunktionen
  //   (Balkenbreiten, Korpusfarben, logDice-abhängige Werte – können nicht in externe CSS-Klassen).
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  )
  res.sendFile(join(__dirname, '../admin.html'))
})

export default router
