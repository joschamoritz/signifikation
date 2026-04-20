import express from 'express'

function mapUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: !!row.emailVerified,
    role: row.role,
    createdAt: row.createdAt,
  }
}

function buildUserStatsPayload(byGameRows, recentRows) {
  const byGame = byGameRows.map((row) => ({
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

  const recent = recentRows.map((row) => ({
    datum: row.datum,
    spiel: row.spiel,
    plays: Number(row.plays || 0),
    scoreSum: Number(row.scoreSum || 0),
    maxSum: Number(row.maxSum || 0),
  }))

  return { totals, byGame, recent }
}

export function createAdminUsersRouter(deps) {
  const {
    adminLimiter,
    requireAuth,
    validate,
    adminUsersQuerySchema,
    adminSetUserRoleSchema,
    adminUserIdParamsSchema,
    adminUsersBulkUpdateSchema,
    countUsersStmt,
    countUsersByRoleStmt,
    listUsersStmt,
    getUserDetailsStmt,
    getUserStatsByGameStmt,
    getUserRecentStatsStmt,
    ensureProfileStmt,
    setUserRoleStmt,
    userExistsStmt,
    getUsersByIdsStmt,
    deleteUserTx,
    adminUsersStatsStmt,
    toCsvCell,
    auditUpdate,
    auditDelete,
    adminError,
    logger,
  } = deps

  const router = express.Router()

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
        users: rows.map(mapUserRow),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/users/:id', adminLimiter, requireAuth, validate(adminUserIdParamsSchema, 'params'), (req, res) => {
    const userId = String(req.params.id || '').trim()
    if (!userId) return res.status(400).json({ error: 'userId erforderlich' })

    try {
      const user = getUserDetailsStmt.get(userId)
      if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' })

      const stats = buildUserStatsPayload(
        getUserStatsByGameStmt.all(userId),
        getUserRecentStatsStmt.all(userId),
      )

      res.json({
        user: mapUserRow(user),
        stats,
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.get('/admin/users/:id/stats', adminLimiter, requireAuth, validate(adminUserIdParamsSchema, 'params'), (req, res) => {
    const userId = String(req.params.id || '').trim()
    if (!userId) return res.status(400).json({ error: 'userId erforderlich' })

    try {
      const user = getUserDetailsStmt.get(userId)
      if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden' })

      const stats = buildUserStatsPayload(
        getUserStatsByGameStmt.all(userId),
        getUserRecentStatsStmt.all(userId),
      )

      res.json({
        userId,
        totals: stats.totals,
        byGame: stats.byGame,
        recent: stats.recent,
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.patch('/admin/users/:id/role', adminLimiter, requireAuth, validate(adminSetUserRoleSchema), setUserRoleHandler)
  router.post('/admin/users/:id/role', adminLimiter, requireAuth, validate(adminSetUserRoleSchema), setUserRoleHandler)

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

  router.post('/admin/users/bulk-update', adminLimiter, requireAuth, validate(adminUsersBulkUpdateSchema), (req, res) => {
    const { action, userIds, role, format } = req.body
    try {
      const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))]
      if (!uniqueIds.length) return res.status(400).json({ error: 'Keine gueltigen userIds uebergeben' })

      const users = getUsersByIdsStmt.all(JSON.stringify(uniqueIds))
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

        return res.json({ ok: true, action, role, requestedCount: uniqueIds.length, changedCount: updated.length, changed: updated, skipped })
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

        return res.json({ ok: true, action, requestedCount: uniqueIds.length, deletedCount: deleted.length, deleted, skipped })
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

        return res.json({ ok: true, action, requestedCount: uniqueIds.length, exportedCount: exportRows.length, users: exportRows, skipped })
      }

      return res.status(400).json({ error: 'Unbekannte Bulk-Aktion' })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
