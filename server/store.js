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
 *   getLemmataIndex()    – Map<id, lemma> + Map<lemma, lemma>
 *   withStatsLock(fn)    – Serialisiert Stats-Writes (SQLite übernimmt Atomizität)
 *   cacheGet/cacheSet/getCacheMetrics – Beleg-Cache
 *   initializeIndices()  – Preload beim Start
 *   DATA                 – Pfad zum data/-Verzeichnis (für Archiv-Endpunkt)
 *
 * Keine weiteren JSON-Dateien mehr (feedback + diacollo-config entfernt).
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import AsyncLock from 'async-lock'
import logger from './logger.js'
import db from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

// ── Prepared Statements ───────────────────────────────────────────

const stmts = {
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
  deleteAllStats:   db.prepare('DELETE FROM stats'),
  upsertStats:      db.prepare(`
    INSERT INTO stats (datum,spiel,plays,scoreSum,maxSum,dist)
    VALUES (@datum,@spiel,@plays,@scoreSum,@maxSum,@dist)
    ON CONFLICT(datum,spiel) DO UPDATE SET
      plays=excluded.plays, scoreSum=excluded.scoreSum,
      maxSum=excluded.maxSum, dist=excluded.dist
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

function lemmaToRow(l) {
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
  for (const row of stmts.getAllStats.all()) {
    if (!result[row.datum]) result[row.datum] = {}
    result[row.datum][row.spiel] = {
      plays:    row.plays,
      scoreSum: row.scoreSum,
      maxSum:   row.maxSum,
      dist:     JSON.parse(row.dist ?? '[]'),
    }
  }
  return result
}

const _replaceStats = db.transaction(obj => {
  stmts.deleteAllStats.run()
  for (const [datum, games] of Object.entries(obj)) {
    for (const [spiel, v] of Object.entries(games)) {
      stmts.upsertStats.run({
        datum, spiel,
        plays:    v.plays    ?? 0,
        scoreSum: v.scoreSum ?? 0,
        maxSum:   v.maxSum   ?? 0,
        dist:     JSON.stringify(v.dist ?? []),
      })
    }
  }
})

// ── Dispatcher-Map ────────────────────────────────────────────────

const LOADERS = {
  'lemmata.json':      _loadLemmata,
  'kalender.json':     _loadKalender,
  'zeitreise.json':    _loadZeitreise,
  'wortzwilling.json': _loadWortzwilling,
  'zeitenwende.json':  _loadZeitenwende,
  'stats.json':        _loadStats,
}

const SAVERS = {
  'lemmata.json':      _saveLemmata,
  'kalender.json':     obj => _replaceKalender(obj),
  'zeitreise.json':    obj => _replaceZeitreise(obj),
  'wortzwilling.json': obj => _replaceWortzwilling(obj),
  'zeitenwende.json':  obj => _replaceZeitenwende(obj),
  'stats.json':        obj => _replaceStats(obj),
}

// ── JSON-Fallback für config/feedback ────────────────────────────

const JSON_FILES = new Set()
const _fileCache = {}
const _fileLocks = new Map()

function _getLock(file) {
  if (!_fileLocks.has(file)) _fileLocks.set(file, new AsyncLock())
  return _fileLocks.get(file)
}

function _loadJson(file) {
  if (!_fileCache[file]) {
    try {
      _fileCache[file] = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
    } catch (err) {
      logger.error({ err, file }, 'JSON-Datei konnte nicht geladen werden')
      throw new Error(`Datei ${file} nicht lesbar oder korrumpiert`)
    }
  }
  return structuredClone(_fileCache[file])
}

function _saveJson(file, data) {
  return _getLock(file).acquire(file, () => {
    const target = join(DATA, file)
    const tmp    = `${target}.tmp`
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, target)
    _fileCache[file] = structuredClone(data)
  })
}

// ── Öffentliche API ───────────────────────────────────────────────

export function load(file) {
  if (JSON_FILES.has(file)) return _loadJson(file)
  const loader = LOADERS[file]
  if (!loader) throw new Error(`Unbekannte Datei: ${file}`)
  return loader()
}

export function loadReadOnly(file) {
  return load(file)
}

export function save(file, data) {
  if (JSON_FILES.has(file)) return _saveJson(file, data)
  const saver = SAVERS[file]
  if (!saver) throw new Error(`Unbekannte Datei: ${file}`)
  saver(data)
  return Promise.resolve()
}

// ── Convenience-Loader ────────────────────────────────────────────

export function loadZeitreise()    { return _loadZeitreise()    }
export function loadWortZwilling() { return _loadWortzwilling() }
export function loadZeitenwende()  { return _loadZeitenwende()  }
export function loadStats()        { return _loadStats()        }

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
