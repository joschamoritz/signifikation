export function lsGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function lsRemove(key) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function lsParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
