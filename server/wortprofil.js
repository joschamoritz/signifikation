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
import { getCachedQuery, invalidateCachePattern } from './query-cache.js'
import { SQLitePool } from './db-pool.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// DB-Pfad: Env-Variable hat Vorrang
const DB_PATH = process.env.WORTPROFIL_DB
  ?? resolve(__dirname, '..', 'wortprofil', '05_db', 'wortprofil.db')

let _pool = null
function pool() {
  if (!_pool) {
    try {
      _pool = new SQLitePool(DB_PATH, { poolSize: 4, readonly: true })
      logger.info(`Wortprofil-DB Pool initialized: ${DB_PATH}`)
    } catch (err) {
      logger.error({ err }, `Wortprofil-DB nicht gefunden: ${DB_PATH}`)
      throw new Error(`Wortprofil-DB nicht gefunden: ${DB_PATH}`)
    }
  }
  return _pool
}

// Hilfsfunktion: mit Connection-Pool arbeiten
function withConnection(fn) {
  const { db, release } = pool().acquire()
  try {
    return fn(db)
  } finally {
    release()
  }
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

// Statement-Caching: better-sqlite3 cached prepare() intern pro Connection.
// Keine globale Cache nötig, da jede Connection ihre eigenen Statements cached.
function stmt(sql, db) {
  return db.prepare(sql)
}

function queryRelationRaw(lemma, pos, rel, limit, minFreq, minDice, db) {
  return stmt(`
    SELECT form, dep_lemma, dep_pos, frequency, logDice, relation_full, relation_description
    FROM collocations
    WHERE lemma = ? AND pos = ? AND relation = ?
      AND frequency >= ? AND logDice >= ?
    ORDER BY logDice DESC
    LIMIT ?
  `, db).all(lemma.toLowerCase(), pos, rel, minFreq, minDice, limit)
}

function queryRelation(lemma, pos, relCode, limit = 30, minFreq = 5, minDice = 0) {
  return withConnection(db => {
    if (!VALID_POS.has(pos)) {
      logger.warn({ lemma, pos, relCode }, 'queryRelation: unbekannte POS')
      return []
    }
    const rel = normalizeRel(relCode)
    if (!VALID_RELCODE.has(rel)) {
      logger.warn({ lemma, pos, relCode: rel }, 'queryRelation: unbekannter RelCode')
      return []
    }

    let rows = queryRelationRaw(lemma, pos, rel, limit, minFreq, minDice, db)

    // Adaptiver Fallback: minFreq schrittweise senken wenn zu wenig Treffer
    if (rows.length < 10 && minFreq > 1) {
      rows = queryRelationRaw(lemma, pos, rel, limit, 2, minDice, db)
      if (rows.length < 10) {
        rows = queryRelationRaw(lemma, pos, rel, limit, 1, minDice, db)
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
  })
}

/**
 * Rückwärtsabfrage: Verben die `lemma` als prädikatives Adjektiv verwenden.
 * Nutzt den bestehenden Index auf (dep_lemma, relation, lemma).
 * Ersetzt ~ADV für Adjektive, da PRED in build_wortprofil.py nicht invertiert wird.
 */
function queryRelationReverse(lemma, depPos, rel, limit = 30, minFreq = 5, minDice = 0) {
  return withConnection(db => {
    let rows = stmt(`
      SELECT lemma AS dep_lemma, pos AS dep_pos, frequency, logDice
      FROM collocations
      WHERE dep_lemma = ? AND dep_pos = ? AND relation = ?
        AND frequency >= ? AND logDice >= ?
      ORDER BY logDice DESC
      LIMIT ?
    `, db).all(lemma.toLowerCase(), depPos, rel, minFreq, minDice, limit)

    // Adaptiver Fallback
    if (rows.length < 10 && minFreq > 1) {
      rows = stmt(`
        SELECT lemma AS dep_lemma, pos AS dep_pos, frequency, logDice
        FROM collocations
        WHERE dep_lemma = ? AND dep_pos = ? AND relation = ?
          AND frequency >= ? AND logDice >= ?
        ORDER BY logDice DESC
        LIMIT ?
      `, db).all(lemma.toLowerCase(), depPos, rel, 1, minDice, limit)
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
  })
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

/**
 * Temporale Distinktivität: berechnet für jedes Wort, wie charakteristisch
 * es für eine bestimmte Dekade ist – im Vergleich zu seinem Durchschnitt über
 * alle Dekaden und skaliert durch die Anzahl der Dekaden, in denen es vorkommt.
 *
 * distinctScore = (score / avgScore) / sqrt(n_Dekaden)
 *
 * Hohe Werte → Wort ist typisch für diese Epoche, nicht global dominant.
 * Gibt eine Map zurück: `${dep_lemma}\t${dep_pos}` → { avgScore, n }
 */
function computeWordStats(rows) {
  const stats = new Map()
  for (const r of rows) {
    const key = `${r.dep_lemma}\t${r.dep_pos}`
    if (!stats.has(key)) stats.set(key, { totalScore: 0, n: 0 })
    const s = stats.get(key)
    s.totalScore += r.score
    s.n++
  }
  for (const s of stats.values()) s.avgScore = s.totalScore / s.n
  return stats
}

function calcDistinctScore(score, dep_lemma, dep_pos, wordStats) {
  const ws = wordStats.get(`${dep_lemma}\t${dep_pos}`)
  return ws ? (score / ws.avgScore) / Math.sqrt(ws.n) : score
}

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
      return (b.distinctScore ?? b.score) - (a.distinctScore ?? a.score)
    })[0] ?? null
}

/**
 * Zeitreise-Daten aus zeitreise-Tabelle abrufen.
 * Äquivalent zu diacollo.js fetchZeitreise() – gleiches Rückgabeformat.
 * Gibt null zurück wenn nicht genügend Dekaden vorhanden.
 */
export async function fetchZeitreise(lemma) {
  try {
    const rows = withConnection(db => stmt(`
      SELECT dep_lemma, dep_pos, jahrzehnt, score
      FROM zeitreise
      WHERE lemma = ?
      ORDER BY jahrzehnt ASC, score DESC
    `, db).all(lemma.toLowerCase()))

    if (!rows.length) return null

    const lemmaLower = lemma.toLowerCase()
    const lemmaStamm = lemmaLower.slice(0, 4)

    // Temporale Distinktivität: Wortstatistiken über alle Dekaden berechnen
    const wordStats = computeWordStats(rows)

    // Nach Jahrzehnt gruppieren
    const byDecade = new Map()
    for (const r of rows) {
      if (!byDecade.has(r.jahrzehnt)) byDecade.set(r.jahrzehnt, [])
      byDecade.get(r.jahrzehnt).push({
        wort: normalizeLemma(r.dep_lemma, r.dep_pos),
        pos: r.dep_pos,
        score: r.score,
        distinctScore: calcDistinctScore(r.score, r.dep_lemma, r.dep_pos, wordStats),
      })
    }

    // Nur Dekaden mit mind. 2 gültigen Kollokatoren
    const decades = [...byDecade.entries()]
      .filter(([, items]) =>
        items.filter(it => {
          const w = it.wort.toLowerCase()
          return w !== lemmaLower && !w.startsWith(lemmaStamm) && it.wort.length > 2
        }).length >= 2
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
        if (c && (c.distinctScore ?? c.score) > bestScore) {
          best = c; bestScore = c.distinctScore ?? c.score; bestDecade = jahrzehnt
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
  } catch (err) {
    logger.warn({ err, lemma }, 'fetchZeitreise: Fehler bei Datenbankabfrage')
    return null
  }
}

/**
 * Zeitreise-Analyse für den Admin: liefert Quintil-Paare + Top-4 Kollokatoren pro Dekade.
 * Gibt null zurück wenn fetchZeitreise null liefert (nicht genug Dekaden).
 */
export async function fetchZeitreiseAnalyze(lemma) {
  const lemmaLower = lemma.toLowerCase()
  const lemmaStamm = lemmaLower.slice(0, 4)

  // Alle Rows laden – unabhängig von Dekaden-Mindestanzahl
  const allRows = withConnection(db => stmt(`
    SELECT dep_lemma, dep_pos, jahrzehnt, score
    FROM zeitreise
    WHERE lemma = ?
    ORDER BY jahrzehnt ASC, score DESC
  `, db).all(lemmaLower))

  if (!allRows.length) return null

  // Temporale Distinktivität: Wortstatistiken über alle Dekaden berechnen
  const wordStats = computeWordStats(allRows)

  // Nach Jahrzehnt gruppieren, alle gültigen Kollokatoren sammeln
  const byDecadeAll = new Map()
  for (const r of allRows) {
    const w = normalizeLemma(r.dep_lemma, r.dep_pos).toLowerCase()
    if (w === lemmaLower || w.startsWith(lemmaStamm) || w.length <= 2) continue
    if (!byDecadeAll.has(r.jahrzehnt)) byDecadeAll.set(r.jahrzehnt, [])
    byDecadeAll.get(r.jahrzehnt).push({
      wort: normalizeLemma(r.dep_lemma, r.dep_pos),
      score: r.score,
      distinctScore: calcDistinctScore(r.score, r.dep_lemma, r.dep_pos, wordStats),
    })
  }

  // Top-4 nach temporaler Distinktivität sortieren
  const byDecade = new Map()
  for (const [jz, items] of byDecadeAll) {
    byDecade.set(jz, items.sort((a, b) => b.distinctScore - a.distinctScore).slice(0, 4))
  }

  if (!byDecade.size) return null

  // Quintil-Paare nur wenn >=5 gültige Dekaden vorhanden (gleiche Logik wie fetchZeitreise)
  const base = await fetchZeitreise(lemma)
  const quintilSet = base ? new Set(base.paare.map(p => String(p.jahrzehnt))) : new Set()

  const perioden = [...byDecade.entries()]
    .sort(([a], [b]) => a - b)
    .map(([jahrzehnt, top]) => ({
      jahrzehnt: String(jahrzehnt),
      top,
      quintil: quintilSet.has(String(jahrzehnt)),
    }))

  return { lemma, usable: !!base, paare: base?.paare ?? null, perioden }
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
    const rows = withConnection(db => stmt(`
      SELECT dep_lemma, dep_pos, jahrzehnt, score
      FROM zeitreise
      WHERE lemma = ?
        AND jahrzehnt >= ?
      ORDER BY dep_lemma
    `, db).all(lemma.toLowerCase(), ZW_MIN_JAHRZEHNT))

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
  const rows = withConnection(db => stmt(`
    SELECT dep_lemma, dep_pos, jahrzehnt, score
    FROM zeitreise
    WHERE lemma = ?
      AND jahrzehnt >= ?
    ORDER BY dep_lemma
  `, db).all(lemma.toLowerCase(), ZW_MIN_JAHRZEHNT))

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
