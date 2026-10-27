import express from 'express'

export function createAdminCoreRouter({
  adminLimiter,
  loginLimiter,
  requireAuth,
  adminAuth,
  adminLogout,
  adminHtmlPath,
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
    res.sendFile(adminHtmlPath)
  })

  return router
}
