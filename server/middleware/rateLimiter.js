import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { createHash } from 'node:crypto'
import logger from '../logger.js'

// Custom Store mit auto-cleanup für Memory-Leak-Prävention
class CleanupStore {
  constructor(windowMs = 60_000) {
    this.hits = new Map()
    this.windowMs = windowMs
    // Cleanup alle 10 Minuten: entferne Einträge älter als 2x windowMs
    this.cleanupInterval = setInterval(() => this._cleanup(), 10 * 60_000)
    this.cleanupInterval.unref() // dont keep process alive
  }

  _cleanup() {
    const now = Date.now()
    let cleaned = 0
    for (const [key, data] of this.hits.entries()) {
      if (now - data.resetTime.getTime() > this.windowMs * 2) {
        this.hits.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Rate-limiter store cleanup')
    }
  }

  increment(key) {
    const now = Date.now()
    const data = this.hits.get(key)
    if (!data || now - data.resetTime.getTime() > this.windowMs) {
      // Neues Fenster oder erster Zugriff
      this.hits.set(key, { totalHits: 1, resetTime: new Date() })
      return { totalHits: 1, resetTime: new Date() }
    }
    data.totalHits++
    return data
  }

  decrement(key) {
    const data = this.hits.get(key)
    if (data) data.totalHits = Math.max(0, data.totalHits - 1)
  }

  resetKey(key) {
    this.hits.delete(key)
  }

  resetAll() {
    this.hits.clear()
  }
}

// Hilfsfunktion für korrekte IP-Erkennung hinter nginx-Proxy (IPv6-compatible).
// req.ip wird durch `app.set('trust proxy', 1)` (server/index.js) korrekt aus
// dem X-Forwarded-For-Header gewählt – kein manuelles Parsing nötig.
// express-rate-limit erwartet für IPv6 explizit ipKeyGenerator(), damit nicht
// durch IP-Rotation innerhalb eines /56-Präfixes umgangen wird.
function getClientIp(req) {
  return ipKeyGenerator(req.ip)
}

// Klassenraum-Limiter keyen nach Akteur statt IP: hinter Schul-NAT teilen
// sich ~30 Schüler eine öffentliche IP und würden sich gegenseitig ins
// Limit drängen (Security-Review N4). Bearer-Token (Participant- bzw.
// Auth-Token) ist der präzisere Schlüssel; ohne Token fällt der Key auf
// die IP zurück. Gehasht, damit keine Roh-Tokens im Limiter-Store liegen.
function getBearerOrIp(req) {
  const auth = req.headers?.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ') && auth.length > 15) {
    return 'tok:' + createHash('sha256').update(auth.slice(7)).digest('base64url').slice(0, 24)
  }
  return getClientIp(req)
}

// Globale Store-Instanzen (teilen sich den Cleanup-Timer)
const belegeStore = new CleanupStore(60_000)
const adminStore = new CleanupStore(60_000)
const statsStore = new CleanupStore(60_000)
const classroomJoinStore = new CleanupStore(5 * 60_000)
const classroomHeartbeatStore = new CleanupStore(60_000)
const classroomWriteStore = new CleanupStore(60_000)
const classroomReadStore = new CleanupStore(60_000)
const registerStore = new CleanupStore(15 * 60_000)
const pushSubscribeStore = new CleanupStore(60_000)
const iapVerifyStore = new CleanupStore(60_000)
const debugLogStore = new CleanupStore(60_000)
const customLemmaStore = new CleanupStore(60_000)

export const belegeLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  store: belegeStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Anfragen, bitte kurz warten.' },
})

export const adminLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  store: adminStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Admin-Anfragen, bitte kurz warten.' },
})

export const statsLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  store: statsStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Anfragen.' },
})


// Striktes Limit nur für Login-Endpunkt: 10 Versuche / 15 Minuten
const loginStore = new CleanupStore(15 * 60_000)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 10,
  store: loginStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche. Bitte 15 Minuten warten.' },
  skipSuccessfulRequests: true,
})

export const registerLimiter = rateLimit({
  windowMs: 15 * 60_000, max: 8,
  store: registerStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Registrierungsversuche. Bitte 15 Minuten warten.' },
  skipSuccessfulRequests: true,
})

export const uploadLimiter = rateLimit({
  windowMs: 10_000, max: 100,
  store: new CleanupStore(10_000),
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Upload-Rate-Limit überschritten, bitte warten.' },
})

export const classroomJoinLimiter = rateLimit({
  windowMs: 5 * 60_000, max: 10,
  store: classroomJoinStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Bitte warte 5 Minuten.' },
})

export const classroomHeartbeatLimiter = rateLimit({
  windowMs: 60_000, max: 180,
  store: classroomHeartbeatStore,
  keyGenerator: getBearerOrIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Heartbeats. Bitte kurz warten.' },
})

export const classroomWriteLimiter = rateLimit({
  windowMs: 60_000, max: 80,
  store: classroomWriteStore,
  keyGenerator: getBearerOrIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Klassenraum-Aktionen. Bitte kurz warten.' },
})

// Lese-Endpunkte (/me/view, /me/reveal): grosszuegig, aber gedeckelt, damit ein
// gueltiger Participant-Token nicht ungedrosselt teure Views pollt (Security N3).
export const classroomReadLimiter = rateLimit({
  windowMs: 60_000, max: 120,
  store: classroomReadStore,
  keyGenerator: getBearerOrIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte kurz warten.' },
})

// Push-Subscribe/Unsubscribe: 20 Versuche / Minute pro IP
export const pushSubscribeLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  store: pushSubscribeStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Push-Anfragen. Bitte kurz warten.' },
})

// IAP-Verify: 30 Versuche / Minute pro IP. Begrenzt JWS-Spam und
// CPU-Verbrauch durch Brute-Force-Versuche.
export const iapVerifyLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  store: iapVerifyStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Verifikations-Anfragen. Bitte kurz warten.' },
})

// Debug-Log-Endpoint: 60 Posts / Minute pro IP. Reicht, um den Bootstrap einer
// crashenden TestFlight-App zu protokollieren, ohne dass böswillige Aufrufer
// das Server-Log fluten können.
export const debugLogLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  store: debugLogStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Debug-Logs. Bitte kurz warten.' },
})

// Archiv-Detail (SSR /wort/:slug + JSON /api/v1/woerter/:slug): buildWortDetail
// aggregiert mehrere synchrone DB-Queries (inkl. FTS5 auf belege.db) und
// blockiert die Event-Loop. Das Ergebnis ist zwar 1h memoisiert (query-cache),
// aber ein Scan über viele VERSCHIEDENE Slugs erzeugt lauter Cache-Misses →
// deckeln. 60/min lässt normales Blättern und Crawler locker durch.
const archiveDetailStore = new CleanupStore(60_000)
export const archiveDetailLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  store: archiveDetailStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Anfragen, bitte kurz warten.' },
})

// Eigenes-Lemma (validate/play): Korpus-Queries; für Basic-Nutzer offen.
// 40/Minute reicht für die debounced Live-Prüfung, deckelt aber Spam.
export const customLemmaLimiter = rateLimit({
  windowMs: 60_000, max: 40,
  store: customLemmaStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte kurz warten.' },
})
