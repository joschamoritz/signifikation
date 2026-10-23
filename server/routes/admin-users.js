import express from 'express'

// Admin-Konten sind geschützt: Rolle ändern und Löschen lehnt der Server ab (auch für das
// eigene Konto – sonst sperrt man sich aus). Die Rolle „admin“ lässt sich über diese Routen
// auch nicht vergeben (die Schemas erlauben nur user/premium).
const ADMIN_ROLE = 'admin'
// Fehlercode von deleteUserTx (admin-users-data.js), wenn es ein Admin-Konto loeschen sollte
const ADMIN_DELETE_BLOCKED = 'ADMIN_ACCOUNT_PROTECTED'
const ADMIN_GESCHUETZT_FEHLER = 'Admin-Konten lassen sich hier weder ändern noch löschen.'

// Anmeldearten aus account.providerId; alles Unbekannte wird zu „andere“.
const ANMELDUNG = new Set(['credential', 'apple', 'google'])

// Die Quelle folgt aus der Belegform: Mollie-Zahlungen beginnen mit tr_, Apple-Transaktions-IDs sind Ziffern.
const quelleAusBeleg = (id) => (/^tr_/.test(id) ? 'mollie' : /^\d+$/.test(id) ? 'apple' : 'unbekannt')

const isoAusMs = (ms) => (Number.isFinite(Number(ms)) && Number(ms) > 0 ? new Date(Number(ms)).toISOString() : null)

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
    countUsersFilteredStmt,
    listUsersStmt,
    getUserDetailsStmt,
    getUserStatsByGameStmt,
    getUserRecentStatsStmt,
    getUserKaufStmt,
    getUserZahlungenStmt,
    getUserKontoMetaStmt,
    ensureProfileStmt,
    setUserRoleStmt,
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
      const target = getUserDetailsStmt.get(userId)
      if (!target) {
        return res.status(404).json({ error: 'Nutzer nicht gefunden' })
      }
      if (target.role === ADMIN_ROLE) {
        logger.warn({ userId }, 'Rollenänderung eines Admin-Kontos abgelehnt')
        return res.status(403).json({ error: ADMIN_GESCHUETZT_FEHLER })
      }

      // Unveraenderte Rolle: nicht schreiben, nicht protokollieren (wie bei der Sammelaktion), Antwort wie bisher ok.
      if (target.role === req.body.role) {
        return res.json({ ok: true, userId, role: req.body.role })
      }

      const now = Date.now()
      ensureProfileStmt.run(userId, now, now)
      setUserRoleStmt.run(userId, req.body.role, now, now)

      auditUpdate('user', userId, { role: target.role }, { role: req.body.role }, {
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
    // limit/offset kommen aus adminUsersQuerySchema bereits als Zahlen
    // (Default 50 / 0).
    const { limit, offset, role, q } = req.query
    try {
      const search = (q || '').trim()
      const filterParams = {
        role: role || '',
        q: search,
        qLike: `%${search}%`,
      }
      const rows = listUsersStmt.all({ ...filterParams, limit, offset })

      const total = countUsersStmt.get()?.total || 0
      const filtered = countUsersFilteredStmt.get(filterParams)?.total || 0
      const roleCounts = countUsersByRoleStmt.get() || { premium: 0, users: 0 }

      const now = Date.now()
      const from7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
      const from30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
      const growth = adminUsersStatsStmt.get({ fromIso: from7, from30Iso: from30 }) || { newLast7Days: 0, newLast30Days: 0 }

      res.json({
        summary: {
          total,
          users: Number(roleCounts.users || 0),
          premium: Number(roleCounts.premium || 0),
          newLast7Days: Number(growth.newLast7Days || 0),
          newLast30Days: Number(growth.newLast30Days || 0),
        },
        page: {
          limit,
          offset,
          filtered,
          hasMore: offset + rows.length < filtered,
        },
        users: rows.map((row) => ({ ...mapUserRow(row), gekauft: !!row.gekauft })),
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

      // Rein lesend. Ausgeliefert werden nur die hier genannten Felder: keine IP, kein User-Agent,
      // keine Tokens, keine Passwort-Hashes, keine Fremd-Konto-IDs (account.accountId).
      const kauf = getUserKaufStmt.get(userId)
      const meta = getUserKontoMetaStmt.get({ id: userId }) || {}

      res.json({
        user: mapUserRow(user),
        stats,
        konto: {
          zuletztAktiv: meta.zuletztAktiv || null,
          loeschWarnungAm: meta.loeschWarnung || null,
          anmeldung: String(meta.anmeldung || '')
            .split(',')
            .filter(Boolean)
            .map((provider) => (ANMELDUNG.has(provider) ? provider : 'andere')),
          rolleGeaendertAm: isoAusMs(meta.rolleGeaendertMs),
        },
        kauf: {
          gesamtausgabe: !!kauf?.freigeschaltet,
          seit: isoAusMs(kauf?.seit),
          quelle: kauf?.quelle || null,
          zahlungen: getUserZahlungenStmt.all(userId).map((z) => ({
            beleg: z.id,
            quelle: quelleAusBeleg(z.id),
            betrag: z.amount,
            waehrung: z.currency,
            status: z.status,
            produkt: z.product,
            zeitpunkt: isoAusMs(z.processed_at),
          })),
        },
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
      if (existing.role === ADMIN_ROLE) {
        logger.warn({ userId }, 'Löschen eines Admin-Kontos abgelehnt')
        return res.status(403).json({ error: ADMIN_GESCHUETZT_FEHLER })
      }

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
      // Zentraler Schutz in deleteUserTx (falls das Konto zwischen Vorabprüfung und Löschen Admin wurde)
      if (err?.code === ADMIN_DELETE_BLOCKED) return res.status(403).json({ error: ADMIN_GESCHUETZT_FEHLER })
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
      const notFound = uniqueIds.filter((id) => !foundIds.has(id))

      // Rolle ändern und Löschen überspringen Admin-Konten (auch das eigene) und melden sie mit Grund.
      // `skipped` bleibt die Liste der übersprungenen IDs, `skippedDetails` nennt zu jeder den Grund:
      // 'not_found' (gibt es nicht mehr) oder 'admin' (Admin-Konto, geschützt).
      const schreibend = action === 'setRole' || action === 'delete'
      const geschuetzt = schreibend ? users.filter((user) => user.role === ADMIN_ROLE) : []
      const bearbeitbar = schreibend ? users.filter((user) => user.role !== ADMIN_ROLE) : users
      const skippedDetails = [
        ...notFound.map((id) => ({ id, reason: 'not_found' })),
        ...geschuetzt.map((user) => ({ id: user.id, reason: 'admin' })),
      ]
      const skipped = skippedDetails.map((entry) => entry.id)
      if (geschuetzt.length) {
        logger.warn({ action, geschuetzt: geschuetzt.length }, 'Sammelaktion: Admin-Konten übersprungen')
      }

      if (action === 'setRole') {
        const now = Date.now()
        const updated = []
        // Konten, die die Rolle schon haben, werden weder geschrieben noch protokolliert, sondern als unchanged gemeldet.
        const unchanged = []
        for (const user of bearbeitbar) {
          if (user.role === role) {
            unchanged.push(user.id)
            continue
          }
          ensureProfileStmt.run(user.id, now, now)
          setUserRoleStmt.run(user.id, role, now, now)
          updated.push(user.id)
          auditUpdate('user', user.id, { role: user.role }, { role }, {
            adminKey: req.adminSessionId || 'unknown',
            ip: req.ip,
          })
        }

        return res.json({ ok: true, action, role, requestedCount: uniqueIds.length, changedCount: updated.length, changed: updated, unchangedCount: unchanged.length, unchanged, skipped, skippedDetails })
      }

      if (action === 'delete') {
        const deleted = []
        for (const user of bearbeitbar) {
          try {
            deleteUserTx(user.id)
          } catch (err) {
            // Zentraler Schutz in deleteUserTx: wie ein vorab gefiltertes Admin-Konto behandeln
            if (err?.code !== ADMIN_DELETE_BLOCKED) throw err
            skipped.push(user.id)
            skippedDetails.push({ id: user.id, reason: 'admin' })
            continue
          }
          deleted.push(user.id)
          auditDelete('user', user.id, { email: user.email, role: user.role }, {
            adminKey: req.adminSessionId || 'unknown',
            ip: req.ip,
          })
        }

        return res.json({ ok: true, action, requestedCount: uniqueIds.length, deletedCount: deleted.length, deleted, skipped, skippedDetails })
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

        return res.json({ ok: true, action, requestedCount: uniqueIds.length, exportedCount: exportRows.length, users: exportRows, skipped, skippedDetails })
      }

      return res.status(400).json({ error: 'Unbekannte Bulk-Aktion' })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
