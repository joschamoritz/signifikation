/**
 * wortprofil.js – Lokaler Ersatz für dwds.js
 *
 * Drop-in-Ersatz für alle Funktionen aus dwds.js:
 *   fetchRelation, fetchLemma, fetchBonusQuestion, toId, POS_ROUNDS
 *
 * Liest aus einer lokalen SQLite-Datei (wortprofil.db), die von
 * build_wortprofil.py erzeugt wurde.
 *
 * DB-Pfad: Umgebungsvariable WORTPROFIL_DB, sonst Fallback:
 *   - Lokal:    D:\Schule\Kollokade\wortprofil\05_db\wortprofil.db
 *   - Railway:  /data/wortprofil.db  (Railway Persistent Volume)
 *
 * ── Online-Deployment ────────────────────────────────────────────────────────
 * Option A – Railway Persistent Volume (empfohlen):
 *   1. Railway Volume unter /data mounten
 *   2. wortprofil.db per Railway CLI hochladen: railway volume cp wortprofil.db /data/
 *   3. WORTPROFIL_DB=/data/wortprofil.db als Railway-Env-Variable setzen
 *
 * Option B – Turso (SQLite-Hosting, free tier 500 MB):
 *   1. npm install @libsql/client
 *   2. DB zu Turso hochladen: turso db create wortprofil --from-file wortprofil.db
 *   3. better-sqlite3-Calls durch @libsql/client ersetzen (async statt sync)
 *   4. WORTPROFIL_DB=libsql://wortprofil-xxx.turso.io als Env-Variable setzen
 * ────────────────────────────────────────────────────────────────────────────
 */

import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// DB-Pfad: Env-Variable hat Vorrang
const DB_PATH = process.env.WORTPROFIL_DB
  ?? resolve(__dirname, '..', 'wortprofil', '05_db', 'wortprofil.db')

let _db = null
function db() {
  if (!_db) {
    try {
      _db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      _db.pragma('cache_size = -65536')    // 64 MB Page-Cache
      _db.pragma('mmap_size = 536870912')  // 512 MB Memory-mapped I/O
      _db.pragma('temp_store = MEMORY')
      logger.info(`Wortprofil-DB geladen: ${DB_PATH}`)
    } catch (err) {
      logger.error({ err }, `Wortprofil-DB nicht gefunden: ${DB_PATH}`)
      throw new Error(`Wortprofil-DB nicht gefunden: ${DB_PATH}`)
    }
  }
  return _db
}

// ── RelCode-Mapping (DWDS → eigene DB) ───────────────────────────────────────
// DWDS kombiniert OBJA+OBJD zu OBJ, wir haben sie getrennt.
const REL_ALIAS = {
  'OBJ':    'OBJA',
  '~OBJ':   '~OBJA',
}
function normalizeRel(relCode) {
  return REL_ALIAS[relCode] ?? relCode
}

// ── Rundenstruktur (identisch mit dwds.js – gleiche Keys/Labels) ─────────────
export const POS_ROUNDS = {
  Substantiv: [
    { key: 'nomen',     relCode: 'KON',    label: 'Nomen',     desc: 'ist koordiniert mit' },
    { key: 'verben',    relCode: '~OBJ',   label: 'Verben',    desc: 'ist Objekt von' },
    { key: 'adjektive', relCode: 'ATTR',   label: 'Adjektive', desc: 'hat Adjektivattribut' },
  ],
  Verb: [
    { key: 'objekte',   relCode: 'OBJ',    label: 'Objekte',   desc: 'hat als Objekt' },
    { key: 'verben',    relCode: 'KON',    label: 'Verben',    desc: 'ist koordiniert mit' },
    { key: 'adverbien', relCode: 'ADV',    label: 'Adverbien', desc: 'wird begleitet durch' },
  ],
  Adjektiv: [
    { key: 'nomen',     relCode: '~ATTR',  label: 'Nomen',     desc: 'ist Attribut bei' },
    { key: 'verben',    relCode: '~ADV',   label: 'Verben',    desc: 'ist Adverbialbestimmung von' },
    { key: 'adjektive', relCode: 'KON',    label: 'Adjektive', desc: 'ist koordiniert mit' },
  ],
}

