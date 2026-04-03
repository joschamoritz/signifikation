/**
 * query-cache.js – Query-Result Caching für DB-Queries
 *
 * Verhindert redundante DB-Zugriffe durch 1h TTL Cache.
 * Automatisches Cleanup von abgelaufenen Einträgen.
 */
import logger from './logger.js'

const cache = new Map()
const CACHE_TTL_MS = 1 * 60 * 60 * 1000  // 1 Stunde

// Metriken
const metrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
}

/**
 * Gibt gecachtes Query-Ergebnis zurück oder führt fetcher aus.
 * @param {string} key  Eindeutiger Cache-Schlüssel (z.B. 'rel:wasser:Substantiv:ATTR')
 * @param {Function} fetcher  Funktion die Daten liefert wenn nicht gecacht
 * @returns {*} Gecachte oder frische Daten
 */
export function getCachedQuery(key, fetcher) {
  const entry = cache.get(key)

  // Cache hit?
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    metrics.hits++
    return entry.data
  }

  // Cache miss → fetcher aufrufen
  metrics.misses++
  const data = fetcher()
  cache.set(key, { data, ts: Date.now() })
  metrics.sets++

  return data
}

/**
 * Invalidiert einen Cache-Eintrag.
 * @param {string} key  Cache-Schlüssel
 */
export function invalidateCache(key) {
  if (cache.delete(key)) {
    metrics.evictions++
    logger.debug({ key }, 'Cache invalidiert')
  }
}

/**
 * Invalidiert alle Cache-Einträge mit Pattern-Matching.
 * @param {RegExp} pattern  Regex zum Matching von Keys
 */
export function invalidateCachePattern(pattern) {
  let count = 0
  for (const key of cache.keys()) {
    if (pattern.test(key)) {
      cache.delete(key)
      count++
    }
  }
  if (count > 0) {
    metrics.evictions += count
    logger.debug({ pattern: pattern.source, count }, 'Cache-Pattern invalidiert')
  }
}

/**
 * Gibt Cache-Metriken zurück.
 */
export function getCacheMetrics() {
  const total = metrics.hits + metrics.misses
  const hitRate = total > 0 ? ((metrics.hits / total) * 100).toFixed(2) : 0
  return {
    hits: metrics.hits,
    misses: metrics.misses,
    hitRate: `${hitRate}%`,
    size: cache.size,
    evictions: metrics.evictions,
  }
}

/**
 * Löscht den kompletten Cache.
 */
export function clearCache() {
  const size = cache.size
  cache.clear()
  logger.info({ size }, 'Query-Cache gelöscht')
}

// ── Periodisches Cleanup (alle 10 Minuten) ──
setInterval(() => {
  const now = Date.now()
  let cleaned = 0

  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts > CACHE_TTL_MS) {
      cache.delete(key)
      cleaned++
    }
  }

  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Query-Cache Cleanup')
  }
}, 10 * 60 * 1000)

logger.info('Query-Cache aktiviert (1h TTL, auto-cleanup alle 10min)')
