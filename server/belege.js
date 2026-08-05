/**
 * belege.js – Belegsatz-Suche aus eigenem CC-BY-SA-Korpus
 *
 * Ersetzt den DWDS-Aufruf in public.js /api/v1/belege.
 *
 * DB-Pfad: Umgebungsvariable BELEGE_DB, sonst lokaler Pfad.
 *
 * ── Zwei Schemata, ein Modul (Phase G, DB-Neuaufbau) ─────────────────────────
 * v1 (belege.db, bis 2026-08): eine flache FTS5-Tabelle `belege(satz, quelle,
 *    zitation, jahr)` — die volle Zitation redundant in jeder Zeile, nur
 *    Korpus-, keine Dokument-Ebene.
 * v2 (belege_v2.db, ab Phase F): FTS5 external content über `saetze`, plus
 *    normalisierte `dokumente` (dokumentgenaue `ref`, jahr, genre, epoche) und
 *    `quellen` (Korpus-Zitation + Lizenz). Anzeige:
 *    „Abel: Leibmedicus (1699) · Deutsches Textarchiv · CC BY-SA 4.0".
 *
 * Das Schema wird beim Öffnen erkannt (Tabelle `saetze` vorhanden?). Beide
 * Pfade liefern nach außen dieselbe Datenform. Grund für die Doppelspurigkeit:
 * Code-Deploy (GitHub Actions) und DB-Umschaltung (Env-Var + PM2-Restart) sind
 * zwei getrennte Schritte, und der Rollback ist ausdrücklich „Env zurück +
 * Restart" — beides funktioniert nur, wenn dieselbe Version beide DBs liest.
 *
 * ── Rückwärts-Varianten-Fallback (DB-Neuaufbau §3.5) ─────────────────────────
 * Phase E2 hat historische Schreibvarianten in wortprofil_v2 normalisiert
 * (`thier` → `tier`), die Belegtexte bleiben aber authentisch. Bis Phase F2 die
 * Lemma-Spalte der Belege nachzieht, würde die Kopplung wortprofil↔belege
 * brechen: das Spiel fragt nach `tier`, im Korpus steht `thier`. Deshalb liest
 * dieses Modul `lemma_corrections` aus der Wortprofil-DB rückwärts und ergänzt
 * die FTS-Query um die Varianten: Suche nach „tier" → ("tier" OR "thier").
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
let _schema = null   // 'v1' | 'v2' – nach dem ersten erfolgreichen Öffnen gesetzt
function db() {
  if (!_db) {
    try {
      _db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
      _db.pragma('cache_size = -131072')        // 128 MB Page-Cache
      _db.pragma(`mmap_size = ${MMAP_BYTES}`)   // konfigurierbar per BELEGE_MMAP_MB
      _db.pragma('temp_store = MEMORY')
      _schema = _db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'saetze'")
        .get() ? 'v2' : 'v1'
      logger.info(`Belege-DB geladen (Schema ${_schema}): ${DB_PATH}`)
    } catch (err) {
      logger.warn({ err }, `Belege-DB nicht verfügbar: ${DB_PATH}`)
      return null
    }
  }
  return _db
}

// Prepared Statements einmalig nach DB-Init — better-sqlite3 cached
// prepare() NICHT intern, jeder Aufruf kompiliert das SQL neu. Die drei
// Statements hier liegen auf dem Belege-Hotpath des Spiels (Review 2026-06-10).
//
// Beide Schemata liefern dieselben Spalten: satz, ref, jahr, zitation, lizenz
// (v1 kennt ref/lizenz nicht → NULL). formatQuelle() baut daraus den Anzeige-
// String. Die v2-Joins sind reine PK-/rowid-Lookups (EXPLAIN QUERY PLAN in
// Gate F geprüft), der Jahr-Filter läuft über dokumente.jahr.
const V2_SELECT = `
  SELECT s.satz AS satz, d.ref AS ref, d.jahr AS jahr,
         q.zitation AS zitation, q.lizenz AS lizenz
  FROM belege_fts
  JOIN saetze s    ON s.id     = belege_fts.rowid
  JOIN dokumente d ON d.doc_id = s.doc_id
  JOIN quellen q   ON q.quelle = d.quelle
  WHERE belege_fts MATCH ?`

const V1_SELECT = `
  SELECT satz, NULL AS ref, jahr, zitation, NULL AS lizenz
  FROM belege
  WHERE belege MATCH ?`

let _stmts = null
function stmts() {
  const database = db()
  if (!database) return null
  if (!_stmts) {
    const base = _schema === 'v2' ? V2_SELECT : V1_SELECT
    const jahrFilter = _schema === 'v2' ? 'd.jahr' : 'jahr'
    _stmts = {
      topByYear: database.prepare(
        `${base} AND ${jahrFilter} >= ? AND ${jahrFilter} <= ? ORDER BY rank LIMIT ?`),
      top: database.prepare(`${base} ORDER BY rank LIMIT ?`),
      // raw teilt sich das Statement mit top – die Spalten sind identisch,
      // fetchBelegeRaw ignoriert die nicht gebrauchten schlicht.
      raw: database.prepare(`${base} ORDER BY rank LIMIT ?`),
    }
  }
  return _stmts
}

/**
 * Baut den Anzeige-String einer Fundstelle.
 *
 * v2: „ref (Jahr) · Korpus-Zitation · Lizenz" — Dokument, Korpus und Lizenz
 *     getrennt (DB-Neuaufbau §3.4). Das Jahr wird nur angehängt, wenn es nicht
 *     ohnehin schon in der ref steht („BT-PlPr. 07/143, 23.01.1975",
 *     „Leipzig (deu_news) 2016") – sonst stünde es doppelt.
 * v1: „Zitation · Jahr" wie bisher (die Lizenz steckt dort im Zitations-String).
 */