// Bonuskandidaten je Wortart
const POS_BONUS = {
  Substantiv: [
    { relCode: 'PRED',   label: 'Prädikativ',      question: lemma => `Welches Adjektiv kann „${lemma}" prädikativ beschreiben?` },
    { relCode: 'GMOD',   label: 'Genitivattribut', question: lemma => `Welches Wort steht häufig mit „${lemma}" im Genitiv?` },
    { relCode: '~GMOD',  label: 'Genitivattribut', question: lemma => `Von welchem Nomen ist „${lemma}" oft ein Genitivattribut?` },
    { relCode: '~SUBJA', label: 'Subjekt-Verb',    question: lemma => `Welches Verb verbindet sich mit „${lemma}" als Subjekt?` },
  ],
  Verb: [
    { relCode: 'SUBJA', label: 'Subjekt',            question: lemma => `Welches Wort steht typisch als Subjekt von „${lemma}"?` },
    { relCode: 'PP',    label: 'Präpositionalgruppe', question: lemma => `Welche Präpositionalgruppe passt zu „${lemma}"?` },
  ],
  Adjektiv: [
    { relCode: 'ADV',   label: 'Adverbialbestimmung', question: lemma => `Welches Adverb modifiziert „${lemma}"?` },
  ],
}

// ── Interne Hilfs-Funktionen ─────────────────────────────────────────────────

const stmtCache = new Map()
function stmt(sql) {
  if (!stmtCache.has(sql)) stmtCache.set(sql, db().prepare(sql))
  return stmtCache.get(sql)
}

