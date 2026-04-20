/**
 * store.js – Datenzugriff auf signifikation.db (SQLite) + In-Memory-Caches
 *
 * Öffentliche API (abwärtskompatibel zu alter JSON-Version):
 *   load(file)           – Daten lesen (deep clone)
 *   loadReadOnly(file)   – Daten lesen (kein extra clone nötig, frisches Objekt)
 *   save(file, data)     – Daten schreiben (gibt Promise zurück)
 *   loadZeitreise()      – Zeitreise-Dict
 *   loadWortZwilling()   – Wort-Zwilling-Dict
 *   loadZeitenwende()    – Zeitenwende-Dict
 *   loadStats()          – Stats-Dict
 *   loadStatsRows()      – rohe Stats-Zeilen (inkl. user_id)
 *   getLemmataIndex()    – Map<id, lemma> + Map<lemma, lemma>
 *   withStatsLock(fn)    – Serialisiert Stats-Writes (SQLite übernimmt Atomizität)
 *   cacheGet/cacheSet/getCacheMetrics – Beleg-Cache
 *   initializeIndices()  – Preload beim Start
 *   DATA                 – Pfad zum data/-Verzeichnis (für Archiv-Endpunkt)
 *
 * Keine weiteren JSON-Dateien mehr (feedback + diacollo-config entfernt).
 */
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import logger from './logger.js'
import db from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

// ── Prepared Statements ───────────────────────────────────────────

export const stmts = {
  // lemmata
  getAllLemmata:     db.prepare('SELECT * FROM lemmata'),
  upsertLemma:      db.prepare(`
    INSERT INTO lemmata (id,lemma,pos,wortart,runden,rundenInfo,notiz,link,definition,bonusFrage,ipa,definitionen)
    VALUES (@id,@lemma,@pos,@wortart,@runden,@rundenInfo,@notiz,@link,@definition,@bonusFrage,@ipa,@definitionen)
    ON CONFLICT(id) DO UPDATE SET
      lemma=excluded.lemma, pos=excluded.pos, wortart=excluded.wortart,
      runden=excluded.runden, rundenInfo=excluded.rundenInfo,
      notiz=excluded.notiz, link=excluded.link, definition=excluded.definition,
      bonusFrage=excluded.bonusFrage, ipa=excluded.ipa, definitionen=excluded.definitionen
  `),

  // kalender
  getAllKalender:    db.prepare('SELECT * FROM kalender'),
  deleteAllKalender: db.prepare('DELETE FROM kalender'),
  upsertKalender:   db.prepare('INSERT OR REPLACE INTO kalender (datum, ids) VALUES (@datum, @ids)'),

  // zeitreise
  getAllZeitreise:   db.prepare('SELECT * FROM zeitreise'),
  deleteAllZeitreise: db.prepare('DELETE FROM zeitreise'),
  upsertZeitreise:  db.prepare(
    'INSERT OR REPLACE INTO zeitreise (datum,lemma,paare,perioden,wortart) VALUES (@datum,@lemma,@paare,@perioden,@wortart)'
  ),

  // wortzwilling
  getAllWortzwilling:  db.prepare('SELECT * FROM wortzwilling'),
  deleteAllWortzwilling: db.prepare('DELETE FROM wortzwilling'),
  upsertWortzwilling: db.prepare(
    'INSERT OR REPLACE INTO wortzwilling (datum,wortA,wortB,pos,kollokatoren) VALUES (@datum,@wortA,@wortB,@pos,@kollokatoren)'
  ),

  // zeitenwende
  getAllZeitenwende:  db.prepare('SELECT * FROM zeitenwende'),
  deleteAllZeitenwende: db.prepare('DELETE FROM zeitenwende'),
  upsertZeitenwende: db.prepare(
    'INSERT OR REPLACE INTO zeitenwende (datum, data) VALUES (@datum, @data)'
  ),

  // stats
  getAllStats:       db.prepare('SELECT * FROM stats'),
  getStatsByKey:     db.prepare('SELECT * FROM stats WHERE datum = ? AND spiel = ? AND user_id = ?'),
  deleteAllStats:   db.prepare('DELETE FROM stats'),
  upsertStats:      db.prepare(`
    INSERT INTO stats (datum,spiel,user_id,plays,scoreSum,maxSum,dist)
    VALUES (@datum,@spiel,@user_id,@plays,@scoreSum,@maxSum,@dist)
    ON CONFLICT(datum,spiel,user_id) DO UPDATE SET
      plays=excluded.plays, scoreSum=excluded.scoreSum,
      maxSum=excluded.maxSum, dist=excluded.dist
  `),

  getStatsAggregated: db.prepare(`
    SELECT
      datum,
      spiel,
      SUM(plays) AS plays,
      SUM(scoreSum) AS scoreSum,
      SUM(maxSum) AS maxSum,
      json_group_array(dist) AS dist_list
    FROM stats
    GROUP BY datum, spiel
  `),
}

