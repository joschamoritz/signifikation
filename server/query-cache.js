/**
 * query-cache.js – Query-Result Caching für DB-Queries
 *
 * Verhindert redundante DB-Zugriffe durch 1h TTL Cache.
 * Automatisches Cleanup von abgelaufenen Einträgen.
 */
import logger from './logger.js'

const cache = new Map()
const CACHE_TTL_MS = 1 * 60 * 60 * 1000  // 1 Stunde
// Hartes Groessenlimit: Keys entstehen u.a. aus User-Input ("Eigenes Lemma",
// rel:<lemma>:<pos>:<relCode>) — ohne Deckel kann der Cache innerhalb der
// TTL unbegrenzt wachsen (Premium-Accounts haben kein Tageslimit).
const MAX_ENTRIES = 5000

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

  // Cache hit? → LRU-Refresh: Eintrag ans Map-Ende verschieben, damit die
  // Eviction unten den am laengsten unbenutzten Key trifft (Map iteriert
  // in Insertion-Reihenfolge).
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    metrics.hits++
    cache.delete(key)
    cache.set(key, entry)
    return entry.data
  }

  // Cache miss → fetcher aufrufen
  metrics.misses++
  const data = fetcher()
  if (entry) cache.delete(key)
  if (cache.size >= MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
    metrics.evictions++
  }
  cache.set(key, { data, ts: Date.now() })
  metrics.sets++

  return data
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
// unref(): CLI-Skripte (backup.js etc.), die dieses Modul transitiv laden,
// sollen nicht am Intervall haengen bleiben.
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
}, 10 * 60 * 1000).unref()

logger.info(`Query-Cache aktiviert (1h TTL, max ${MAX_ENTRIES} Eintraege, LRU, auto-cleanup alle 10min)`)
