import express from 'express'
import { createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

export function createAdminCoreRouter({
  adminLimiter,
  loginLimiter,
  uploadLimiter,
  requireAuth,
  adminAuth,
  adminLogout,
  adminError,
  createSession,
  logger,
  adminHtmlPath,
  dataDir,
}) {
  const router = express.Router()

  const uploadChunkLimit = 10 * 1024 * 1024
  const uploadTotalLimit = 2.5 * 1024 * 1024 * 1024

  router.post('/admin/auth', loginLimiter, adminAuth)

  router.post('/admin/logout', adminLimiter, requireAuth, adminLogout)

  router.post('/admin/refresh', adminLimiter, requireAuth, (_req, res) => {
    try {
      const { token, expiresAt } = createSession()
      const isProd = process.env.NODE_ENV === 'production'
      res.cookie('admin_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000,
      })
      res.json({ ok: true, expiresAt })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/upload-wortprofil', uploadLimiter, requireAuth, (req, res) => {
    const idxRaw = parseInt(req.query.index, 10)
    const totalRaw = parseInt(req.query.total, 10)
    if (!Number.isFinite(idxRaw) || !Number.isFinite(totalRaw) || totalRaw < 1) {
      return res.status(400).json({ error: 'index/total müssen gültige Zahlen sein' })
    }

    const tmpPath = join(dataDir, 'wortprofil.db.upload')
    const chunks = []
    let received = 0

    req.on('data', (chunk) => {
      received += chunk.length
      if (received > uploadChunkLimit) {
        req.destroy(new Error('Chunk überschreitet Limit'))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      try {
        const existingSize = existsSync(tmpPath) ? statSync(tmpPath).size : 0
        if (existingSize + received > uploadTotalLimit) {
          try { unlinkSync(tmpPath) } catch {}
          return res.status(413).json({ error: 'Upload überschreitet Gesamtlimit' })
        }

        const buf = Buffer.concat(chunks)
        const stream = createWriteStream(tmpPath, { flags: idxRaw === 0 ? 'w' : 'a' })
        stream.once('error', (err) => adminError(res, err))
        stream.once('finish', () => {
          if (idxRaw === totalRaw - 1) {
            const dbPath = join(dataDir, 'wortprofil.db')
            const bakPath = join(dataDir, 'wortprofil.db.bak')
            if (existsSync(dbPath)) renameSync(dbPath, bakPath)
            renameSync(tmpPath, dbPath)
            if (existsSync(bakPath)) {
              try { unlinkSync(bakPath) } catch (err) { logger.warn({ err }, 'Backup konnte nicht gelöscht werden') }
            }
            logger.info('wortprofil.db Upload abgeschlossen und aktiviert')
            res.json({ ok: true, done: true })
          } else {
            res.json({ ok: true, done: false, index: idxRaw })
          }
        })
        stream.end(buf)
      } catch (err) {
        adminError(res, err)
      }
    })

    req.on('error', (err) => {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch {}
      adminError(res, err)
    })
  })

  router.get('/admin', (_req, res) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none';"
    )
    res.sendFile(adminHtmlPath)
  })

  return router
}
