export function createBelegeCache({ ttlMs, maxEntries }) {
  const cache = new Map()
  const metrics = { hits: 0, misses: 0, evictions: 0 }

  function get(key) {
    const entry = cache.get(key)
    if (!entry) {
      metrics.misses += 1
      return null
    }

    if (Date.now() - entry.ts > ttlMs) {
      cache.delete(key)
      metrics.misses += 1
      return null
    }

    metrics.hits += 1
    return entry.data
  }

  function set(key, data) {
    if (cache.size >= maxEntries) {
      cache.delete(cache.keys().next().value)
      metrics.evictions += 1
    }
    cache.set(key, { data, ts: Date.now() })
  }

  function getMetrics() {
    const total = metrics.hits + metrics.misses
    const hitRate = total > 0 ? (metrics.hits / total * 100).toFixed(2) : 0
    return {
      hits: metrics.hits,
      misses: metrics.misses,
      hitRate: `${hitRate}%`,
      evictions: metrics.evictions,
      size: cache.size,
    }
  }

  return {
    get,
    set,
    getMetrics,
  }
}
