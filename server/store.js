/**
 * store.js – Datenzugriff auf signifikation.db (SQLite) + In-Memory-Caches
 *
 * Öffentliche API (abwärtskompatibel zu alter JSON-Version):
 *   load(file)           – Daten lesen (deep clone)
 *   loadReadOnly(file)   – Daten lesen (kein extra clone nötig, frisches Objekt)
 *   save(file, data)     – Daten schreiben (gibt Promise zurück)
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
    INSERT INTO lemmata (id,lemma,pos,wortart,runden,rundenInfo,notiz,link,definition,bonusFrage,ipa,definitionen,lueckenfueller)
    VALUES (@id,@lemma,@pos,@wortart,@runden,@rundenInfo,@notiz,@link,@definition,@bonusFrage,@ipa,@definitionen,@lueckenfueller)
    ON CONFLICT(id) DO UPDATE SET
      lemma=excluded.lemma, pos=excluded.pos, wortart=excluded.wortart,
      runden=excluded.runden, rundenInfo=excluded.rundenInfo,
      notiz=excluded.notiz, link=excluded.link, definition=excluded.definition,
      bonusFrage=excluded.bonusFrage, ipa=excluded.ipa, definitionen=excluded.definitionen,
      lueckenfueller=excluded.lueckenfueller
  `),

  // kalender
  getAllKalender:    db.prepare('SELECT * FROM kalender'),
  getKalenderByDatum: db.prepare('SELECT * FROM kalender WHERE datum = ?'),
  deleteAllKalender: db.prepare('DELETE FROM kalender'),
  upsertKalender:   db.prepare('INSERT OR REPLACE INTO kalender (datum, ids, thema, thema_kurz, thema_quelle, lueckenfueller_id) VALUES (@datum, @ids, @thema, @thema_kurz, @thema_quelle, @lueckenfueller_id)'),

  // wortzwilling
  getAllWortzwilling:  db.prepare('SELECT * FROM wortzwilling'),
  getWortzwillingByDatum: db.prepare('SELECT * FROM wortzwilling WHERE datum = ?'),
  deleteAllWortzwilling: db.prepare('DELETE FROM wortzwilling'),
  upsertWortzwilling: db.prepare(
    'INSERT OR REPLACE INTO wortzwilling (datum,wortA,wortB,pos,kollokatoren,notiz,link) VALUES (@datum,@wortA,@wortB,@pos,@kollokatoren,@notiz,@link)'
  ),

  // zeitenwende
  getAllZeitenwende:  db.prepare('SELECT * FROM zeitenwende'),
  getZeitenwendeByDatum: db.prepare('SELECT * FROM zeitenwende WHERE datum = ?'),
  deleteAllZeitenwende: db.prepare('DELETE FROM zeitenwende'),
  upsertZeitenwende: db.prepare(
    'INSERT OR REPLACE INTO zeitenwende (datum, data) VALUES (@datum, @data)'
  ),

  // spezialwochen
  getAllSpezialwochen:   db.prepare('SELECT * FROM spezialwochen ORDER BY von DESC'),
  getSpezialwocheByWoche: db.prepare('SELECT * FROM spezialwochen WHERE woche = ?'),
  getSpezialwocheByDatum: db.prepare(
    'SELECT * FROM spezialwochen WHERE von <= ? AND bis >= ? LIMIT 1'
  ),
  upsertSpezialwoche:   db.prepare(`
    INSERT OR REPLACE INTO spezialwochen
      (woche, von, bis, lemma_id, zwilling_partner, zwilling_pos, zwilling_kollokatoren,
       zeitenwende_notiz, zeitenwende_link, lueckenfueller_id, notiz, link)
    VALUES
      (@woche, @von, @bis, @lemma_id, @zwilling_partner, @zwilling_pos, @zwilling_kollokatoren,
       @zeitenwende_notiz, @zeitenwende_link, @lueckenfueller_id, @notiz, @link)
  `),
  deleteSpezialwoche:   db.prepare('DELETE FROM spezialwochen WHERE woche = ?'),

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

  getStatsByDatumSpiel: db.prepare(`
    SELECT SUM(plays) AS plays, json_group_array(dist) AS dist_list
    FROM stats WHERE datum = ? AND spiel = ?
  `),
}

const _replaceAllAdminDataTx = db.transaction(({ lemmata, kalender, wortzwilling, zeitenwende, statsRows }) => {
  _dailyContentStore.replaceKalender(kalender)
  _dailyContentStore.replaceWortzwilling(wortzwilling)
  _dailyContentStore.replaceZeitenwende(zeitenwende)
  _statsStore.replaceStatsRows(statsRows)
  _saveLemmata(lemmata)
})

function _loadLemmata() {
  return stmts.getAllLemmata.all().map((row) => rowToLemma(row, logger))
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

const _dailyContentStore = createDailyContentStore({ db, stmts, logger })

// ── Dispatcher-Map ────────────────────────────────────────────────

const LOADERS = {
  'lemmata.json': _loadLemmata,
  'kalender.json': _dailyContentStore.loadKalender,
  'wortzwilling.json': _dailyContentStore.loadWortzwilling,
  'zeitenwende.json': _dailyContentStore.loadZeitenwende,
  'stats.json': _statsStore.loadStats,
  'stats-rows.json': _statsStore.loadStatsRows,
}

const SAVERS = {
  'lemmata.json': _saveLemmata,
  'kalender.json': _dailyContentStore.replaceKalender,
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
export function loadKalenderEntry(datum) { return _dailyContentStore.loadKalenderEntry(datum) }

export function save(file, data) {
  const saver = SAVERS[file]
  if (!saver) throw new Error(`Unbekannte Datei: ${file}`)
  saver(data)
  _readOnlyCache.invalidate(file)
  return Promise.resolve()
}

export function saveDailyContentMaps({ kalender, wortzwilling, zeitenwende }) {
  const files = {
    'kalender.json': kalender,
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

export function loadWortZwilling() { return loadReadOnly('wortzwilling.json') }
export function loadZeitenwende() { return loadReadOnly('zeitenwende.json') }
export function loadWortZwillingEntry(datum) { return _dailyContentStore.loadWortzwillingEntry(datum) }
export function loadZeitenwendeEntry(datum) { return _dailyContentStore.loadZeitenwendeEntry(datum) }
export function loadStats() { return loadReadOnly('stats.json') }
export function loadStatsRows() { return loadReadOnly('stats-rows.json') }
export function loadDailyContentMaps() {
  return {
    kalender: loadKalender(),
    wortzwilling: loadWortZwilling(),
    zeitenwende: loadZeitenwende(),
  }
}
export function loadMutableDailyContentMaps() {
  return {
    kalender: load('kalender.json'),
    wortzwilling: load('wortzwilling.json'),
    zeitenwende: load('zeitenwende.json'),
  }
}
export function recordStat(args) { return _statsStore.recordStat(args) }
export function getPercentile(datum, spiel, score, max) { return _statsStore.getPercentile(datum, spiel, score, max) }
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

// ── Spezialwochen ─────────────────────────────────────────────────────

function _parseSpezialwocheRow(row) {
  if (!row) return null
  return {
    woche:                row.woche,
    von:                  row.von,
    bis:                  row.bis,
    lemma_id:             row.lemma_id,
    zwilling_partner:     row.zwilling_partner,
    zwilling_pos:         row.zwilling_pos,
    zwilling_kollokatoren: (() => { try { return JSON.parse(row.zwilling_kollokatoren) } catch { return [] } })(),
    zeitenwende_notiz:    row.zeitenwende_notiz,
    zeitenwende_link:     row.zeitenwende_link,
    lueckenfueller_id:    row.lueckenfueller_id,
    notiz:                row.notiz,
    link:                 row.link,
  }
}

/** Liefert die Spezialwoche, die das angegebene Datum (YYYY-MM-DD) abdeckt, oder null. */
export function loadSpezialwoche(datum) {
  const row = stmts.getSpezialwocheByDatum.get(datum, datum)
  return _parseSpezialwocheRow(row)
}