// ── Lemmata ───────────────────────────────────────────────────────

function rowToLemma(row) {
  return {
    id:           row.id,
    lemma:        row.lemma,
    pos:          row.pos,
    wortart:      row.wortart,
    runden:       JSON.parse(row.runden     || '{}'),
    rundenInfo:   JSON.parse(row.rundenInfo || '[]'),
    notiz:        row.notiz,
    link:         row.link,
    definition:   row.definition,
    bonusFrage:   row.bonusFrage ? JSON.parse(row.bonusFrage) : null,
    ipa:          row.ipa,
    definitionen: JSON.parse(row.definitionen || '[]'),
  }
}

export function lemmaToRow(l) {
  return {
    id:           l.id,
    lemma:        l.lemma,
    pos:          l.pos          ?? '',
    wortart:      l.wortart      ?? '',
    runden:       JSON.stringify(l.runden      ?? {}),
    rundenInfo:   JSON.stringify(l.rundenInfo  ?? []),
    notiz:        l.notiz        ?? '',
    link:         l.link         ?? '',
    definition:   l.definition   ?? '',
    bonusFrage:   l.bonusFrage ? JSON.stringify(l.bonusFrage) : null,
    ipa:          l.ipa          ?? '',
    definitionen: JSON.stringify(l.definitionen ?? []),
  }
}

function _loadLemmata() {
  return stmts.getAllLemmata.all().map(rowToLemma)
}

const _upsertLemmataMany = db.transaction(list => {
  for (const l of list) stmts.upsertLemma.run(lemmaToRow(l))
})

function _saveLemmata(arr) {
  _upsertLemmataMany(arr)
  _lemmataById    = null
  _lemmataByLemma = null
}

// ── Kalender ──────────────────────────────────────────────────────

function _loadKalender() {
  const result = {}
  for (const row of stmts.getAllKalender.all()) {
    result[row.datum] = JSON.parse(row.ids)
  }
  return result
}

const _replaceKalender = db.transaction(obj => {
  stmts.deleteAllKalender.run()
  for (const [datum, ids] of Object.entries(obj)) {
    stmts.upsertKalender.run({ datum, ids: JSON.stringify(ids) })
  }
})

// ── Zeitreise ─────────────────────────────────────────────────────

function _loadZeitreise() {
  const result = {}
  for (const row of stmts.getAllZeitreise.all()) {
    result[row.datum] = {
      lemma:    row.lemma,
      paare:    JSON.parse(row.paare),
      perioden: JSON.parse(row.perioden),
      wortart:  row.wortart,
    }
  }
  return result
}

const _replaceZeitreise = db.transaction(obj => {
  stmts.deleteAllZeitreise.run()
  for (const [datum, v] of Object.entries(obj)) {
    stmts.upsertZeitreise.run({
      datum,
      lemma:    v.lemma    ?? '',
      paare:    JSON.stringify(v.paare    ?? []),
      perioden: JSON.stringify(v.perioden ?? []),
      wortart:  v.wortart  ?? 'Substantiv',
    })
  }
})

