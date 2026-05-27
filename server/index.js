import './env.js'

import logger from './logger.js'

// Verhindert versehentliche Root-Starts (würden den Port für andere User blockieren)
if (process.getuid?.() === 0) {
  logger.error('Server darf nicht als root gestartet werden')
  process.exit(1)
}

import './config.js'
import express      from 'express'
import compression  from 'compression'
import helmet       from 'helmet'
import cors         from 'cors'
import cookieParser from 'cookie-parser'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { randomUUID } from 'crypto'
import { toNodeHandler } from 'better-auth/node'
import { IS_PROD, csrfProtect, csrfProtectUpload } from './middleware/auth.js'
import { auth } from './auth/index.js'
import { loginLimiter, registerLimiter } from './middleware/rateLimiter.js'
import { initializeIndices } from './store.js'
import { errorHandler } from './error-handling.js'
import { ensureWortprofilDb } from './init-wortprofil.js'
import publicRouter from './routes/public.js'
import adminRouter  from './routes/admin.js'
import accountRouter from './routes/account.js'
import classroomRouter from './routes/classroom.js'
import classroomV2Router from './routes/classroom-v2.js'
import paymentsRouter from './routes/payments.js'
import iapRouter from './routes/iap.js'
import pushRouter from './routes/push.js'
import { startPushScheduler } from './notifications/scheduler.js'
import { initClassroomSocket } from './realtime/classroomSocket.js'
import { startClassroomWorker } from './workers/classroomWorker.js'
import { ALLOWED_ORIGINS, CAPACITOR_ORIGINS, isAllowedOrigin } from './config/origins.js'
import { startSessionCleanup } from './auth/session-cleanup.js'
import { startAlerting } from './alerting.js'
import { runMigrations } from './migrate-runner.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT      = process.env.PORT || 3001
const BACKUP_RESTORE_BODY_LIMIT = '10mb'


const app = express()

// ── Proxy-Trust (nginx als Reverse-Proxy vor Node) ────────────
// Ohne dies liefert req.ip immer die Proxy-IP → Rate Limiting unwirksam.
app.set('trust proxy', 1)

// ── Kompression (Gzip/Brotli) ─────────────────────────────────
app.use(compression())

// ── Security Headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      // styleSrc strikt: nur eigene Stylesheets, kein injizierter <style>-Block.
      // styleSrcAttr erlaubt weiterhin inline style="..."-Attribute, die
      // in der App und im Admin-Panel dynamisch genutzt werden.
      styleSrc:       ["'self'"],
      styleSrcAttr:   ["'unsafe-inline'"],
      fontSrc:        ["'self'"],
      imgSrc:         ["'self'", "data:"],
      connectSrc:     ["'self'", ...ALLOWED_ORIGINS, ...CAPACITOR_ORIGINS],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
      origin: IS_PROD
    ? (origin, cb) => {
        if (isAllowedOrigin(origin)) cb(null, true)
        else cb(new Error(`CORS: Unerlaubte Origin ${origin}`))
      }
    : true,
  credentials: true,
}))

app.use(cookieParser())
app.post('/api/v1/auth/sign-in/email', loginLimiter)
app.post('/api/v1/auth/sign-up/email', registerLimiter)
app.all('/api/v1/auth/*splat', toNodeHandler(auth))

// Pre-Flight-Schutz für Backup-Restore: 10-MB-Body nur nach Cookie-Check
// parsen. Verhindert DoS via 10-MB-Bodies von unauthenticated Origins
// (Auth läuft im Router danach trotzdem nochmal).
app.use('/admin/backup/restore', (req, res, next) => {
  if (req.method === 'POST' && !req.cookies?.['better-auth.session_token']) {
    logger.warn({ ip: req.ip }, 'Backup-Restore ohne Session-Cookie abgelehnt (pre-flight)')
    return res.status(401).json({ error: 'Nicht autorisiert' })
  }
  next()
})
app.use('/admin/backup/restore', express.json({ limit: BACKUP_RESTORE_BODY_LIMIT }))
app.use(express.json({ limit: '16kb' }))

// ── Correlation-ID ────────────────────────────────────────────
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID()
  next()
})