/** Liefert einen einzelnen Eintrag anhand des ISO-Wochen-Keys (z. B. '2026-W20'). */
export function loadSpezialwocheByWoche(woche) {
  const row = stmts.getSpezialwocheByWoche.get(woche)
  return _parseSpezialwocheRow(row)
}

/** Alle Spezialwochen-Einträge (für Admin-Übersicht). */
export function loadAllSpezialwochen() {
  return stmts.getAllSpezialwochen.all().map(_parseSpezialwocheRow)
}

/** Anlegen oder Überschreiben eines Spezialwoche-Eintrags. */
export function saveSpezialwoche(data) {
  stmts.upsertSpezialwoche.run({
    woche:                  data.woche,
    von:                    data.von,
    bis:                    data.bis,
    lemma_id:               data.lemma_id,
    zwilling_partner:       data.zwilling_partner       ?? '',
    zwilling_pos:           data.zwilling_pos           ?? 'Substantiv',
    zwilling_kollokatoren:  JSON.stringify(data.zwilling_kollokatoren ?? []),
    zeitenwende_notiz:      data.zeitenwende_notiz      ?? '',
    zeitenwende_link:       data.zeitenwende_link       ?? '',
    lueckenfueller_id:      data.lueckenfueller_id      ?? '',
    notiz:                  data.notiz                  ?? '',
    link:                   data.link                   ?? '',
  })
}

/** Löscht eine Spezialwoche anhand des ISO-Wochen-Keys. */
export function deleteSpezialwoche(woche) {
  stmts.deleteSpezialwoche.run(woche)
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