// ── Wortzwilling ──────────────────────────────────────────────────

function _loadWortzwilling() {
  const result = {}
  for (const row of stmts.getAllWortzwilling.all()) {
    result[row.datum] = {
      wortA:        row.wortA,
      wortB:        row.wortB,
      pos:          row.pos,
      kollokatoren: JSON.parse(row.kollokatoren),
    }
  }
  return result
}

const _replaceWortzwilling = db.transaction(obj => {
  stmts.deleteAllWortzwilling.run()
  for (const [datum, v] of Object.entries(obj)) {
    stmts.upsertWortzwilling.run({
      datum,
      wortA:        v.wortA        ?? '',
      wortB:        v.wortB        ?? '',
      pos:          v.pos          ?? 'Substantiv',
      kollokatoren: JSON.stringify(v.kollokatoren ?? []),
    })
  }
})

// ── Zeitenwende ───────────────────────────────────────────────────

function _loadZeitenwende() {
  const result = {}
  for (const row of stmts.getAllZeitenwende.all()) {
    result[row.datum] = JSON.parse(row.data)
  }
  return result
}

const _replaceZeitenwende = db.transaction(obj => {
  stmts.deleteAllZeitenwende.run()
  for (const [datum, v] of Object.entries(obj)) {
    stmts.upsertZeitenwende.run({ datum, data: JSON.stringify(v) })
  }
})

// ── Stats ─────────────────────────────────────────────────────────

function _loadStats() {
  const result = {}
  for (const row of stmts.getStatsAggregated.all()) {
    if (!result[row.datum]) result[row.datum] = {}

    const distEntries = (() => {
      try {
        return JSON.parse(row.dist_list || '[]')
      } catch {
        return []
      }
    })()

    const mergedDist = Array(11).fill(0)
    for (const distRaw of distEntries) {
      let dist = []
      try {
        dist = typeof distRaw === 'string' ? JSON.parse(distRaw) : distRaw
      } catch {
        dist = []
      }
      if (!Array.isArray(dist)) continue
      for (let i = 0; i < 11; i += 1) {
        mergedDist[i] += Number(dist[i] || 0)
      }
    }

    result[row.datum][row.spiel] = {
      plays:    row.plays,
      scoreSum: row.scoreSum,
      maxSum:   row.maxSum,
      dist:     mergedDist,
    }
  }
  return result
}

function _loadStatsRows() {
  return stmts.getAllStats.all().map((row) => {
    let dist = []
    try {
      const parsed = JSON.parse(row.dist || '[]')
      dist = Array.isArray(parsed) ? parsed : []
    } catch {
      dist = []
    }

    return {
      datum: row.datum,
      spiel: row.spiel,
      user_id: row.user_id || '',
      plays: Number(row.plays || 0),
      scoreSum: Number(row.scoreSum || 0),
      maxSum: Number(row.maxSum || 0),
      dist,
    }
  })
}

const _replaceStats = db.transaction(obj => {
  stmts.deleteAllStats.run()
  for (const [datum, games] of Object.entries(obj)) {
    for (const [spiel, v] of Object.entries(games)) {
      stmts.upsertStats.run({
        datum, spiel,
        user_id: v.user_id ?? '',
        plays:    v.plays    ?? 0,
        scoreSum: v.scoreSum ?? 0,
        maxSum:   v.maxSum   ?? 0,
        dist:     JSON.stringify(v.dist ?? []),
      })
    }
  }
})