// ── CSRF-Schutz ───────────────────────────────────────────────
// Upload-Endpunkt erlaubt zusätzlich application/octet-stream
app.use('/admin/upload-wortprofil', csrfProtectUpload)
// Alle anderen Admin- und API-Endpoints: nur application/json
app.use('/admin', csrfProtect)
app.use('/api', csrfProtect)

// ── Admin-Assets (CSS/JS für admin.html) ─────────────────────
app.use('/admin-assets', express.static(join(__dirname, 'public')))
app.use('/fonts', express.static(join(__dirname, '../public/fonts'), {
  setHeaders(res) {
    // Font-Dateinamen sind stabil → 1 Jahr immutable cachen, verhindert
    // Conditional-GET pro App-Start (~461 KB).
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  },
}))

// ── Routes ───────────────────────────────────────────────────
app.use('/', publicRouter)
app.use('/', adminRouter)
app.use('/', accountRouter)
app.use('/', classroomV2Router)  // v2 vor v1 mounten (hat Vorrang bei gleichen Pfaden)
app.use('/', classroomRouter)
app.use('/', paymentsRouter)
app.use('/', iapRouter)
app.use('/', pushRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint nicht gefunden' })
})

// ── Statisches Frontend (Produktions-Build) ──────────────────
const DIST = join(__dirname, '../dist')
if (existsSync(DIST)) {
  // Vite-Assets haben Content-Hashes im Dateinamen → 1 Jahr cachen (immutable)
  // index.html bleibt auf no-cache damit neue Deployments sofort wirken
  app.use(express.static(DIST, {
    setHeaders(res, filePath) {
      if (filePath.includes('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    }
  }))
  app.use((_req, res) => res.sendFile(join(DIST, 'index.html')))
}

// ── Globaler Fehler-Handler (strukturiertes Error Handling) ────
app.use((err, req, res, next) => {
  errorHandler(err, req, res, next)
})

// ── Startup Initialization ──────────────────────────────────
const WORTPROFIL_TIMEOUT_MS = 130_000  // etwas mehr als curl --max-time 120

;(async () => {
  // ensureWortprofilDb kann 2+ GB laden – Timeout verhindert infinites Hängen.
  // Fehler sind nicht fatal: Server startet, Wortprofil-Queries liefern dann nur null.
  await Promise.race([
    ensureWortprofilDb(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Wortprofil-Download-Timeout')), WORTPROFIL_TIMEOUT_MS)
    ),
  ]).catch(err => logger.warn({ err }, 'Wortprofil-Init übersprungen – Server startet trotzdem'))

  // Versionierte Migrationen aus server/migrations/ anwenden, bevor Caches
  // gebaut werden. Baseline-Migrationen aus db.js sind bereits gelaufen.
  await runMigrations().catch((err) => {
    logger.error({ err }, 'Migrations-Runner fehlgeschlagen – Server startet nicht')
    process.exit(1)
  })

  initializeIndices()
  startSessionCleanup()
  startPushScheduler()
  startAlerting()

  // ── Start ────────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    logger.info(`Signifikation-Server läuft auf http://localhost:${PORT}`)
    logger.info(`Admin: http://localhost:${PORT}/admin`)
  })

  const io = initClassroomSocket(server)
  const workerHandle = process.env.CLASSROOM_EXPORT_WORKER_ENABLED !== 'false'
    ? startClassroomWorker()
    : null
  if (!workerHandle) {
    logger.info('Classroom-Export-Worker deaktiviert (CLASSROOM_EXPORT_WORKER_ENABLED=false)')
  }

  // ── Graceful Shutdown (D-21) ──────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} empfangen – fahre herunter …`)
    if (workerHandle?.clear) workerHandle.clear()
    io.close()
    server.close(() => {
      logger.info('HTTP-Server geschlossen')
      process.exit(0)
    })
    // Force-Exit nach 30 s falls offene Verbindungen hängen
    setTimeout(() => { logger.warn('Force-Exit nach Timeout'); process.exit(1) }, 30_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
})().catch(err => {
  logger.error({ err }, 'Startup-Fehler')
  process.exit(1)
})
