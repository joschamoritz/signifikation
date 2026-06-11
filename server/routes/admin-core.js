import express from 'express'
import { createWriteStream, existsSync, renameSync, statSync, unlinkSync, openSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'

const SQLITE_HEADER = 'SQLite format 3\0'

/**
 * Validiert eine hochgeladene SQLite-Datei, bevor sie die laufende DB ersetzt.
 * 1) Header-Check (billig) — faengt truncatedte oder Nicht-SQLite-Uploads.
 * 2) readonly oeffnen + PRAGMA quick_check — faengt strukturelle Korruption.
 *    quick_check statt integrity_check, weil Letzteres bei Multi-GB-DBs Minuten
 *    blockieren kann; quick_check ueberspringt nur die teuren Index/Tabelle-
 *    Cross-Checks und erkennt echte Korruption zuverlaessig.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateSqliteFile(path) {
  let fd
  try {
    fd = openSync(path, 'r')
    const header = Buffer.alloc(16)
    readSync(fd, header, 0, 16, 0)
    if (header.toString('latin1') !== SQLITE_HEADER) {
      return { ok: false, reason: 'kein gültiger SQLite-Header' }
    }
  } catch (err) {
    return { ok: false, reason: err.message }
  } finally {
    if (fd !== undefined) { try { closeSync(fd) } catch { /* ignore */ } }
  }

  let probe
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
    const result = probe.pragma('quick_check')?.[0]?.quick_check
    if (result !== 'ok') return { ok: false, reason: `quick_check: ${result}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  } finally {
    if (probe) { try { probe.close() } catch { /* ignore */ } }
  }
}

export function createAdminCoreRouter({
  adminLimiter,
  loginLimiter,
  uploadLimiter,
  requireAuth,
  adminAuth,
  adminLogout,
  adminError,
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
    // Bei betterAuth: Session ist bereits validiert (requireAuth-Middleware)
    // Cookies werden von betterAuth automatisch gesetzt – nichts mehr zu tun
    res.json({ ok: true })
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
            // Letzter Chunk: hochgeladene Datei VOR dem Aktivieren validieren,
            // damit ein truncatedter/kaputter Upload nicht die laufende DB
            // ersetzt und das Backup unwiederbringlich loescht.
            const validation = validateSqliteFile(tmpPath)
            if (!validation.ok) {
              try { unlinkSync(tmpPath) } catch { /* ignore */ }
              logger.warn({ reason: validation.reason }, 'wortprofil.db Upload abgelehnt (Validierung fehlgeschlagen)')
              return res.status(400).json({ error: `Upload ungültig: ${validation.reason}` })
            }
            const dbPath = join(dataDir, 'wortprofil.db')
            const bakPath = join(dataDir, 'wortprofil.db.bak')
            if (existsSync(dbPath)) renameSync(dbPath, bakPath)
            renameSync(tmpPath, dbPath)
            // Backup erst NACH erfolgreicher Aktivierung loeschen.
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
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "font-src 'self'; " +
      "img-src 'self' data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none';"
    )
    // Footprinting verhindern: Suchmaschinen / Archive sollen die
    // Admin-URL nicht indexieren, auch wenn sie öffentlich erreichbar
    // ist (Auth läuft erst innerhalb des Admin-Frontends gegen /admin/...).
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
    res.sendFile(adminHtmlPath)
  })

  return router
}
