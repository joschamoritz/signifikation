/**
 * store.js – Datei-I/O und In-Memory-Caches
 *
 * Alle Spieldaten liegen als JSON-Dateien in server/data/:
 *   kalender.json       { "MM-DD": ["lemmaId1", "lemmaId2", "lemmaId3"] }
 *   lemmata.json        Array von { id, lemma, pos, runden, rundenInfo }
 *   zeitreise.json      { lemma, paare, perioden, wortart } pro Eintrag
 *   wortzwilling.json   { wortA, wortB, pos, kollokatoren } pro Eintrag
 *   stats.json          { "MM-DD": { [game]: { plays, scoreSum, maxSum, dist } } }
 *   feedback.json       Array von { game, emoji, text, ts }
 *   diacollo-config.json { corpora: [{ id, enabled, label, zeitraum, slice }] }
 *
 * Auf Railway liegen diese Dateien auf einem persistenten Volume (/app/server/data)
 * und werden NICHT aus Git geladen.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA = join(__dirname, 'data')
mkdirSync(DATA, { recursive: true })

// ── File-Cache ────────────────────────────────────────────────
const fileCache = {}

/**
 * Liest eine JSON-Datei aus DATA/ mit strukturellem Klon.
 * Der Aufrufer darf das Ergebnis mutieren – der Cache bleibt unberührt.
 * @param {string} file  Dateiname relativ zu server/data/ (z.B. 'lemmata.json')
 * @returns {*} Geklonter Dateiinhalt
 */
export function load(file) {
  if (!fileCache[file]) fileCache[file] = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
  return structuredClone(fileCache[file])
}

/** Lese-Only-Zugriff ohne Deep-Clone – nur für Code, der die Daten nicht mutiert */
export function loadReadOnly(file) {
  if (!fileCache[file]) fileCache[file] = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
  return fileCache[file]
}

/**
 * Schreibt data atomar in eine JSON-Datei (tmp → rename) und aktualisiert den Cache.
 * @param {string} file  Dateiname relativ zu server/data/
 * @param {*}      data  Zu speichernde Daten
 */
export function save(file, data) {
  // Atomar: erst in temporäre Datei schreiben, dann umbenennen.
  const target = join(DATA, file)
  const tmp    = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, target)
  fileCache[file] = data
  // Lemmata-Index invalidieren
  if (file === 'lemmata.json') { _lemmataById = null; _lemmataByLemma = null }
}

export function loadZeitreise()    { try { return load('zeitreise.json')    } catch { return {} } }
export function loadWortZwilling() { try { return load('wortzwilling.json') } catch { return {} } }
export function loadStats()        { try { return load('stats.json')        } catch { return {} } }

// ── Lemmata-Index (O(1)-Lookup statt linearem Array-Scan) ─────
let _lemmataById    = null  // Map<id, lemma>
let _lemmataByLemma = null  // Map<lemma, lemma>

export function getLemmataIndex() {
  if (_lemmataById) return { byId: _lemmataById, byLemma: _lemmataByLemma }
  const list = loadReadOnly('lemmata.json')
  _lemmataById    = new Map(list.map(l => [l.id, l]))
  _lemmataByLemma = new Map(list.map(l => [l.lemma, l]))
  return { byId: _lemmataById, byLemma: _lemmataByLemma }
}

// ── Stats-Mutex (serialisiert alle Write-Zugriffe auf stats.json) ─
let _statsWriteLock = Promise.resolve()

/**
 * Serialisiert alle Write-Zugriffe auf stats.json über eine Promise-Kette.
 * Verhindert Race Conditions bei gleichzeitigen Spielabschlüssen.
 * @param {() => Promise<void>} fn  Async-Funktion die stats.json liest und schreibt
 */
export function withStatsLock(fn) {
  _statsWriteLock = _statsWriteLock
    .then(fn)
    .catch(err => {
      logger.error({ err }, 'Stats-Fehler in withStatsLock')
      throw err  // Re-throw damit Caller weiß, dass etwas schief gelaufen ist
    })
  return _statsWriteLock
}

// ── Beleg-Cache (TTL 6h, max 200 Einträge, LRU) ─────────────
const _belegeCache = new Map()
const BELEG_TTL_MS = 6 * 60 * 60 * 1000
const BELEG_MAX    = 200

/**
 * Gibt gecachten Beleg-Datensatz zurück oder null wenn nicht vorhanden/abgelaufen.
 * @param {string} key  Cache-Schlüssel (z.B. 'lemma:relation:korpus')
 * @returns {*|null}
 */
export function cacheGet(key) {
  const entry = _belegeCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > BELEG_TTL_MS) { _belegeCache.delete(key); return null }
  return entry.data
}

/**
 * Speichert einen Beleg-Datensatz im Cache. Bei voller Kapazität wird der
 * älteste Eintrag (LRU) entfernt.
 * @param {string} key   Cache-Schlüssel
 * @param {*}      data  Zu cachende Daten
 */
export function cacheSet(key, data) {
  if (_belegeCache.size >= BELEG_MAX) {
    _belegeCache.delete(_belegeCache.keys().next().value)
  }
  _belegeCache.set(key, { data, ts: Date.now() })
}
