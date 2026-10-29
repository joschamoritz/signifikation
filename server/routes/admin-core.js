import express from 'express'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * admin.html mit Versionsnummer an den eigenen Assets (`/admin-assets/admin.js?v=…`).
 * Die Assets cachen eine Stunde (server/index.js); ohne wechselnde URL lief nach einem
 * Deploy bis zu einer Stunde die alte admin.js. Version = Änderungszeit der Datei – Git
 * setzt sie beim Deploy nur für Dateien neu, die sich wirklich geändert haben.
 * Je Aufruf neu gelesen: die Seite ist klein, und lokal greifen Änderungen sofort.
 */
export function adminHtmlMitVersion(adminHtmlPath, adminAssetsDir) {
  return readFileSync(adminHtmlPath, 'utf8').replace(
    /(["'])\/admin-assets\/([\w.-]+\.(?:js|css))\1/g,
    (ganz, q, datei) => {
      try {
        const version = Math.round(statSync(join(adminAssetsDir, datei)).mtimeMs).toString(36)
        return `${q}/admin-assets/${datei}?v=${version}${q}`
      } catch {
        return ganz
      }
    },
  )
}

export function createAdminCoreRouter({
  adminLimiter,
  loginLimiter,
  requireAuth,
  adminAuth,
  adminLogout,
  adminHtmlPath,
  adminAssetsDir,
}) {
  const router = express.Router()

  router.post('/admin/auth', loginLimiter, adminAuth)

  router.post('/admin/logout', adminLimiter, requireAuth, adminLogout)

  router.post('/admin/refresh', adminLimiter, requireAuth, (_req, res) => {
    // Bei betterAuth: Session ist bereits validiert (requireAuth-Middleware)
    // Cookies werden von betterAuth automatisch gesetzt – nichts mehr zu tun
    res.json({ ok: true })
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
    // Die Seite selbst immer neu prüfen, sonst kämen die neuen Versionsnummern nicht an
    res.setHeader('Cache-Control', 'no-cache')
    res.type('html').send(adminHtmlMitVersion(adminHtmlPath, adminAssetsDir))
  })

  return router
}
