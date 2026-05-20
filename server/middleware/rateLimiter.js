import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
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

// Hilfsfunktion für korrekte IP-Erkennung hinter Railway-Proxy (IPv6-compatible)
function getClientIp(req) {
  // X-Forwarded-For kann mehrere IPs enthalten; erste ist Client-IP
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip

  // express-rate-limit erwartet für IPv6 explizit ipKeyGenerator(),
  // damit nicht durch IP-Rotation innerhalb eines /56-Präfixes umgangen wird.
  return ipKeyGenerator(ip)
}

// Globale Store-Instanzen (teilen sich den Cleanup-Timer)
const belegeStore = new CleanupStore(60_000)
const adminStore = new CleanupStore(60_000)
const statsStore = new CleanupStore(60_000)
const classroomJoinStore = new CleanupStore(5 * 60_000)
const classroomHeartbeatStore = new CleanupStore(60_000)
const classroomWriteStore = new CleanupStore(60_000)
const classroomExportStore = new CleanupStore(60_000)
const registerStore = new CleanupStore(15 * 60_000)
const pushSubscribeStore = new CleanupStore(60_000)

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
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Heartbeats. Bitte kurz warten.' },
})

export const classroomWriteLimiter = rateLimit({
  windowMs: 60_000, max: 80,
  store: classroomWriteStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Klassenraum-Aktionen. Bitte kurz warten.' },
})

export const classroomExportLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  store: classroomExportStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Export-Anfragen. Bitte kurz warten.' },
})

// Push-Subscribe/Unsubscribe: 20 Versuche / Minute pro IP
export const pushSubscribeLimiter = rateLimit({
  windowMs: 60_000, max: 20,
  store: pushSubscribeStore,
  keyGenerator: getClientIp,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Zu viele Push-Anfragen. Bitte kurz warten.' },
})
