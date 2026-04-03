import rateLimit from 'express-rate-limit'

// Hilfsfunktion für korrekte IP-Erkennung hinter Railway-Proxy
function getClientIp(req) {
  // X-Forwarded-For kann mehrere IPs enthalten; erste ist Client-IP
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip
}

export const belegeLimiter = rateLimit({
  windowMs: 60_000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Anfragen, bitte kurz warten.' },
})

export const adminLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Admin-Anfragen, bitte kurz warten.' },
})

export const statsLimiter = rateLimit({
  windowMs: 60_000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: getClientIp,
  message: { error: 'Zu viele Anfragen.' },
})

export const feedbackLimiter = rateLimit({
  windowMs: 60_000, max: 5,
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