function formatQuelle(r) {
  if (!r.ref) return r.jahr ? `${r.zitation} · ${r.jahr}` : r.zitation
  const dok = r.jahr && !String(r.ref).includes(String(r.jahr))
    ? `${r.ref} (${r.jahr})`
    : r.ref
  return [dok, r.zitation, r.lizenz].filter(Boolean).join(' · ')
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
 *
 * Die Hervorhebung kennt dieselben historischen Schreibvarianten wie die Suche
 * (§3.5). Sonst fände die FTS-Query zwar einen Satz über „Critik", die Anzeige
 * markierte darin aber nichts — mit der Folge, dass die KWiC-Zerlegung im Archiv
 * leer ausfällt und im Spiel das gesuchte Wort unmarkiert bliebe.
 */
function tokenize(sentence, lemma, collocate) {
  const formen = [...suchformen(lemma), ...suchformen(collocate)]

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
    const hl = formen.some(f => matchesLemma(wordLow, f))

    tokens.push({ w: part, ws: expectWs, hl })
    expectWs = false
  }

  return tokens
}

// ── Rückwärts-Varianten aus lemma_corrections (§3.5) ─────────────────────────
// Map: modernes Lemma → historische Schreibvarianten, die im Korpustext stehen
// („tier" → ["thier"]). Wird einmal lazy aus der Wortprofil-DB gelesen (11.005
// freigegebene Zeilen, ~10 ms) und danach im Speicher gehalten; die Verbindung
// wird sofort wieder geschlossen. Fehlt die Tabelle (alte wortprofil.db) oder
// die DB selbst, bleibt die Map leer → Verhalten exakt wie vorher.
let _varianten = null
function varianten() {
  if (_varianten) return _varianten
  _varianten = new Map()
  const wortprofilPath = process.env.WORTPROFIL_DB
    ?? resolve(__dirname, '..', 'wortprofil', '05_db', 'wortprofil.db')
  let wdb = null
  try {
    wdb = new Database(wortprofilPath, { readonly: true, fileMustExist: true })
    const rows = wdb
      .prepare('SELECT alt, korrekt FROM lemma_corrections WHERE freigegeben = 1')
      .all()
    for (const { alt, korrekt } of rows) {
      const key = String(korrekt).toLowerCase()
      const list = _varianten.get(key)
      if (list) { if (!list.includes(alt)) list.push(alt) }
      else _varianten.set(key, [alt])
    }
    logger.info(`Belege: ${_varianten.size} Lemmata mit historischen Schreibvarianten geladen`)
  } catch (err) {
    logger.info({ err: err.message }, 'Belege: kein lemma_corrections-Mapping – Variantensuche inaktiv')
  } finally {
    try { wdb?.close() } catch { /* egal */ }
  }
  return _varianten
}

