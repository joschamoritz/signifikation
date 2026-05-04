/**
 * belege.js – Belegsatz-Suche aus eigenem CC-BY-SA-Korpus
 *
 * Ersetzt den DWDS-Aufruf in public.js /api/v1/belege.
 * Liest aus 06_belege/belege.db (FTS5-Index, gebaut von build_belege.py).
 *
 * DB-Pfad: Umgebungsvariable BELEGE_DB, sonst lokaler Pfad.
 * Für Railway: BELEGE_DB=/data/belege.db (Persistent Volume)
 */

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.BELEGE_DB
  ?? resolve(__dirname, '..', 'wortprofil', '06_belege', 'belege.db')

// BELEGE_MMAP_MB: Memory-mapped I/O in MB (Standard: 2048 für DigitalOcean,
// auf Instanzen mit wenig RAM auf z.B. 256 oder 512 reduzieren)
const MMAP_BYTES = (parseInt(process.env.BELEGE_MMAP_MB ?? '2048', 10)) * 1024 * 1024

let _db = null
function db() {
  if (!_db) {
    try {
      _db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      _db.pragma('cache_size = -131072')        // 128 MB Page-Cache
      _db.pragma(`mmap_size = ${MMAP_BYTES}`)   // konfigurierbar per BELEGE_MMAP_MB
      _db.pragma('temp_store = MEMORY')
      logger.info(`Belege-DB geladen: ${DB_PATH}`)
    } catch (err) {
      logger.warn({ err }, `Belege-DB nicht verfügbar: ${DB_PATH}`)
      return null
    }
  }
  return _db
}

/**
 * Prüft ob ein bereinigtes Wort zu einem Lemma gehört.
 * Kurze Lemmata (< 4 Zeichen) werden exakt verglichen, um False Positives
 * zu vermeiden ("er" würde sonst "erklären", "erhöhen" usw. markieren).
 * Längere Lemmata nutzen startsWith für Flexionsformen ("Tisch" → "Tisches").
 */
function matchesLemma(wordLow, lemmaLow) {
  if (!lemmaLow) return false
  if (lemmaLow.length < 4) return wordLow === lemmaLow
  return wordLow.startsWith(lemmaLow)
}

/**
 * Tokenisiert einen Satz und markiert Wörter, die mit lemma oder collocate beginnen.
 * Gibt das DWDS-kompatible tokens-Format zurück: [{w, ws, hl}]
 */
function tokenize(sentence, lemma, collocate) {
  const lemmaLow     = lemma.toLowerCase()
  const collocateLow = collocate.toLowerCase()

  // Wörter und Interpunktion splitten, Leerzeichen als ws-Flag merken
  const parts = sentence.split(/(\s+)/)
  const tokens = []
  let expectWs = false

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      expectWs = true
      continue
    }
    if (!part) continue

    const wordLow = part.replace(/[.,;:!?"""''()[\]]/g, '').toLowerCase()
    const hl = matchesLemma(wordLow, lemmaLow) || matchesLemma(wordLow, collocateLow)

    tokens.push({ w: part, ws: expectWs, hl })
    expectWs = false
  }

  return tokens
}

/**
 * Baut einen FTS5-MATCH-Ausdruck aus lemma + collocate.
 * FTS5 sucht case-insensitiv nach Wort-Tokens.
 */
function buildFtsQuery(lemma, collocate) {
  // Anführungszeichen escapen (FTS5-Syntax)
  const esc = s => s.replace(/"/g, '""')
  return `"${esc(lemma)}" "${esc(collocate)}"`
}

/**
 * Sucht bis zu `limit` Belegsätze für ein Kollokationspaar.
 *
 * @param {string} lemma     - Stichwort (z.B. "Tisch")
 * @param {string} collocate - Kollokator (z.B. "rund")
 * @param {object} opts      - { limit, year }
 * @returns {Array} - [{tokens, quelle}] im DWDS-kompatiblen Format
 */
// Fisher-Yates-Shuffle für zufällige Auswahl aus Top-N-Pool
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function fetchBelege(lemma, collocate, { limit = 5, year = null } = {}) {
  const database = db()
  if (!database) return []

  // Top-15 nach Relevanz holen, dann zufällig limit davon ziehen
  const pool = limit * 3

  try {
    const ftsQuery = buildFtsQuery(lemma, collocate)

    let rows
    // Mit Jahres-Filter zuerst versuchen, dann ohne
    if (year) {
      const y = parseInt(year)
      rows = database.prepare(`
        SELECT satz, quelle, zitation, jahr
        FROM belege
        WHERE belege MATCH ?
          AND jahr >= ? AND jahr <= ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, y - 15, y + 15, pool)

      // Zu wenige Treffer → ohne Jahres-Filter
      if (rows.length < 2) {
        rows = database.prepare(`
          SELECT satz, quelle, zitation, jahr
          FROM belege
          WHERE belege MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, pool)
      }
    } else {
      rows = database.prepare(`
        SELECT satz, quelle, zitation, jahr
        FROM belege
        WHERE belege MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, pool)
    }

    // Deduplizieren (gleicher Satz aus verschiedenen Quellen)
    const seen = new Set()
    const unique = rows.filter(r => {
      const key = r.satz.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Zufällig limit Belege aus dem Relevanz-Pool wählen
    return shuffle(unique).slice(0, limit).map(r => ({
      tokens: tokenize(r.satz, lemma, collocate),
      // Vollständige Zitation aus build_belege.py (QUELLEN_META), z.B.:
      // "Barbaresi, A. (2019). German Political Speeches Corpus … · CC BY-SA"
      // Optional mit Jahr wenn vorhanden
      quelle: r.jahr
        ? `${r.zitation} · ${r.jahr}`
        : r.zitation,
    }))
  } catch (err) {
    logger.warn({ err }, `Belege-Suche fehlgeschlagen: ${lemma}+${collocate}`)
    return []
  }
}

/**
 * Gibt rohe Belegsätze zurück (ohne Tokenisierung) – für Lückenfüller-Vorverarbeitung.
 * Gibt Sätze in Relevanz-Reihenfolge ohne Shuffle zurück, damit der Aufrufer
 * iterativ das erste blankbare Exemplar finden kann.
 */
export function fetchBelegeRaw(lemma, collocate, { limit = 20 } = {}) {
  const database = db()
  if (!database) return []

  try {
    const ftsQuery = buildFtsQuery(lemma, collocate)
    const rows = database.prepare(`
      SELECT satz, zitation, jahr
      FROM belege
      WHERE belege MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit)

    const seen = new Set()
    return rows
      .filter(r => {
        const key = r.satz.trim().toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(r => ({
        satz: r.satz,
        quelle: r.jahr ? `${r.zitation} · ${r.jahr}` : r.zitation,
      }))
  } catch (err) {
    logger.warn({ err }, `fetchBelegeRaw fehlgeschlagen: ${lemma}+${collocate}`)
    return []
  }
}

/** Gibt true zurück wenn die Belege-DB vorhanden und lesbar ist. */
export function belegeVerfuegbar() {
  return db() !== null
}
