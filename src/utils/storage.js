export function lsGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function lsSet(key, value) {
  try { localStorage.setItem(key, value) } catch (err) { console.error('localStorage write:', err) }
}

export function lsParse(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
