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
import { createLemmataIndexStore, lemmaToRow as lemmaToRowInternal, rowToLemma } from './store-lemmata.js'
import { createReadOnlyCache } from './store-readonly-cache.js'
import { createBelegeCache } from './store-belege-cache.js'
import {
  createDailyContentStore,
} from './store-daily-content.js'
import {
  createStatsStore,
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
  upsertKalender:   db.prepare('INSERT OR REPLACE INTO kalender (datum, ids, thema, thema_kurz, thema_quelle) VALUES (@datum, @ids, @thema, @thema_kurz, @thema_quelle)'),

  // zeitreise
  getAllZeitreise:   db.prepare('SELECT * FROM zeitreise'),
  deleteAllZeitreise: db.prepare('DELETE FROM zeitreise'),
  upsertZeitreise:  db.prepare(
    'INSERT OR REPLACE INTO zeitreise (datum,lemma,paare,perioden,wortart,notiz,link) VALUES (@datum,@lemma,@paare,@perioden,@wortart,@notiz,@link)'
  ),

  // wortzwilling
  getAllWortzwilling:  db.prepare('SELECT * FROM wortzwilling'),
  deleteAllWortzwilling: db.prepare('DELETE FROM wortzwilling'),
  upsertWortzwilling: db.prepare(
    'INSERT OR REPLACE INTO wortzwilling (datum,wortA,wortB,pos,kollokatoren,notiz,link) VALUES (@datum,@wortA,@wortB,@pos,@kollokatoren,@notiz,@link)'
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
  _dailyContentStore.replaceKalender(kalender)
  _dailyContentStore.replaceZeitreise(zeitreise)
  _dailyContentStore.replaceWortzwilling(wortzwilling)
  _dailyContentStore.replaceZeitenwende(zeitenwende)
  _statsStore.replaceStatsRows(statsRows)
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
  _lemmataIndexStore.invalidate()
}

// ── Stats ─────────────────────────────────────────────────────────

// ── In-Memory-Cache für loadReadOnly ──────────────────────────────

const READONLY_TTL_MS = 5 * 60 * 1000
const _readOnlyCache = createReadOnlyCache({
  ttlMs: READONLY_TTL_MS,
  logger,
  onInvalidate(file) {
    if (!file || file === 'lemmata.json') _lemmataIndexStore.invalidate()
  },
})
_readOnlyCache.startCleanup(5 * 60 * 1000)

const _statsStore = createStatsStore({
  db,
  stmts,
  loadReadOnly(file) {
    return loadReadOnly(file)
  },
})

const _dailyContentStore = createDailyContentStore({ db, stmts })

// ── Dispatcher-Map ────────────────────────────────────────────────

const LOADERS = {
  'lemmata.json': _loadLemmata,
  'kalender.json': _dailyContentStore.loadKalender,
  'zeitreise.json': _dailyContentStore.loadZeitreise,
  'wortzwilling.json': _dailyContentStore.loadWortzwilling,
  'zeitenwende.json': _dailyContentStore.loadZeitenwende,
  'stats.json': _statsStore.loadStats,
  'stats-rows.json': _statsStore.loadStatsRows,
}

const SAVERS = {
  'lemmata.json': _saveLemmata,
  'kalender.json': _dailyContentStore.replaceKalender,
  'zeitreise.json': _dailyContentStore.replaceZeitreise,
  'wortzwilling.json': _dailyContentStore.replaceWortzwilling,
  'zeitenwende.json': _dailyContentStore.replaceZeitenwende,
  'stats.json': _statsStore.replaceStats,
  'stats-rows.json': (rows) => _statsStore.replaceStatsRows(Array.isArray(rows) ? rows : []),
}

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

export function loadKalender() { return loadReadOnly('kalender.json') }

export function save(file, data) {
  const saver = SAVERS[file]
  if (!saver) throw new Error(`Unbekannte Datei: ${file}`)
  saver(data)
  _readOnlyCache.invalidate(file)
  return Promise.resolve()
}

export function saveDailyContentMaps({ kalender, zeitreise, wortzwilling, zeitenwende }) {
  const files = {
    'kalender.json': kalender,
    'zeitreise.json': zeitreise,
    'wortzwilling.json': wortzwilling,
    'zeitenwende.json': zeitenwende,
  }

  for (const [file, data] of Object.entries(files)) {
    const saver = SAVERS[file]
    if (!saver) throw new Error(`Unbekannte Datei: ${file}`)
    saver(data)
    _readOnlyCache.invalidate(file)
  }

  return Promise.resolve()
}

export function loadBackupFiles() {
  return {
    'lemmata.json': loadReadOnly('lemmata.json'),
    'kalender.json': loadKalender(),
    'zeitreise.json': loadZeitreise(),
    'wortzwilling.json': loadWortZwilling(),
    'zeitenwende.json': loadZeitenwende(),
    'stats.json': loadStats(),
    'stats-rows.json': loadStatsRows(),
  }
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
export function loadDailyContentMaps() {
  return {
    kalender: loadKalender(),
    zeitreise: loadZeitreise(),
    wortzwilling: loadWortZwilling(),
    zeitenwende: loadZeitenwende(),
  }
}
export function loadMutableDailyContentMaps() {
  return {
    kalender: load('kalender.json'),
    zeitreise: load('zeitreise.json'),
    wortzwilling: load('wortzwilling.json'),
    zeitenwende: load('zeitenwende.json'),
  }
}
export function recordStat(args) { return _statsStore.recordStat(args) }
export function getStatsWindow(days) { return _statsStore.getStatsWindow(days) }
export function getStatsTimeline(days) { return _statsStore.getStatsTimeline(days) }

const _lemmataIndexStore = createLemmataIndexStore(_loadLemmata, logger)

export function getLemmataIndex() {
  return _lemmataIndexStore.get()
}

// ── Stats-Lock (SQLite-Transaktionen übernehmen Atomizität) ───────

export function withStatsLock(fn) {
  return Promise.resolve().then(fn)
}

// ── Beleg-Cache (TTL 6h, max 2000 Einträge, LRU) ─────────────────

const _belegeCache = createBelegeCache({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 2000 })

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
