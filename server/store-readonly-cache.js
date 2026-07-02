export function createReadOnlyCache({ ttlMs, onInvalidate, logger }) {
  const cache = new Map()

  function get(file) {
    const entry = cache.get(file)
    if (entry && Date.now() - entry.ts < ttlMs) return entry.data
    return null
  }

  function set(file, data) {
    cache.set(file, { data, ts: Date.now() })
  }

  function invalidate(file) {
    cache.delete(file)
    onInvalidate?.(file)
  }

  function invalidateAll() {
    cache.clear()
    onInvalidate?.()
  }

  function cleanup() {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of cache.entries()) {
      if (now - entry.ts > ttlMs) {
        cache.delete(key)
        cleaned += 1
      }
    }

    if (cleaned > 0) logger?.debug({ cleaned }, 'ReadOnly-Cache Cleanup')
  }

  return {
    get,
    set,
    invalidate,
    invalidateAll,
    startCleanup(intervalMs) {
      const t = setInterval(cleanup, intervalMs)
      t.unref?.() // darf den Prozess bei Shutdown/Vitest nicht am Leben halten
      return t
    },
  }
}
