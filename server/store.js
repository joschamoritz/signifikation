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
import { buildLemmataIndex, lemmaToRow as lemmaToRowInternal, rowToLemma } from './store-lemmata.js'
import { createReadOnlyCache } from './store-readonly-cache.js'
import { createBelegeCache } from './store-belege-cache.js'
import {
  getKalenderEntries,
  loadKalenderRows,
  loadWortzwillingRows,
  loadZeitreiseRows,
  loadZeitenwendeRows,
  toWortzwillingRow,
  toZeitreiseRow,
  toZeitenwendeRow,
} from './store-daily-content.js'
import {
  aggregateStatsRows,
  createEmptyDistribution,
  createStatsWindowCache,
  getCachedStatsWindow,
  getNormalizedScoreBucket,
  mapStatsRows,
  normalizeDistribution,
  sanitizeStatsRow,
} from './store-stats.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

// ── Prepared Statements ───────────────────────────────────────────

export const stmts = {
  // lemmata
  getAllLemmata:     db.prepare('SELECT * FROM lemmata'),
  deleteAllLemmata:  db.prepare('DELETE FROM lemmata'),
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

const _replaceAllAdminDataTx = db.transaction(({ lemmata, kalender, zeitreise, wortzwilling, zeitenwende, statsRows }) => {
  _replaceKalender(kalender)
  _replaceZeitreise(zeitreise)
  _replaceWortzwilling(wortzwilling)
  _replaceZeitenwende(zeitenwende)
  _replaceStatsRows(statsRows)
  _saveLemmata(lemmata)
})

function _loadLemmata() {
  return stmts.getAllLemmata.all().map(rowToLemma)
}

export const lemmaToRow = lemmaToRowInternal

const _replaceLemmata = db.transaction(list => {
  stmts.deleteAllLemmata.run()
  for (const l of list) stmts.upsertLemma.run(lemmaToRow(l))
})

function _saveLemmata(arr) {
  _replaceLemmata(arr)
  _lemmataById    = null
  _lemmataByLemma = null
}

// ── Kalender ──────────────────────────────────────────────────────

function _loadKalender() {
  return loadKalenderRows(stmts.getAllKalender.all())
}

const _replaceKalender = db.transaction(obj => {
  stmts.deleteAllKalender.run()
  for (const [datum, ids] of getKalenderEntries(obj)) {
    stmts.upsertKalender.run({ datum, ids: JSON.stringify(ids) })
  }
})

// ── Zeitreise ─────────────────────────────────────────────────────

function _loadZeitreise() {
  return loadZeitreiseRows(stmts.getAllZeitreise.all())
}

const _replaceZeitreise = db.transaction(obj => {
  stmts.deleteAllZeitreise.run()
  for (const [datum, v] of Object.entries(obj)) {
    stmts.upsertZeitreise.run(toZeitreiseRow(datum, v))
  }
})

// ── Wortzwilling ──────────────────────────────────────────────────

function _loadWortzwilling() {
  return loadWortzwillingRows(stmts.getAllWortzwilling.all())
}

const _replaceWortzwilling = db.transaction(obj => {
  stmts.deleteAllWortzwilling.run()
  for (const [datum, v] of Object.entries(obj)) {
    stmts.upsertWortzwilling.run(toWortzwillingRow(datum, v))
  }
})

// ── Zeitenwende ───────────────────────────────────────────────────

function _loadZeitenwende() {
  return loadZeitenwendeRows(stmts.getAllZeitenwende.all())
}

const _replaceZeitenwende = db.transaction(obj => {
  stmts.deleteAllZeitenwende.run()
  for (const [datum, v] of Object.entries(obj)) {
    stmts.upsertZeitenwende.run(toZeitenwendeRow(datum, v))
  }
})

// ── Stats ─────────────────────────────────────────────────────────

function _loadStats() {
  return aggregateStatsRows(stmts.getStatsAggregated.all())
}

function _loadStatsRows() {
  return mapStatsRows(stmts.getAllStats.all())
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
    stmts.upsertStats.run(sanitizeStatsRow(row))
  }
})

const _recordStatTx = db.transaction(({ datum, spiel, userId, score, max }) => {
  const safeUserId = String(userId || '')
  const existing = stmts.getStatsByKey.get(datum, spiel, safeUserId)

  const dist = existing ? normalizeDistribution(existing.dist || '[]') : createEmptyDistribution()

  const normalized = getNormalizedScoreBucket(score, max)
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

const READONLY_TTL_MS = 5 * 60 * 1000
const _readOnlyCache = createReadOnlyCache({
  ttlMs: READONLY_TTL_MS,
  logger,
  onInvalidate(file) {
    if (!file || file === 'lemmata.json') {
      _lemmataById = null
      _lemmataByLemma = null
    }
  },
})
_readOnlyCache.startCleanup(5 * 60 * 1000)

// ── Öffentliche API ───────────────────────────────────────────────

export function load(file) {
  const loader = LOADERS[file]
  if (!loader) throw new Error(`Unbekannte Datei: ${file}`)
  return loader()
}

export function loadReadOnly(file) {
  const cached = _readOnlyCache.get(file)
  if (cached !== null) return cached
  const data = load(file)
  _readOnlyCache.set(file, data)
  return data
}

export function save(file, data) {
  const saver = SAVERS[file]
  if (!saver) throw new Error(`Unbekannte Datei: ${file}`)
  saver(data)
  _readOnlyCache.invalidate(file)
  return Promise.resolve()
}

export function replaceAllAdminData(bundle) {
  _replaceAllAdminDataTx(bundle)
  _readOnlyCache.invalidateAll()
  return Promise.resolve()
}

export function invalidateCache(file) {
  if (file) _readOnlyCache.invalidate(file)
  else _readOnlyCache.invalidateAll()
}

// ── Convenience-Loader (mit ReadOnly-Cache) ──────────────────────

export function loadZeitreise() { return loadReadOnly('zeitreise.json') }
export function loadWortZwilling() { return loadReadOnly('wortzwilling.json') }
export function loadZeitenwende() { return loadReadOnly('zeitenwende.json') }
export function loadStats() { return loadReadOnly('stats.json') }
export function loadStatsRows() { return loadReadOnly('stats-rows.json') }

let _statsWindowCache = {
  ...createStatsWindowCache(30 * 1000),
}

export function getStatsWindow(days) {
  const stats = loadStats()
  return getCachedStatsWindow(_statsWindowCache, stats, days)
}

// ── Lemmata-Index (O(1)-Lookup statt linearem Array-Scan) ─────────

let _lemmataById    = null
let _lemmataByLemma = null

export function getLemmataIndex() {
  if (_lemmataById) return { byId: _lemmataById, byLemma: _lemmataByLemma }
  try {
    const list = _loadLemmata()
    if (!Array.isArray(list)) throw new Error('lemmata ist kein Array')
    const index = buildLemmataIndex(list)
    _lemmataById = index.byId
    _lemmataByLemma = index.byLemma
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

const BELEG_TTL_MS  = 6 * 60 * 60 * 1000
const BELEG_MAX     = 2000
const _belegeCache = createBelegeCache({ ttlMs: BELEG_TTL_MS, maxEntries: BELEG_MAX })

export function cacheGet(key) {
  return _belegeCache.get(key)
}

export function cacheSet(key, data) {
  _belegeCache.set(key, data)
}

export function getCacheMetrics() {
  return _belegeCache.getMetrics()
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