const escFts = s => String(s).replace(/"/g, '""')

/**
 * Alle Formen, unter denen ein Wort im Korpustext stehen kann: das Wort selbst
 * plus seine historischen Schreibvarianten aus lemma_corrections, alle klein.
 * Ohne Mapping (v1-DB) bleibt es bei genau einer Form – Verhalten wie vorher.
 */
function suchformen(word) {
  const low = String(word ?? '').toLowerCase()
  if (!low) return []
  const alts = varianten().get(low)
  return alts ? [low, ...alts.map(a => a.toLowerCase())] : [low]
}

/**
 * Baut den FTS5-Ausdruck für EIN Suchwort, wahlweise mit den historischen
 * Schreibvarianten: „tier" → ("tier" OR "thier").
 *
 * Die Formen werden immer als Phrase gequotet – auch im Prefix-Fall. Ein nacktes
 * `e-mail*` wäre ein FTS5-Syntaxfehler; `"e-mail"*` ist ein gültiges Phrasen-
 * Präfix. Seit F7 (Bindestrich-Lemmata zugelassen) ist das kein Randfall mehr.
 */
function ftsTerm(word, { prefix = false, mitVarianten = false } = {}) {
  const low = String(word ?? '').toLowerCase()
  if (!low) return '""'
  const formen = mitVarianten ? suchformen(word) : [low]
  const teile = formen.map(f => (prefix ? `"${escFts(f)}"*` : `"${escFts(f)}"`))
  return teile.length === 1 ? teile[0] : `(${teile.join(' OR ')})`
}

/**
 * Baut einen FTS5-MATCH-Ausdruck aus lemma + collocate.
 * FTS5 sucht case-insensitiv nach Wort-Tokens.
 */
function buildFtsQuery(lemma, collocate, opts = {}) {
  return `${ftsTerm(lemma, opts)} AND ${ftsTerm(collocate, opts)}`
}

/**
 * FTS5-Query mit Prefix-Matching für den Kollokator.
 * Findet auch flektierte Formen: spannend* → spannende/spannenden/spannendem.
 * Wird für den Lückenfüller-Modus verwendet, wo blankCollocate+startsWith
 * die gefundenen Formen zuverlässig dem Lemma zuordnet.
 *
 * Mindestlänge 4 Zeichen, damit kurze Wörter nicht zu viele False Positives erzeugen.
 */
function buildFtsQueryPrefix(lemma, collocate, opts = {}) {
  return `${ftsTerm(lemma, opts)} AND ${ftsTerm(collocate, { ...opts, prefix: String(collocate).length >= 4 })}`
}

// Ab wie vielen Treffern die moderne Schreibung allein als ausreichend gilt.
const MIN_TREFFER_OHNE_VARIANTEN = 2

/**
 * Führt eine FTS-Suche ZWEISTUFIG aus: zuerst nur mit der modernen Schreibung,
 * und erst wenn die (fast) nichts findet, ein zweites Mal mit den historischen
 * Varianten aus lemma_corrections.
 *
 * Warum nicht beides in einem `OR`-Ausdruck: FTS5 rankt nach BM25, und BM25
 * gewichtet seltene Terme höher. `("wasser" OR "waßer")` liefert deshalb fast
 * ausschließlich die historische Schreibung, obwohl „Wasser" millionenfach
 * modern belegt ist — im Archiv standen dadurch fünf von fünf Belegen in
 * Schreibung des 19. Jahrhunderts. Der Variantenzweig ist ein Auffangnetz für
 * die wortprofil↔belege-Kopplung im Fenster bis Phase F2 (§3.5), kein
 * gleichberechtigter Suchbegriff.
 *
 * @param {(mitVarianten: boolean) => string} bauQuery  erzeugt den MATCH-Ausdruck
 * @param {(q: string) => Array} suche                  führt die Query aus
 */
function sucheMitVariantenFallback(bauQuery, suche) {
  const modern = bauQuery(false)
  const rows = suche(modern)
  if (rows.length >= MIN_TREFFER_OHNE_VARIANTEN) return rows
  const historisch = bauQuery(true)
  if (historisch === modern) return rows          // keine Varianten bekannt
  const mitVarianten = suche(historisch)
  return mitVarianten.length > rows.length ? mitVarianten : rows
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
  const s = stmts()
  if (!s) return []

  // Top-15 nach Relevanz holen, dann zufällig limit davon ziehen
  const pool = limit * 3

  try {
    const bauQuery = v => buildFtsQuery(lemma, collocate, { mitVarianten: v })

    let rows
    // Mit Jahres-Filter zuerst versuchen, dann ohne
    if (year) {
      const y = parseInt(year)
      rows = sucheMitVariantenFallback(bauQuery, q => s.topByYear.all(q, y - 15, y + 15, pool))

      // Zu wenige Treffer → ohne Jahres-Filter
      if (rows.length < 2) {
        rows = sucheMitVariantenFallback(bauQuery, q => s.top.all(q, pool))
      }
    } else {
      rows = sucheMitVariantenFallback(bauQuery, q => s.top.all(q, pool))
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
      quelle: formatQuelle(r),
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
export function fetchBelegeRaw(lemma, collocate, { limit = 20, prefixCollocate = false } = {}) {
  const s = stmts()
  if (!s) return []

  try {
    const bau = prefixCollocate ? buildFtsQueryPrefix : buildFtsQuery
    const rows = sucheMitVariantenFallback(
      v => bau(lemma, collocate, { mitVarianten: v }),
      q => s.raw.all(q, limit),
    )

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
        quelle: formatQuelle(r),
      }))
  } catch (err) {
    logger.warn({ err }, `fetchBelegeRaw fehlgeschlagen: ${lemma}+${collocate}`)
    return []
  }
}

// Maximale Anzahl Kontext-Wörter je Seite (wie DWDS): begrenzt die Breite von
// left/right auf ein vorhersehbares Maß, damit das Keyword in der App über
// mehrere Belegzeilen hinweg zuverlässig untereinander zentriert steht — bei
// unbegrenztem Kontext variiert die Breite pro Satz zu stark (F-Feedback:
// „Keyword in Context ... nicht immer genau untereinander zentral“).
const MAX_KWIC_CONTEXT_WORDS = 8

/**
 * Zerlegt tokenisierte Wörter in KWiC-Kontext (Keyword in Context): den Bereich
 * vor dem ersten hervorgehobenen Token, das Keyword selbst und den Bereich
 * danach. Zusammenhängende hl-Tokens (z.B. mehrteilige Formen) zählen als ein
 * Keyword. Gibt null zurück, wenn kein hervorgehobenes Token existiert (dann
 * fällt der Aufrufer auf den ungeteilten Satz zurück).
 *
 * left/right werden auf MAX_KWIC_CONTEXT_WORDS Wörter gekürzt (mit „…“), damit
 * die Zeilenbreite je Beleg vorhersehbar bleibt.
 *
 * @returns {{left:string, keyword:string, right:string}|null}
 */
function splitKwic(tokens) {
  const start = tokens.findIndex(t => t.hl)
  if (start === -1) return null
  let end = start
  while (end + 1 < tokens.length && tokens[end + 1].hl) end++

  // Tokens ab dem zweiten mit ihrem ws-Flag zu einem String fügen.
  const join = (from, to) => {
    let out = ''
    for (let i = from; i <= to; i++) {
      if (i > from && tokens[i].ws) out += ' '
      out += tokens[i].w
    }
    return out
  }

  let left = ''
  if (start > 0) {
    const from = Math.max(0, start - MAX_KWIC_CONTEXT_WORDS)
    left = (from > 0 ? '… ' : '') + join(from, start - 1)
  }

  let right = ''
  if (end + 1 < tokens.length) {
    const to = Math.min(tokens.length - 1, end + MAX_KWIC_CONTEXT_WORDS)
    right = join(end + 1, to) + (to < tokens.length - 1 ? ' …' : '')
  }

  return { left, keyword: join(start, end), right }
}

/**
 * Belegsätze NUR für ein Lemma (ohne Kollokator) – für das SEO-Wort-Archiv.
 * Liefert die relevantesten Sätze deterministisch (kein Shuffle → stabil für
 * HTTP-Cache/SSR). Bewusst KEIN Kollokator-Match, damit hier kein Spiel-
 * Lösungsset entsteht; es sind authentische Korpus-Belege des Worts.
 *
 * Zusätzlich zum Rohsatz werden Tokens (mit hl-Flag am Lemma) und die
 * KWiC-Dreiteilung (left/keyword/right) geliefert, damit das Archiv den Beleg
 * als Keyword-in-Context darstellen kann. Beides ist additiv – ältere Aufrufer,
 * die nur satz/quelle lesen, bleiben unberührt.
 *
 * @returns {Array<{satz:string, quelle:string, tokens:Array, kwic:object|null}>}
 */
export function fetchBelegeForLemma(lemma, { limit = 2 } = {}) {
  const s = stmts()
  if (!s) return []
  try {
    const rows = sucheMitVariantenFallback(
      v => ftsTerm(lemma, { mitVarianten: v }),
      q => s.top.all(q, limit * 4),
    )
    const seen = new Set()
    const unique = rows.filter(r => {
      const key = r.satz.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return unique.slice(0, limit).map(r => {
      // collocate='' → nur das Lemma wird hervorgehoben (kein Spiel-Lösungswort).
      const tokens = tokenize(r.satz, lemma, '')
      return {
        satz: r.satz,
        quelle: formatQuelle(r),
        tokens,
        kwic: splitKwic(tokens),
      }
    })
  } catch (err) {
    logger.warn({ err }, `Lemma-Belege-Suche fehlgeschlagen: ${lemma}`)
    return []
  }
}

/** Gibt true zurück wenn die Belege-DB vorhanden und lesbar ist. */
export function belegeVerfuegbar() {
  return db() !== null
}