const _replaceStatsRows = db.transaction((rows) => {
  stmts.deleteAllStats.run()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue

    const datum = String(row.datum || '').trim()
    const spiel = String(row.spiel || '').trim()
    if (!datum || !spiel) continue

    const safeDist = Array.isArray(row.dist) ? row.dist : []
    const toNonNegativeInt = (value) => {
      const parsed = Number.parseInt(String(value ?? 0), 10)
      if (!Number.isFinite(parsed) || parsed < 0) return 0
      return parsed
    }

    stmts.upsertStats.run({
      datum,
      spiel,
      user_id: String(row.user_id || ''),
      plays: toNonNegativeInt(row.plays),
      scoreSum: toNonNegativeInt(row.scoreSum),
      maxSum: toNonNegativeInt(row.maxSum),
      dist: JSON.stringify(safeDist),
    })
  }
})

const _recordStatTx = db.transaction(({ datum, spiel, userId, score, max }) => {
  const safeUserId = String(userId || '')
  const existing = stmts.getStatsByKey.get(datum, spiel, safeUserId)

  const dist = (() => {
    if (!existing) return Array(11).fill(0)
    try {
      const parsed = JSON.parse(existing.dist || '[]')
      if (!Array.isArray(parsed)) return Array(11).fill(0)
      const out = Array(11).fill(0)
      for (let i = 0; i < 11; i += 1) out[i] = Number(parsed[i] || 0)
      return out
    } catch {
      return Array(11).fill(0)
    }
  })()

  const normalized = Math.min(10, Math.max(0, Math.round((score || 0) / (max || 1) * 10)))
  dist[normalized] += 1

  stmts.upsertStats.run({
    datum,
    spiel,
    user_id: safeUserId,
    plays: (existing?.plays || 0) + 1,
    scoreSum: (existing?.scoreSum || 0) + Math.max(0, Number(score || 0)),
    maxSum: (existing?.maxSum || 0) + Number(max || 0),
    dist: JSON.stringify(dist),
  })
})

export function recordStat({ datum, spiel, userId = '', score = 0, max = 0 }) {
  _recordStatTx({ datum, spiel, userId, score, max })
}

// ── Dispatcher-Map ────────────────────────────────────────────────

const LOADERS = {
  'lemmata.json':      _loadLemmata,
  'kalender.json':     _loadKalender,
  'zeitreise.json':    _loadZeitreise,
  'wortzwilling.json': _loadWortzwilling,
  'zeitenwende.json':  _loadZeitenwende,
  'stats.json':        _loadStats,
  'stats-rows.json':   _loadStatsRows,
}

const SAVERS = {
  'lemmata.json':      _saveLemmata,
  'kalender.json':     obj => _replaceKalender(obj),
  'zeitreise.json':    obj => _replaceZeitreise(obj),
  'wortzwilling.json': obj => _replaceWortzwilling(obj),
  'zeitenwende.json':  obj => _replaceZeitenwende(obj),
  'stats.json':        obj => _replaceStats(obj),
  'stats-rows.json':   rows => _replaceStatsRows(Array.isArray(rows) ? rows : []),
}

// ── In-Memory-Cache für loadReadOnly ──────────────────────────────

const _readOnlyCache = new Map()
const READONLY_TTL_MS = 5 * 60 * 1000

function _getCached(file) {
  const entry = _readOnlyCache.get(file)
  if (entry && Date.now() - entry.ts < READONLY_TTL_MS) return entry.data
  return null
}

function _setCached(file, data) {
  _readOnlyCache.set(file, { data, ts: Date.now() })
}

function _invalidateCached(file) {
  _readOnlyCache.delete(file)
  if (file === 'lemmata.json') {
    _lemmataById = null
    _lemmataByLemma = null
  }
}

function _invalidateAllCached() {
  _readOnlyCache.clear()
  _lemmataById = null
  _lemmataByLemma = null
}

// ── Öffentliche API ───────────────────────────────────────────────

export function load(file) {
  const loader = LOADERS[file]
  if (!loader) throw new Error(`Unbekannte Datei: ${file}`)
  return loader()
}

export function loadReadOnly(file) {
  const cached = _getCached(file)
  if (cached !== null) return cached
  const data = load(file)
  _setCached(file, data)
  return data
}

