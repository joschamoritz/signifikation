import rateLimit from 'express-rate-limit'
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
      if (now - data.resetTime > this.windowMs * 2) {
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
    if (!data || now - data.resetTime > this.windowMs) {
      // Neues Fenster oder erster Zugriff
      this.hits.set(key, { totalHits: 1, resetTime: now })
      return { totalHits: 1, resetTime: now }
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

// Hilfsfunktion für korrekte IP-Erkennung hinter Railway-Proxy
function getClientIp(req) {
  // X-Forwarded-For kann mehrere IPs enthalten; erste ist Client-IP
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip
}

// Globale Store-Instanzen (teilen sich den Cleanup-Timer)
const belegeStore = new CleanupStore(60_000)
const adminStore = new CleanupStore(60_000)
const statsStore = new CleanupStore(60_000)
const feedbackStore = new CleanupStore(60_000)

export const belegeLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  store: belegeStore,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Anfragen, bitte kurz warten.' },
})

export const adminLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  store: adminStore,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Admin-Anfragen, bitte kurz warten.' },
})

export const statsLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  store: statsStore,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Anfragen.' },
})

export const feedbackLimiter = rateLimit({
  windowMs: 60_000, max: 5,
  store: feedbackStore,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Feedback-Anfragen, bitte kurz warten.' },
})

export const uploadLimiter = rateLimit({
  windowMs: 10_000, max: 100,  // 100 Requests pro 10 Sekunden fuer Upload
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Upload-Rate-Limit ueberschritten, bitte warten.' },
})
