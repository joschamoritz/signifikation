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
import { dirname, resolve } from 'path'
import logger from './logger.js'
import { getCachedQuery } from './query-cache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// DB-Pfad: Env-Variable hat Vorrang
const DB_PATH = process.env.WORTPROFIL_DB
  ?? resolve(__dirname, '..', 'wortprofil', '05_db', 'wortprofil.db')

// Einzelne readonly-Connection statt SQLitePool (Review 2026-06-10): better-
// sqlite3 ist synchron und Node single-threaded — acquire/release liefen
// strikt geschachtelt, es gab nie zwei gleichzeitig aktive Connections.
// Der Pool brachte null Parallelität, kostete aber 4 × 64 MB Page-Cache.
let _db = null
function db() {
  if (!_db) {
    try {
      _db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      _db.pragma('cache_size = -65536')    // 64 MB
      _db.pragma('mmap_size = 536870912')  // 512 MB
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
    { key: 'nomen',     relCode: '~ATTR',   label: 'Nomen',    desc: 'ist Attribut bei' },
    { key: 'verben',    relCode: 'PRED_REV', label: 'Verben',   desc: 'wird prädikativ verwendet mit' },
    { key: 'adjektive', relCode: 'KON',     label: 'Adjektive', desc: 'ist koordiniert mit' },
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

/** Normalisiert ein Ausgabe-Lemma: Substantive werden großgeschrieben. */
function normalizeLemma(lemma, pos) {
  if (pos === 'Substantiv' && lemma.length > 0)
    return lemma.charAt(0).toUpperCase() + lemma.slice(1)
  return lemma
}

const VALID_POS     = new Set(['Substantiv', 'Verb', 'Adjektiv', 'Adverb'])
const VALID_RELCODE = new Set([
  'SUBJA', 'OBJA', 'OBJD', 'ATTR', 'GMOD', 'KON', 'ADV', 'PRED', 'PP',
  '~SUBJA', '~OBJA', '~OBJD', '~ATTR', '~GMOD', '~ADV',
  'PRED_REV', // Pseudo-RelCode: Rückwärtssuche über PRED (dep_lemma = adjektiv)
])

// Prepared Statements einmalig nach DB-Init — better-sqlite3 cached
// prepare() NICHT intern, jeder Aufruf kompilierte das SQL neu
// (Review 2026-06-10; der frühere Kommentar hier behauptete das Gegenteil).
let _stmts = null
function stmts() {
  if (!_stmts) {
    const database = db()
    _stmts = {
      relation: database.prepare(`
        SELECT form, dep_lemma, dep_pos, frequency, logDice, relation_full, relation_description
        FROM collocations
        WHERE lemma = ? AND pos = ? AND relation = ?
          AND frequency >= ? AND logDice >= ?
        ORDER BY logDice DESC
        LIMIT ?
      `),
      relationReverse: database.prepare(`
        SELECT lemma AS dep_lemma, pos AS dep_pos, frequency, logDice
        FROM collocations
        WHERE dep_lemma = ? AND dep_pos = ? AND relation = ?
          AND frequency >= ? AND logDice >= ?
        ORDER BY logDice DESC
        LIMIT ?
      `),
      zeitreise: database.prepare(`
        SELECT dep_lemma, dep_pos, jahrzehnt, score
        FROM zeitreise
        WHERE lemma = ?
          AND jahrzehnt >= ?
        ORDER BY dep_lemma
      `),
      lemmaExists: database.prepare('SELECT 1 FROM collocations WHERE lemma = ? LIMIT 1'),
    }
  }
  return _stmts
}

function queryRelationRaw(lemma, pos, rel, limit, minFreq, minDice) {
  return stmts().relation.all(lemma.toLowerCase(), pos, rel, minFreq, minDice, limit)
}

function queryRelation(lemma, pos, relCode, limit = 30, minFreq = 5, minDice = 0) {
  if (!VALID_POS.has(pos)) {
    logger.warn({ lemma, pos, relCode }, 'queryRelation: unbekannte POS')
    return []
  }
  const rel = normalizeRel(relCode)
  if (!VALID_RELCODE.has(rel)) {
    logger.warn({ lemma, pos, relCode: rel }, 'queryRelation: unbekannter RelCode')
    return []
  }

  let rows = queryRelationRaw(lemma, pos, rel, limit, minFreq, minDice)

  // Adaptiver Fallback: minFreq schrittweise senken wenn zu wenig Treffer
  if (rows.length < 10 && minFreq > 1) {
    rows = queryRelationRaw(lemma, pos, rel, limit, 2, minDice)
    if (rows.length < 10) {
      rows = queryRelationRaw(lemma, pos, rel, limit, 1, minDice)
    }
    if (rows.length > 0)
      logger.debug({ lemma, pos, relCode: rel, count: rows.length }, 'queryRelation: minFreq-Fallback aktiv')
  }

  return rows.map(r => ({
    form:                 r.form,
    lemma:                normalizeLemma(r.dep_lemma, r.dep_pos),
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

/**
 * Rückwärtsabfrage: Verben die `lemma` als prädikatives Adjektiv verwenden.
 * Nutzt den bestehenden Index auf (dep_lemma, relation, lemma).
 * Ersetzt ~ADV für Adjektive, da PRED in build_wortprofil.py nicht invertiert wird.
 */
function queryRelationReverse(lemma, depPos, rel, limit = 30, minFreq = 5, minDice = 0) {
  let rows = stmts().relationReverse.all(lemma.toLowerCase(), depPos, rel, minFreq, minDice, limit)

  // Adaptiver Fallback
  if (rows.length < 10 && minFreq > 1) {
    rows = stmts().relationReverse.all(lemma.toLowerCase(), depPos, rel, 1, minDice, limit)
  }

  return rows.map(r => ({
    form:                 r.dep_lemma,
    lemma:                normalizeLemma(r.dep_lemma, r.dep_pos),
    frequency:            r.frequency,
    logDice:              String(r.logDice.toFixed(4)),
    pos:                  r.dep_pos,
    relation:             rel,
    relation_description: 'prädikativ verwendet mit',
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
  const top3 = items.slice(0, 3)
  // 4 zufällige Distraktoren aus Platz 4–12 (starke Kollokate, schwer zu unterscheiden)
  const nearPool = shuffle(items.slice(3, 12))
  // 3 zufällige Distraktoren aus Platz 13–25 (mittlere, etwas leichter erkennbar)
  const midPool  = shuffle(items.slice(12, 25))

  const nearCount = Math.min(4, nearPool.length)
  const midCount  = Math.min(3, midPool.length)
  // Fallback: fehlende Distraktoren aus dem jeweils anderen Pool auffüllen
  const remaining = 7 - nearCount - midCount
  const extra     = remaining > 0
    ? shuffle([...nearPool.slice(nearCount), ...midPool.slice(midCount)]).slice(0, remaining)
    : []

  const distractors = [...nearPool.slice(0, nearCount), ...midPool.slice(0, midCount), ...extra]

  return [...top3, ...distractors].map((item, i) => ({
    wort:     item.lemma,
    log_dice: parseFloat(parseFloat(item.logDice).toFixed(1)),
    rang:     i + 1,
  }))
}

/**
 * Gemischte Runde: Alle Relationen zusammenführen, nach logDice deduplizieren und
 * die stärksten 3 Kollokate (über alle Wortarten) als Top-3 verwenden.
 * Gibt 10 Optionen zurück (Top-3 + 7 Distraktoren), genau wie buildOptions().
 */
function buildMixedRound(allItems) {
  // Deduplizieren nach lemma (lowercase), höchstes logDice gewinnt
  const seen = new Map()
  for (const item of allItems) {
    const key = item.lemma.toLowerCase()
    const existing = seen.get(key)
    if (!existing || parseFloat(item.logDice) > parseFloat(existing.logDice)) {
      seen.set(key, item)
    }
  }
  const sorted = [...seen.values()].sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))
  return buildOptions(sorted)
}

// ── Öffentliche API (identisch mit dwds.js) ──────────────────────────────────

function toId(word) {
  return word.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Einzelne Relation abrufen – Äquivalent zu dwds.js fetchRelation().
 * Gibt ein Promise zurück (gleiche Schnittstelle wie die async-Version in dwds.js).
 * Ergebnis wird 1h gecacht um DB-Load zu reduzieren.
 *
 * Sonderfall ~ADV + Adjektiv: Adjektive in adverbialer Verwendung werden vom Parser
 * manchmal als Adverb getaggt und landen in der DB unter pos='Adverb'. Deshalb
 * werden bei weniger als 10 Treffern beide POS-Varianten zusammengeführt.
 */
export async function fetchRelation(lemma, pos, relCode) {
  try {
    const cacheKey = `rel:${lemma}:${pos}:${relCode}`
    const data = getCachedQuery(cacheKey, () => {
      // PRED_REV: Verben für Adjektive – kombiniert zwei Quellen:
      // 1) ~ADV: Adjektiv als Adverbialbestimmung (z.B. „krank feiern")
      // 2) PRED rückwärts: Adjektiv als Prädikativ (z.B. „sein/werden/machen + krank")
      // PRED wurde in build_wortprofil.py nicht invertiert, daher Rückwärtsquery nötig.
      // Beide immer zusammenführen – mehr Quellen = vollständigere Ergebnisse.
      // PRED_REV: Verben für Adjektive – kombiniert drei Quellen:
      // 1) ~ADV als Adjektiv: adverbiale Verwendung, Parser-Tag = Adjektiv
      // 2) ~ADV als Adverb:   adverbiale Verwendung, Parser-Tag = Adverb (z.B. „krank feiern")
      // 3) PRED rückwärts:    prädikative Verwendung (z.B. „sein/werden/machen + krank")
      if (relCode === 'PRED_REV') {
        const adjAdvRows  = queryRelation(lemma, 'Adjektiv', '~ADV')
        const advAdvRows  = queryRelation(lemma, 'Adverb',   '~ADV')
        const predRows    = queryRelationReverse(lemma, 'Adjektiv', 'PRED')
        const seen        = new Set()
        const merged      = []
        for (const r of [...adjAdvRows, ...advAdvRows, ...predRows]) {
          const key = r.lemma.toLowerCase()
          if (!seen.has(key)) { seen.add(key); merged.push(r) }
        }
        return merged
          .sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))
          .slice(0, 30)
      }

      return queryRelation(lemma, pos, relCode)
    })
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
  const runden   = {}
  const allItems = []
  for (let i = 0; i < rounds.length; i++) {
    const r = results[i]
    runden[rounds[i].key] = r.status === 'fulfilled' ? buildOptions(r.value) : []
    if (r.status === 'fulfilled') allItems.push(...r.value)
    if (r.status === 'rejected')
      logger.warn({ err: r.reason }, `fetchLemma: Relation ${rounds[i].relCode} fehlgeschlagen`)
  }
  // Kollokationen-Runde: stärkste Kollokate über alle Wortarten
  runden.kollokatoren = buildMixedRound(allItems)
  return {
    id:         toId(lemma),
    lemma,
    pos,
    wortart:    pos,
    rundenInfo: rounds.map(({ key, label, relCode, desc }) => ({ key, label, relCode, desc })),
    runden,
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

// ── Zeitenwende-Konstanten ────────────────────────────────────────────────────
const ZW_MIN_JAHRZEHNT = 1950
const ZW_CUTOFF        = 2000
const ZW_MIN_LEN       = 5
const ZW_MAX_LEN       = 14
const ZW_MIN_SCORE     = 5
const ZW_WORD_REGEX    = /^[a-zäöüß][a-zA-ZäöüÄÖÜß]*$/

/**
 * Zeitenwende-Datenabruf: distinktive Kollokatoren vor/nach 2000.
 *
 * Wertet die zeitreise-Tabelle aus und ermittelt Wörter, die entweder typisch
 * für die Zeit vor 2000 oder typisch für die Zeit nach 2000 sind.
 * Gibt { lemma, words: [{wort, periode}] } mit 10 gemischten Einträgen zurück,
 * oder null wenn nicht genug distinkte Kollokatoren gefunden werden.
 */
export async function fetchZeitenwende(lemma) {
  try {
    const rows = stmts().zeitreise.all(lemma.toLowerCase(), ZW_MIN_JAHRZEHNT)

    if (!rows.length) return null

    const lemmaLower = lemma.toLowerCase()
    const lemmaStamm = lemmaLower.slice(0, 4)

    // Scores nach dep_lemma gruppieren und pre/post trennen
    const wordMap = new Map()
    for (const r of rows) {
      const key = r.dep_lemma.toLowerCase()
      if (!wordMap.has(key)) wordMap.set(key, { dep_lemma: r.dep_lemma, dep_pos: r.dep_pos, pre: [], post: [] })
      const bucket = r.jahrzehnt < ZW_CUTOFF ? 'pre' : 'post'
      wordMap.get(key)[bucket].push(r.score)
    }

    // Für jedes Wort Distinktivitätsscore berechnen
    const candidates = []
    for (const [key, data] of wordMap) {
      const wort = normalizeLemma(data.dep_lemma, data.dep_pos)
      // Längen- und Regex-Filter
      if (wort.length < ZW_MIN_LEN || wort.length > ZW_MAX_LEN) continue
      if (!ZW_WORD_REGEX.test(data.dep_lemma)) continue
      // Nicht das Lemma selbst oder eng verwandte Formen
      if (key === lemmaLower || key.startsWith(lemmaStamm)) continue

      const avgPre  = data.pre.length  ? data.pre.reduce((a, b)  => a + b, 0) / data.pre.length  : 0
      const avgPost = data.post.length ? data.post.reduce((a, b) => a + b, 0) / data.post.length : 0

      // Mindestens eine Periode muss ausreichend stark sein
      if (avgPre < ZW_MIN_SCORE && avgPost < ZW_MIN_SCORE) continue

      candidates.push({ wort, avgPre, avgPost, distPre: avgPre - avgPost, distPost: avgPost - avgPre })
    }

    // Pre-Pool: charakteristisch für die Zeit vor 2000
    const prePool = candidates
      .filter(c => c.distPre > 0 && c.avgPre >= ZW_MIN_SCORE)
      .sort((a, b) => b.distPre - a.distPre)

    // Post-Pool: charakteristisch für die Zeit nach 2000
    const postPool = candidates
      .filter(c => c.distPost > 0 && c.avgPost >= ZW_MIN_SCORE)
      .sort((a, b) => b.distPost - a.distPost)

    // Überlappungen aus beiden Pools entfernen (Top-15 jeweils prüfen)
    const preSet  = new Set(prePool.slice(0, 15).map(c => c.wort))
    const postSet = new Set(postPool.slice(0, 15).map(c => c.wort))
    const overlap = new Set([...preSet].filter(w => postSet.has(w)))

    const preFinal  = prePool.filter(c => !overlap.has(c.wort)).slice(0, 5)
    const postFinal = postPool.filter(c => !overlap.has(c.wort)).slice(0, 5)

    if (preFinal.length < 5 || postFinal.length < 5) return null

    // Kombinieren und mischen
    const words = [
      ...preFinal.map(c  => ({ wort: c.wort,  periode: 'pre'  })),
      ...postFinal.map(c => ({ wort: c.wort,  periode: 'post' })),
    ]
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]]
    }

    return { lemma, words }
  } catch (err) {
    logger.warn({ err }, `fetchZeitenwende: Fehler bei „${lemma}"`)
    return null
  }
}

/**
 * Zeitenwende-Analyse für den Admin: zeigt pre/post-Kandidaten mit Scores.
 * Gibt { lemma, usable, preCandidates, postCandidates, words? } zurück.
 */
export async function fetchZeitenwendeAnalyze(lemma) {
  const rows = stmts().zeitreise.all(lemma.toLowerCase(), ZW_MIN_JAHRZEHNT)

  if (!rows.length) return null

  const lemmaLower = lemma.toLowerCase()
  const lemmaStamm = lemmaLower.slice(0, 4)

  const wordMap = new Map()
  for (const r of rows) {
    const key = r.dep_lemma.toLowerCase()
    if (!wordMap.has(key)) wordMap.set(key, { dep_lemma: r.dep_lemma, dep_pos: r.dep_pos, pre: [], post: [] })
    const bucket = r.jahrzehnt < ZW_CUTOFF ? 'pre' : 'post'
    wordMap.get(key)[bucket].push(r.score)
  }

  const allCandidates = []
  for (const [key, data] of wordMap) {
    const wort = normalizeLemma(data.dep_lemma, data.dep_pos)
    if (wort.length < ZW_MIN_LEN || wort.length > ZW_MAX_LEN) continue
    if (!ZW_WORD_REGEX.test(data.dep_lemma)) continue
    if (key === lemmaLower || key.startsWith(lemmaStamm)) continue

    const avgPre  = data.pre.length  ? data.pre.reduce((a, b)  => a + b, 0) / data.pre.length  : 0
    const avgPost = data.post.length ? data.post.reduce((a, b) => a + b, 0) / data.post.length : 0
    if (avgPre < ZW_MIN_SCORE && avgPost < ZW_MIN_SCORE) continue

    allCandidates.push({ wort, avgPre: +avgPre.toFixed(1), avgPost: +avgPost.toFixed(1),
      distPre: +(avgPre - avgPost).toFixed(1), distPost: +(avgPost - avgPre).toFixed(1) })
  }

  const preCandidates  = allCandidates.filter(c => c.distPre  > 0 && c.avgPre  >= ZW_MIN_SCORE).sort((a, b) => b.distPre  - a.distPre).slice(0, 10)
  const postCandidates = allCandidates.filter(c => c.distPost > 0 && c.avgPost >= ZW_MIN_SCORE).sort((a, b) => b.distPost - a.distPost).slice(0, 10)

  const result = await fetchZeitenwende(lemma)
  return { lemma, usable: !!result, preCandidates, postCandidates, words: result?.words ?? null }
}

/**
 * Prüft, ob ein Lemma mindestens einen Eintrag in wortprofil.db hat.
 * Nützlich für Admin-Validierung ohne den Kalender-Index zu benötigen.
 */
export function lemmaExistsInWortprofil(lemma) {
  try {
    const row = stmts().lemmaExists.get(lemma.toLowerCase())
    return !!row
  } catch {
    return false
  }
}
