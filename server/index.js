import express      from 'express'
import compression  from 'compression'
import helmet       from 'helmet'
import cors         from 'cors'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { randomUUID } from 'crypto'
import logger       from './logger.js'
import { ADMIN_KEY, IS_PROD, csrfProtect } from './middleware/auth.js'
import { initializeIndices } from './store.js'
import { errorHandler } from './error-handling.js'
import publicRouter from './routes/public.js'
import adminRouter  from './routes/admin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT      = process.env.PORT || 3001

if (!ADMIN_KEY) {
  logger.fatal('ADMIN_KEY ist nicht gesetzt – in Produktion erforderlich. Server wird beendet.')
  process.exit(1)
}
if (!process.env.ADMIN_KEY) logger.warn('ADMIN_KEY nicht gesetzt – Dev-Fallback aktiv (nur lokal!)')

const app = express()

// ── Kompression (Gzip/Brotli) ─────────────────────────────────
app.use(compression())

// ── Security Headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      fontSrc:        ["'self'"],
      imgSrc:         ["'self'", "data:"],
      connectSrc:     ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ── CORS ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS  = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3001']
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'http://localhost']

app.use(cors({
  origin: IS_PROD
    ? (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || CAPACITOR_ORIGINS.includes(origin)) cb(null, true)
        else cb(new Error(`CORS: Unerlaubte Origin ${origin}`))
      }
    : true,
  credentials: false,
}))

app.use(express.json())

// ── Correlation-ID ────────────────────────────────────────────
app.use((req, _res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID()
  next()
})

// ── CSRF-Schutz für Admin-Endpoints ────────────────────────────
app.use('/admin', csrfProtect)
app.use('/api', csrfProtect)

// ── Admin-Assets (CSS/JS für admin.html) ─────────────────────
app.use('/admin-assets', express.static(join(__dirname, 'public')))

// ── Routes ───────────────────────────────────────────────────
app.use('/', publicRouter)
app.use('/', adminRouter)

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
initializeIndices()

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Signifikation-Server läuft auf http://localhost:${PORT}`)
  logger.info(`Admin: http://localhost:${PORT}/admin`)
})
