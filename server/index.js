import express      from 'express'
import helmet       from 'helmet'
import cors         from 'cors'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import logger       from './logger.js'
import { ADMIN_KEY, IS_PROD } from './middleware/auth.js'
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

// ── Security Headers ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com"],
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
  req.id = req.headers['x-request-id'] || crypto.randomUUID()
  next()
})

// ── Admin-Assets (CSS/JS für admin.html) ─────────────────────
app.use('/admin-assets', express.static(join(__dirname, 'public')))

// ── Routes ───────────────────────────────────────────────────
app.use('/', publicRouter)
app.use('/', adminRouter)

// ── Statisches Frontend (Produktions-Build) ──────────────────
const DIST = join(__dirname, '../dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.use((_req, res) => res.sendFile(join(DIST, 'index.html')))
}

// ── Globaler Fehler-Handler ───────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unbehandelter Fehler')
  res.status(500).json({ error: IS_PROD ? 'Interner Serverfehler' : (err.message || 'Interner Serverfehler') })
})

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Signifikation-Server läuft auf http://localhost:${PORT}`)
  logger.info(`Admin: http://localhost:${PORT}/admin`)
})
