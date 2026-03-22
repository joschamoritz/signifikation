/**
 * store.js – Datei-I/O und In-Memory-Caches
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

// ── File-Cache ────────────────────────────────────────────────
const fileCache = {}

export function load(file) {
  if (!fileCache[file]) fileCache[file] = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
  return fileCache[file]
}

export function save(file, data) {
  // Atomar: erst in temporäre Datei schreiben, dann umbenennen.
  const target = join(DATA, file)
  const tmp    = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, target)
  fileCache[file] = data
}

export function loadZeitreise()    { try { return load('zeitreise.json')    } catch { return {} } }
export function loadWortZwilling() { try { return load('wortzwilling.json') } catch { return {} } }
export function loadStats()        { try { return load('stats.json')        } catch { return {} } }

// ── Beleg-Cache (TTL 6h, max 200 Einträge, LRU) ─────────────
const _belegeCache = new Map()
const BELEG_TTL_MS = 6 * 60 * 60 * 1000
const BELEG_MAX    = 200

export function cacheGet(key) {
  const entry = _belegeCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > BELEG_TTL_MS) { _belegeCache.delete(key); return null }
  return entry.data
}

export function cacheSet(key, data) {
  if (_belegeCache.size >= BELEG_MAX) {
    _belegeCache.delete(_belegeCache.keys().next().value)
  }
  _belegeCache.set(key, { data, ts: Date.now() })
}
