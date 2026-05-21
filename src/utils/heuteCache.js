const KEY = 'sig_cache_heute'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function saveHeuteCache(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, cachedAt: new Date().toISOString() }))
  } catch (_) {}
}

export function loadHeuteCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY))
    if (!cached?.datum || cached.datum !== todayISO()) return null
    return cached
  } catch (_) {
    return null
  }
}
