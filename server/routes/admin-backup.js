import express from 'express'

export function createAdminBackupRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminBackupRestoreSchema,
  loadBackupFiles,
  replaceAllAdminData,
  sanitizeBackupBundle,
  auditUpdate,
  adminError,
  serverError,
}) {
  const router = express.Router()

  router.post('/admin/backup/gist', adminLimiter, requireAuth, async (req, res) => {
    try {
      const { runBackup } = await import('../backup.js')
      const result = await runBackup()
      res.json({ ok: true, ...result })
    } catch (err) { adminError(res, err) }
  })

  router.get('/admin/backup', adminLimiter, requireAuth, (req, res) => {
    try {
      res.setHeader('Content-Disposition', `attachment; filename="signifikation-backup-${new Date().toISOString().slice(0, 10)}.json"`)
      res.json({ exportedAt: new Date().toISOString(), files: loadBackupFiles() })
    } catch (err) { serverError(res, err) }
  })

  router.post('/admin/backup/restore', adminLimiter, requireAuth, validate(adminBackupRestoreSchema), async (req, res) => {
    try {
      const bundle = sanitizeBackupBundle(req.body)

      await replaceAllAdminData(bundle)

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
          wortzwilling: Object.keys(bundle.wortzwilling || {}).length,
          zeitenwende: Object.keys(bundle.zeitenwende || {}).length,
          statsRows: Array.isArray(bundle.statsRows) ? bundle.statsRows.length : 0,
        },
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  return router
}