function queryRelation(lemma, pos, relCode, limit = 20, minFreq = 5, minDice = 0) {
  const rel = normalizeRel(relCode)
  const rows = stmt(`
    SELECT form, dep_lemma, dep_pos, frequency, logDice, relation_full, relation_description
    FROM collocations
    WHERE lemma = ? AND pos = ? AND relation = ?
      AND frequency >= ? AND logDice >= ?
    ORDER BY logDice DESC
    LIMIT ?
  `).all(lemma.toLowerCase(), pos, rel, minFreq, minDice, limit)

  return rows.map(r => ({
    form:                 r.form,
    lemma:                r.dep_pos === 'Substantiv'
                            ? r.dep_lemma.charAt(0).toUpperCase() + r.dep_lemma.slice(1)
                            : r.dep_lemma,
    frequency:            r.frequency,
    logDice:              String(r.logDice.toFixed(4)),
    pos:                  r.dep_pos,
    relation:             r.relation_full,
    relation_description: r.relation_description,
    concord_id:           null,
    has_concord:          false,
    has_mwe:              false,
  }))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildOptions(items) {
  const top3        = items.slice(0, 3)
  const distractors = shuffle(items.slice(3)).slice(0, 7)
  return [...top3, ...distractors].map((item, i) => ({
    wort:     item.lemma,
    log_dice: parseFloat(parseFloat(item.logDice).toFixed(1)),
    rang:     i + 1,
  }))
}

// ── Öffentliche API (identisch mit dwds.js) ──────────────────────────────────

export function toId(word) {
  return word.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Einzelne Relation abrufen – Äquivalent zu dwds.js fetchRelation().
 * Gibt ein Promise zurück (gleiche Schnittstelle wie die async-Version in dwds.js).
 */
export async function fetchRelation(lemma, pos, relCode) {
  try {
    const data = queryRelation(lemma, pos, relCode)
    if (!Array.isArray(data)) throw new Error(`Unerwartetes Format für ${relCode}`)
    return data
  } catch (err) {
    throw new Error(`Wortprofil-DB-Fehler für ${relCode}: ${err.message}`)
  }
}

/**
 * Alle Runden eines Lemmas abrufen – Äquivalent zu dwds.js fetchLemma().
 */
export async function fetchLemma(lemma, pos = 'Substantiv') {
  const rounds  = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  const results = await Promise.allSettled(
    rounds.map(round => fetchRelation(lemma, pos, round.relCode))
  )
  const runden = {}
  for (let i = 0; i < rounds.length; i++) {
    const r = results[i]
    runden[rounds[i].key] = r.status === 'fulfilled' ? buildOptions(r.value) : []
    if (r.status === 'rejected')
      logger.warn({ err: r.reason }, `fetchLemma: Relation ${rounds[i].relCode} fehlgeschlagen`)
  }
  return {
    id:         toId(lemma),
    lemma,
    pos,
    wortart:    pos,
    rundenInfo: rounds.map(({ key, label, relCode, desc }) => ({ key, label, relCode, desc })),
    runden,
  }
}

// ── POS-Rang für Zeitreise (Substantiv/Adjektiv bevorzugt) ───────────────────
const ZR_POS_RANK = { 'Substantiv': 0, 'Adjektiv': 0, 'Adverb': 1 }

function zrBestCollokat(items, lemmaLower, lemmaStamm, usedWords) {
  return items
    .filter(it => {
      const w = it.wort.toLowerCase()
      return w !== lemmaLower && !w.startsWith(lemmaStamm) &&
             !it.wort.includes(' ') && !it.wort.endsWith('-') &&
             it.wort.length > 2 && !usedWords.has(w)
    })
    .sort((a, b) => {
      const ra = ZR_POS_RANK[a.pos] ?? 2
      const rb = ZR_POS_RANK[b.pos] ?? 2
      if (ra !== rb) return ra - rb
      return b.score - a.score
    })[0] ?? null
}

/**
 * Zeitreise-Daten aus zeitreise-Tabelle abrufen.
 * Äquivalent zu diacollo.js fetchZeitreise() – gleiches Rückgabeformat.
 * Gibt null zurück wenn nicht genügend Dekaden vorhanden.
 */
export async function fetchZeitreise(lemma) {
  try {
    const rows = stmt(`
      SELECT dep_lemma, dep_pos, jahrzehnt, score
      FROM zeitreise
      WHERE lemma = ?
      ORDER BY jahrzehnt ASC, score DESC
    `).all(lemma.toLowerCase())

    if (!rows.length) return null

    const lemmaLower = lemma.toLowerCase()
    const lemmaStamm = lemmaLower.slice(0, 4)

    // Nach Jahrzehnt gruppieren
    const byDecade = new Map()
    for (const r of rows) {
      if (!byDecade.has(r.jahrzehnt)) byDecade.set(r.jahrzehnt, [])
      byDecade.get(r.jahrzehnt).push({ wort: r.dep_lemma, pos: r.dep_pos, score: r.score })
    }

    // Nur Dekaden mit mind. 3 gültigen Kollokatoren
    const decades = [...byDecade.entries()]
      .filter(([, items]) =>
        items.filter(it => {
          const w = it.wort.toLowerCase()
          return w !== lemmaLower && !w.startsWith(lemmaStamm) && it.wort.length > 2
        }).length >= 3
      )
      .sort(([a], [b]) => a - b)

    if (decades.length < 5) return null

    // perioden: alle Dekaden mit bestem Kollokator (für Visualisierung)
    const perioden = []
    for (const [jahrzehnt, items] of decades) {
      const best = zrBestCollokat(items, lemmaLower, lemmaStamm, new Set())
      if (best) perioden.push({ jahrzehnt: String(jahrzehnt), kollokat: best.wort, korpus: 'wortprofil', score: best.score })
    }

    // paare: 5 Quintile (gleichmäßig verteilt, kein Wort-Overlap)
    const n = decades.length
    const paare = []
    const usedWords = new Set()
    for (let i = 0; i < 5; i++) {
      const from = Math.round(i * (n - 1) / 4)
      const to   = i < 4 ? Math.round((i + 1) * (n - 1) / 4) - 1 : n - 1
      let best = null, bestScore = -Infinity, bestDecade = null
      for (let j = from; j <= to; j++) {
        const [jahrzehnt, items] = decades[j]
        const c = zrBestCollokat(items, lemmaLower, lemmaStamm, usedWords)
        if (c && c.score > bestScore) {
          best = c; bestScore = c.score; bestDecade = jahrzehnt
        }
      }
      if (!best) {
        logger.warn(`fetchZeitreise: Kein Kollokator für Quintil ${i + 1} [${lemma}]`)
        return null
      }
      usedWords.add(best.wort.toLowerCase())
      paare.push({ jahrzehnt: String(bestDecade), kollokat: best.wort, korpus: 'wortprofil', score: best.score })
    }

    return { lemma, paare, perioden }
  } catch {
    return null
  }
}

/**
 * Bonusfrage abrufen – Äquivalent zu dwds.js fetchBonusQuestion().
 */
export async function fetchBonusQuestion(lemma, pos = 'Substantiv') {
  const candidates = shuffle([...(POS_BONUS[pos] ?? POS_BONUS.Substantiv)])
  for (const { relCode, label, question } of candidates) {
    try {
      const raw   = await fetchRelation(lemma, pos, relCode)
      const items = raw.filter(i => !i.lemma.includes(' '))
      if (items.length < 5) continue
      const correct     = items[0]
      const distractors = shuffle(items.slice(3, 10)).slice(0, 2)
      if (distractors.length < 2) continue
      return {
        correct: correct.lemma,
        options: shuffle([correct.lemma, ...distractors.map(d => d.lemma)]),
        label,
        question: question(lemma),
      }
    } catch { continue }
  }
  return null
}
