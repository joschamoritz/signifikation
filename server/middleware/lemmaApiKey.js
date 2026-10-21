// Prüft den API-Schlüssel der Vorschlags-API (Entwurfs-Postfach).
//
// Ein einzelner Schlüssel mit genau einem Recht: Entwürfe anlegen. Er kann den
// Live-Kalender nicht verändern, das geht nur über das Admin-Panel mit Login.
// Auf dem Server liegt nur der SHA-256-Hash (LEMMA_API_KEY_SHA256), der
// Schlüssel selbst bleibt lokal. Erzeugen: `npm run lemma:key`.
//
// Ohne gesetzten Hash ist die API aus (503) — fail closed.
import { createHash, timingSafeEqual } from 'node:crypto'
import logger from '../logger.js'

const HEX_SHA256 = /^[0-9a-f]{64}$/

export function hashLemmaApiKey(key) {
  return createHash('sha256').update(key, 'utf8').digest('hex')
}

export function requireLemmaApiKey(req, res, next) {
  const erwartet = (process.env.LEMMA_API_KEY_SHA256 || '').trim().toLowerCase()
  if (!HEX_SHA256.test(erwartet)) {
    return res.status(503).json({ error: 'Vorschlags-API ist nicht eingerichtet' })
  }

  const header = req.headers.authorization || ''
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const ok = key.length > 0 && timingSafeEqual(
    Buffer.from(hashLemmaApiKey(key), 'hex'),
    Buffer.from(erwartet, 'hex'),
  )

  if (!ok) {
    logger.warn({ ip: req.ip, mitSchluessel: key.length > 0 }, 'Vorschlags-API: Schlüssel fehlt oder ist falsch')
    return res.status(401).json({ error: 'Nicht autorisiert' })
  }
  next()
}