export function save(file, data) {
  const saver = SAVERS[file]
  if (!saver) throw new Error(`Unbekannte Datei: ${file}`)
  saver(data)
  _invalidateCached(file)
  return Promise.resolve()
}

export function invalidateCache(file) {
  if (file) _invalidateCached(file)
  else _invalidateAllCached()
}

// ── Convenience-Loader (mit ReadOnly-Cache) ──────────────────────

export function loadZeitreise() { return loadReadOnly('zeitreise.json') }
export function loadWortZwilling() { return loadReadOnly('wortzwilling.json') }
export function loadZeitenwende() { return loadReadOnly('zeitenwende.json') }
export function loadStats() { return loadReadOnly('stats.json') }
export function loadStatsRows() { return loadReadOnly('stats-rows.json') }

// ── Lemmata-Index (O(1)-Lookup statt linearem Array-Scan) ─────────

let _lemmataById    = null
let _lemmataByLemma = null

export function getLemmataIndex() {
  if (_lemmataById) return { byId: _lemmataById, byLemma: _lemmataByLemma }
  try {
    const list = _loadLemmata()
    if (!Array.isArray(list)) throw new Error('lemmata ist kein Array')
    _lemmataById    = new Map(list.map(l => [l.id, l]))
    _lemmataByLemma = new Map(list.map(l => [l.lemma, l]))
  } catch (err) {
    logger.error({ err }, 'Lemmata-Index konnte nicht aufgebaut werden – leerer Fallback')
    _lemmataById    = new Map()
    _lemmataByLemma = new Map()
  }
  return { byId: _lemmataById, byLemma: _lemmataByLemma }
}

// ── Stats-Lock (SQLite-Transaktionen übernehmen Atomizität) ───────

export function withStatsLock(fn) {
  return Promise.resolve().then(fn)
}

// ── Beleg-Cache (TTL 6h, max 2000 Einträge, LRU) ─────────────────

const _belegeCache  = new Map()
const BELEG_TTL_MS  = 6 * 60 * 60 * 1000
const BELEG_MAX     = 2000
const _cacheMetrics = { hits: 0, misses: 0, evictions: 0 }

export function cacheGet(key) {
  const entry = _belegeCache.get(key)
  if (!entry) { _cacheMetrics.misses++; return null }
  if (Date.now() - entry.ts > BELEG_TTL_MS) {
    _belegeCache.delete(key)
    _cacheMetrics.misses++
    return null
  }
  _cacheMetrics.hits++
  return entry.data
}

export function cacheSet(key, data) {
  if (_belegeCache.size >= BELEG_MAX) {
    _belegeCache.delete(_belegeCache.keys().next().value)
    _cacheMetrics.evictions++
  }
  _belegeCache.set(key, { data, ts: Date.now() })
}

export function getCacheMetrics() {
  const total   = _cacheMetrics.hits + _cacheMetrics.misses
  const hitRate = total > 0 ? (_cacheMetrics.hits / total * 100).toFixed(2) : 0
  return {
    hits:      _cacheMetrics.hits,
    misses:    _cacheMetrics.misses,
    hitRate:   `${hitRate}%`,
    evictions: _cacheMetrics.evictions,
    size:      _belegeCache.size,
  }
}

// ── Startup-Initialisierung ───────────────────────────────────────

export function initializeIndices() {
  try {
    getLemmataIndex()
    logger.info('Indices preloaded: lemmata')
  } catch (err) {
    logger.warn({ err }, 'Preload initialization incomplete – will lazy-load on demand')
  }
}

// ── Periodisches ReadOnly-Cache Cleanup (alle 5 Minuten) ────────

setInterval(() => {
  const now = Date.now()
  let cleaned = 0
  for (const [key, entry] of _readOnlyCache.entries()) {
    if (now - entry.ts > READONLY_TTL_MS) {
      _readOnlyCache.delete(key)
      cleaned++
    }
  }
  if (cleaned > 0) logger.debug({ cleaned }, 'ReadOnly-Cache Cleanup')
}, 5 * 60 * 1000)
