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

let _db = null
function db() {
  if (!_db) {
    try {
      _db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      logger.info(`Belege-DB geladen: ${DB_PATH}`)
    } catch (err) {
      logger.warn({ err }, `Belege-DB nicht verfügbar: ${DB_PATH}`)
      return null
    }
  }
  return _db
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

    // Wortanfang vergleichen (deckt Flexionsformen ab: "Tisch" → "Tisches")
    const wordLow = part.replace(/[.,;:!?"""''()[\]]/g, '').toLowerCase()
    const hl = wordLow.startsWith(lemmaLow) || wordLow.startsWith(collocateLow)

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
export function fetchBelege(lemma, collocate, { limit = 5, year = null } = {}) {
  const database = db()
  if (!database) return []

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
      `).all(ftsQuery, y - 15, y + 15, limit * 2)

      // Zu wenige Treffer → ohne Jahres-Filter
      if (rows.length < 2) {
        rows = database.prepare(`
          SELECT satz, quelle, zitation, jahr
          FROM belege
          WHERE belege MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, limit * 2)
      }
    } else {
      rows = database.prepare(`
        SELECT satz, quelle, zitation, jahr
        FROM belege
        WHERE belege MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit * 2)
    }

    // Deduplizieren (gleicher Satz aus verschiedenen Quellen)
    const seen = new Set()
    const unique = rows.filter(r => {
      const key = r.satz.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return unique.slice(0, limit).map(r => ({
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

/** Gibt true zurück wenn die Belege-DB vorhanden und lesbar ist. */
export function belegeVerfuegbar() {
  return db() !== null
}
