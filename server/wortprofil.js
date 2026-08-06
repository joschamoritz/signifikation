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
import { pruefeVollstaendigkeit, fasseSummenZusammen, baueProfil } from './register.js'

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
    { relCode: 'PRED',   label: 'Prädikativ',      question: lemma => `Welches Adjektiv kann „${lemma}“ prädikativ beschreiben?` },
    { relCode: 'GMOD',   label: 'Genitivattribut', question: lemma => `Welches Wort steht häufig mit „${lemma}“ im Genitiv?` },
    { relCode: '~GMOD',  label: 'Genitivattribut', question: lemma => `Von welchem Nomen ist „${lemma}“ oft ein Genitivattribut?` },
    { relCode: '~SUBJA', label: 'Subjekt-Verb',    question: lemma => `Welches Verb verbindet sich mit „${lemma}“ als Subjekt?` },
  ],
  Verb: [
    { relCode: 'SUBJA', label: 'Subjekt',            question: lemma => `Welches Wort steht typisch als Subjekt von „${lemma}“?` },
    { relCode: 'PP',    label: 'Präpositionalgruppe', question: lemma => `Welche Präpositionalgruppe passt zu „${lemma}“?` },
  ],
  Adjektiv: [
    { relCode: 'ADV',   label: 'Adverbialbestimmung', question: lemma => `Welches Adverb modifiziert „${lemma}“?` },
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
  '~SUBJA', '~OBJA', '~OBJD', '~ATTR', '~GMOD', '~ADV', '~PRED',
  'PRED_REV', // Pseudo-RelCode: Adjektiv→Verben, führt ~PRED und ~ADV zusammen
])

// Wortarten, unter denen ein Lemma spielbar sein kann (Reihenfolge = Tie-Break).
const POS_CANDIDATES = ['Substantiv', 'Verb', 'Adjektiv']

// ── Hilfsverben im Anzeige-Layer (Entscheidung F12) ──────────────────────────
// F12 hat entschieden, AUX-Verben NICHT in der DB zu filtern, sondern optional
// erst bei der Anzeige — analog zu F11 (Pronomen). Der Mechanismus steht hier,
// ist aber per Default AUS, weil die Messung an der fertigen v2-DB gegen das
// Filtern spricht (18 Lemmata, 12 × 50 Ziehungen der Spieloptionen):
//
//   • `sein` und `werden` erscheinen in KEINER Anzeige-Oberfläche — weder in den
//     Spieloptionen noch im Archiv, Lückenfüller oder Wort-Zwilling.
//   • `haben` erscheint in 7,0 % der Spieloptionen, konzentriert auf drei
//     Lemmata (Erfolg 42 %, Recht 28 %, Chance 14 %), bei neun weiteren nie.
//     Nie unter den Top-3, also nie als Lösung. Im Archiv 1× unter den Top-10.
//   • Genau dort sind es Funktionsverbgefüge („Erfolg haben", „Recht haben") —
//     fachlich korrekte Kollokationen. Ein Filter entfernte richtige Inhalte,
//     kein Rauschen.
//
// Einschalten mit WORTPROFIL_HIDE_AUX=1; greift dann an allen Stellen, an denen
// Kollokatoren angezeigt werden (queryRelation speist Spiel, Wort-Zwilling,
// Lückenfüller und „Eigenes Lemma"; fetchSyntagmaticPatterns das Archiv).
const AUX_LEMMATA = new Set(['haben', 'sein', 'werden'])
const HIDE_AUX = process.env.WORTPROFIL_HIDE_AUX === '1'

/** true, wenn dieser Kollokator laut F12-Regel ausgeblendet werden soll. */
function istVersteckterAux(depLemma, depPos) {
  return HIDE_AUX && depPos === 'Verb' && AUX_LEMMATA.has(String(depLemma).toLowerCase())
}

// Der Filter greift NACH dem SQL-LIMIT (F12: nicht in der DB filtern). Ohne
// Ausgleich lieferte eine Top-10-Liste dann 9 Zeilen. Bei aktivem Filter wird
// deshalb um höchstens drei Zeilen überfragt und danach auf `limit` gekürzt.
const AUX_LIMIT_PUFFER = HIDE_AUX ? AUX_LEMMATA.size : 0

// ── Schema-Erkennung (Phase G, DB-Neuaufbau) ─────────────────────────────────
// wortprofil_v2 bringt zwei Dinge, die v1 nicht hat und die hier gebraucht
// werden: echte `~PRED`-Zeilen (PRED ist jetzt INVERTIBLE) und die Tabelle
// `lemma_corpus_freq`. Erkannt wird das an `build_info.pipeline_version`.
//
// Warum überhaupt zwei Pfade: Code-Deploy und DB-Umschaltung (Env-Var) sind
// getrennte Schritte, und der Rollback ist „Env zurück + Restart" — beides
// setzt voraus, dass dieselbe Server-Version auch die alte DB noch lesen kann.
let _schema = null
function schema() {
  if (!_schema) {
    let version = null
    try {
      version = db().prepare("SELECT value FROM build_info WHERE key = 'pipeline_version'").get()?.value
    } catch { /* build_info fehlt → v1 */ }
    _schema = version === 'v2' ? 'v2' : 'v1'
    logger.info(`Wortprofil-Schema: ${_schema}`)
  }
  return _schema
}

// Prepared Statements einmalig nach DB-Init — better-sqlite3 cached
// prepare() NICHT intern, jeder Aufruf kompilierte das SQL neu
// (Review 2026-06-10; der frühere Kommentar hier behauptete das Gegenteil).
let _stmts = null
function stmts() {
  if (!_stmts) {
    const database = db()
    _stmts = {
      relation: database.prepare(`
        SELECT form, dep_lemma, dep_pos, frequency, logDice, relation_full,
               relation_description
        FROM collocations
        WHERE lemma = ? AND pos = ? AND relation = ?
          AND frequency >= ? AND logDice >= ?
        ORDER BY logDice DESC
        LIMIT ?
      `),
      // Kasusverteilung der Objekte eines Verbs (siehe verbRektion). Läuft über
      // idx_lemma_pos, das Ergebnis wird je Verb einmal berechnet und gecacht.
      // `dep_case` gibt es erst ab v2 (§3.3) — im Rollback-Fall auf v1 bleibt das
      // Statement null und alle Objekte heißen neutral „Objekt", statt dass die
      // Vorbereitung an der fehlenden Spalte scheitert.
      rektion: schema() === 'v2'
        ? database.prepare(`
            SELECT dep_case AS k, SUM(frequency) AS f
            FROM collocations
            WHERE lemma = ? AND pos = 'Verb' AND relation = 'OBJA'
              AND dep_case IN ('Acc','Dat','Gen')
            GROUP BY dep_case
          `)
        : null,
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
      // Zähler für kanonischesLemma – laufen über idx_lemma_pos bzw. dessen Präfix.
      lemmaCount: database.prepare('SELECT count(*) AS n FROM collocations WHERE lemma = ? AND pos = ?'),
      lemmaCountByPos: database.prepare('SELECT pos, count(*) AS n FROM collocations WHERE lemma = ? GROUP BY pos'),
      // Syntagmatische Muster (Archiv): nutzt idx_collocations_top
      // (lemma, pos, logDice DESC, frequency, dep_pos) → Sortierung kommt aus
      // dem Index (kein TEMP B-TREE), frequency/dep_pos werden im Index
      // gefiltert; Row-Lookups nur für die LIMIT-Treffer.
      synTotal: database.prepare('SELECT SUM(frequency) AS s FROM collocations WHERE lemma = ? AND pos = ?'),
      synPatterns: database.prepare(`
        SELECT relation, relation_description, dep_lemma, dep_pos, prep,
               frequency, logDice
        FROM collocations
        WHERE lemma = ? AND pos = ? AND frequency >= ? AND dep_pos != 'Pronomen'
        ORDER BY logDice DESC
        LIMIT ?
      `),
      // Registerprofil (server/register.js). Beide Statements gibt es nur ab v2 —
      // `lemma_corpus_freq` ist eine v2-Tabelle.
      lemmaKorpusFreq: schema() === 'v2'
        ? database.prepare('SELECT quelle, freq FROM lemma_corpus_freq WHERE lemma = ? AND pos = ?')
        : null,
      // ⚠️ Voller Scan über 25,87 Mio. Zeilen (COVERING INDEX idx_lcf_quelle),
      // gemessen konstant ~1,8 s — auch bei Wiederholung, da hilft kein Cache.
      // Darf deshalb NIE in einem Request laufen: better-sqlite3 ist synchron
      // und der Server ein einzelner Prozess, das wären 1,8 s Stillstand für
      // alle. Wird einmalig beim Start über waermeRegisterAuf() gezogen.
      korpusSummen: schema() === 'v2'
        ? database.prepare('SELECT quelle, SUM(freq) AS f FROM lemma_corpus_freq GROUP BY quelle')
        : null,
      // POS-Häufigkeit eines Lemmas („Elend"-Fix, siehe bestPosByFrequency).
      // v2 nutzt lemma_corpus_freq: höchstens ~25 Zeilen je (lemma, pos), damit
      // bei kaltem Cache vorhersehbar schnell. v1 kennt die Tabelle nicht und
      // muss über collocations summieren (Rollback-Pfad, seltener Fall).
      posFreq: schema() === 'v2'
        ? database.prepare(`
            SELECT pos, SUM(freq) AS f
            FROM lemma_corpus_freq
            WHERE lemma = ?
            GROUP BY pos
          `)
        : database.prepare(`
            SELECT pos, SUM(frequency) AS f
            FROM collocations
            WHERE lemma = ?
            GROUP BY pos
          `),
    }
  }
  return _stmts
}

/**
 * Wortarten eines Lemmas, absteigend nach Korpus-Häufigkeit („Elend"-Fix,
 * Golden Query #2).
 *
 * Vorher wurde die Wortart über die ANZAHL distinkter Kollokatoren bestimmt
 * (`bestKollokationPos` in customLemma.js). Dieses Maß ist verzerrt: jede Runde
 * ist auf 30 Treffer gedeckelt, und die Substantiv-Runden (KON, ~OBJA, ATTR)
 * füllen dieses Limit fast immer, die Adjektiv-Runden fast nie. Ergebnis in v2:
 * „deutsch" käme als Substantiv heraus (90 vs. 62 Kollokatoren), obwohl es mit
 * 3,1 Mio. gegen 60 k Vorkommen erdrückend ein Adjektiv ist. „Elend" ging nur
 * zufällig richtig aus. Die Häufigkeit entscheidet das eindeutig richtig.
 *
 * @returns {Array<{pos: string, freq: number}>} nur POS_CANDIDATES, kann leer sein
 */
export function posByFrequency(lemma) {
  try {
    const rows = stmts().posFreq.all(kanonischesLemma(lemma))
    return rows
      .filter(r => POS_CANDIDATES.includes(r.pos))
      .map(r => ({ pos: r.pos, freq: r.f || 0 }))
      .sort((a, b) => b.freq - a.freq
        || POS_CANDIDATES.indexOf(a.pos) - POS_CANDIDATES.indexOf(b.pos))
  } catch (err) {
    logger.warn({ err, lemma }, 'posByFrequency fehlgeschlagen')
    return []
  }
}

// ── Kanonische Lemmaform („präzise"-Fix) ─────────────────────────────────────
// v2 führt Schreibvarianten desselben Worts auf EIN Lemma zusammen — welches,
// entscheidet dwdsmors Lexikon, und das ist nicht immer die Form, die jemand
// eintippt oder im Wörterbuch nachschlägt:
//
//   präzise →   0 Kollokationen, präzis  →   797      (v1 war 112 / 103 gesplittet)
//   böse    →   6,               bös     → 1.982
//   Frieden →   0 (Substantiv),  Friede  → 2.525
//   Gedanken→   0 (Substantiv),  Gedanke → 4.359
//
// Umgekehrt gewinnt manchmal die -e-Form (spröde 281 / spröd 0, weise 733 / weis 0),
// es gibt also keine Richtungsregel — nur die Datenlage entscheidet.
//
// Deshalb: findet eine Abfrage zu wenig, werden morphologische Varianten geprüft
// und diejenige mit den MEISTEN Kollokationen genommen. Angezeigt wird weiterhin
// das ursprüngliche Wort — nur die Abfrage wandert. Ein bereits gesundes Lemma
// wird nie angefasst (Schwelle unten), es kann also nichts verschlechtert werden.
const KANONISCH_SCHWELLE = 50   // ab so vielen Zeilen gilt ein Lemma als gesund

/** Morphologische Kandidaten für ein Lemma – bewusst klein und regelhaft. */
function lemmaVarianten(low) {
  const v = []
  if (low.endsWith('e')) v.push(low.slice(0, -1))          // präzise → präzis
  else v.push(`${low}e`)                                    // spröd   → spröde
  if (low.endsWith('n') && low.length > 3) v.push(low.slice(0, -1)) // Frieden → Friede
  return v.filter(x => x.length >= 3 && x !== low)
}

// Gedeckelt, weil die Schlüssel aus Nutzereingaben stammen („Eigenes Lemma"
// lässt beliebige Wörter zu). Ohne Deckel wäre das ein langsames Leck auf einem
// Server mit 3,7 GB RAM. Map hält Einfügereihenfolge → ältester Eintrag zuerst.
const KANONISCH_CACHE_MAX = 10000
const _kanonisch = new Map()

function merkeKanonisch(key, wert) {
  if (_kanonisch.size >= KANONISCH_CACHE_MAX) {
    _kanonisch.delete(_kanonisch.keys().next().value)
  }
  _kanonisch.set(key, wert)
}

/**
 * Liefert die Lemmaform, unter der in dieser DB tatsächlich Daten liegen.
 * @param {string} lemma  Eingabeform (wird kleingeschrieben)
 * @param {string|null} pos  Wortart einschränken, oder null für „über alle"
 * @returns {string} kleingeschriebene Lemmaform für die Abfrage
 */
function kanonischesLemma(lemma, pos = null) {
  const low = String(lemma).toLowerCase()
  const key = `${low}|${pos ?? '*'}`
  const gecacht = _kanonisch.get(key)
  if (gecacht !== undefined) return gecacht

  let ergebnis = low
  try {
    // Ohne bekannte Wortart zählt die STÄRKSTE Wortart, nicht die Summe: „Frieden"
    // hat als Substantiv 0 Zeilen, über alle Wortarten aber 62 (Adjektiv- und
    // Verb-Artefakte). Die Summe läge damit über der Schwelle und der Fallback
    // würde nicht greifen, obwohl das Wort als Substantiv unbrauchbar ist.
    const zaehle = pos
      ? (l) => stmts().lemmaCount.get(l, pos)?.n ?? 0
      : (l) => stmts().lemmaCountByPos.all(l)
          .filter(r => POS_CANDIDATES.includes(r.pos))
          .reduce((max, r) => Math.max(max, r.n), 0)
    let beste = zaehle(low)
    if (beste < KANONISCH_SCHWELLE) {
      for (const kand of lemmaVarianten(low)) {
        const n = zaehle(kand)
        if (n > beste) { beste = n; ergebnis = kand }
      }
      if (ergebnis !== low) {
        logger.debug({ lemma: low, kanonisch: ergebnis, pos, zeilen: beste },
          'wortprofil: auf kanonische Lemmaform ausgewichen')
      }
    }
  } catch (err) {
    logger.warn({ err, lemma }, 'kanonischesLemma fehlgeschlagen – nutze Eingabeform')
  }
  merkeKanonisch(key, ergebnis)
  return ergebnis
}

// ── Kasusgenaue Objekt-Beschriftung (Phase G, Terminologie) ──────────────────
//
// `OBJD` existiert in triples_v2 nicht: der `iobj`-Zweig feuert mit `de_zdl_lg`
// nie, alle Objekte landen in `OBJA` (= UD-`obj`, „direktes Objekt", kasusfrei).
// Die gebaute `relation_description` sagt trotzdem pauschal „Akkusativobjekt" —
// bei `helfen + Mensch` (Dativ, Frequenz 7.103) also nachweislich falsch.
//
// Gemessene Verteilung über die 1.110.799 OBJA-Zeilen:
//   Acc 679.716 · leer 215.080 · Dat 114.810 · Nom 88.970 · Gen 12.223
//
// Ohne bestimmbaren Kasus wird bewusst NICHT geraten (Entscheidung 2026-08-06):
// „leer" heißt, der Parser konnte den Kasus nicht bestimmen, und `Nom` ist in
// einer Objektrelation ein Parser-Artefakt („wort ← haben"). Beides bekommt das
// neutrale „Objekt" — in einer Lernanwendung soll keine Kasusangabe stehen, die
// sich nicht belegen lässt.
const OBJ_KASUS = { Acc: 'Akkusativobjekt', Dat: 'Dativobjekt', Gen: 'Genitivobjekt' }
const OBJ_NEUTRAL = 'Objekt'

// Ab welchem Anteil ein Kasus als Rektion des Verbs gilt. Gemessen an 22 Verben
// mit grammatisch eindeutiger Rektion: bei 90 % sind 13 korrekt beschriftet,
// **0 falsch**, 9 fallen ins neutrale „Objekt". Der Abstand nach unten ist
// bewusst groß — das höchste FALSCHE Verb liegt bei 82 % (`bedürfen` → Dat,
// richtig wäre Gen), das niedrigste richtige bei 88 % (`schaden` → Dat).
const REKTION_SCHWELLE = 0.9

const REKTION_CACHE_MAX = 5000
const _rektion = new Map()

/**
 * Kasus, den ein Verb bei seinen Objekten regiert — oder `null`, wenn die Daten
 * das nicht hergeben.
 *
 * **Warum nicht der Kasus der einzelnen Zeile:** `dep_case` steht zwar in jeder
 * `OBJA`-Zeile, ist aber zu verrauscht, um einzelne Kollokationen zu etikettieren.
 * Gegen 22 Verben mit bekannter Rektion gemessen tragen nur **90,2 %** der Zeilen
 * den grammatisch richtigen Kasus. Zeilenweise beschriftet ergäbe das zwei
 * sichtbare Fehler: `helfen + sich` erschiene als „Akkusativobjekt" (falsch,
 * helfen regiert Dativ), und innerhalb desselben Verbs stünden gleichartige
 * Kollokatoren unterschiedlich da („Bier — Akkusativobjekt" neben „Wein —
 * Objekt", nur weil der Parser einmal einen Kasus fand und einmal nicht).
 *
 * Rektion ist ohnehin eine Eigenschaft des **Verbs**, nicht des einzelnen
 * Objekts — genau so steht es auch im Kurs-Arbeitsblatt zu Station 3. Deshalb
 * wird über alle Objekte des Verbs aggregiert und nur bei klarer Mehrheit
 * beschriftet. `Nom` und Leerwerte zählen dabei nicht mit: ein Nominativobjekt
 * gibt es nicht, das ist ein Parser-Artefakt (bei `tun` 23 % der Zeilen).
 *
 * Nicht erkannt werden dadurch u. a. `helfen` (Dat 74 %) und alle Genitiv-Verben
 * (`gedenken`, `bedürfen`, `harren` — der Parser trifft den Genitiv nicht). Die
 * zeigen „Objekt" statt einer falschen Angabe.
 */
function verbRektion(verbLemma) {
  const key = String(verbLemma ?? '').toLowerCase()
  if (!key) return null
  if (_rektion.has(key)) return _rektion.get(key)

  let ergebnis = null
  try {
    const rows = stmts().rektion?.all(key) ?? []
    const summe = rows.reduce((s, r) => s + r.f, 0)
    if (summe > 0) {
      const top = rows.reduce((a, b) => (b.f > a.f ? b : a))
      if (top.f / summe >= REKTION_SCHWELLE) ergebnis = top.k
    }
  } catch (err) {
    logger.debug({ err, verbLemma }, 'verbRektion fehlgeschlagen – neutrale Beschriftung')
  }

  if (_rektion.size >= REKTION_CACHE_MAX) _rektion.delete(_rektion.keys().next().value)
  _rektion.set(key, ergebnis)
  return ergebnis
}

/**
 * Ersetzt die gebaute `relation_description` für Objekt-Relationen durch eine
 * kasusgenaue. Alle anderen Relationen bleiben unangetastet.
 *
 * `OBJA`: Basis ist das Verb. `~OBJA`: Basis ist das Nomen, das Verb steht im
 * Kollokator — in beiden Fällen entscheidet die Rektion desselben Verbs.
 */
function kasusBeschriftung(relation, row, basisLemma, fallback) {
  if (relation === 'OBJA') {
    return OBJ_KASUS[verbRektion(basisLemma)] ?? OBJ_NEUTRAL
  }
  if (relation === '~OBJA') {
    return `ist ${OBJ_KASUS[verbRektion(row.dep_lemma)] ?? OBJ_NEUTRAL} von`
  }
  return fallback
}

function queryRelationRaw(lemma, pos, rel, limit, minFreq, minDice) {
  return stmts().relation.all(kanonischesLemma(lemma, pos), pos, rel, minFreq, minDice, limit)
}

export function queryRelation(lemma, pos, relCode, limit = 30, minFreq = 5, minDice = 0) {
  if (!VALID_POS.has(pos)) {
    logger.warn({ lemma, pos, relCode }, 'queryRelation: unbekannte POS')
    return []
  }
  const rel = normalizeRel(relCode)
  if (!VALID_RELCODE.has(rel)) {
    logger.warn({ lemma, pos, relCode: rel }, 'queryRelation: unbekannter RelCode')
    return []
  }

  const abfrageLimit = limit + AUX_LIMIT_PUFFER
  let rows = queryRelationRaw(lemma, pos, rel, abfrageLimit, minFreq, minDice)

  // Adaptiver Fallback: minFreq schrittweise senken wenn zu wenig Treffer
  if (rows.length < 10 && minFreq > 1) {
    rows = queryRelationRaw(lemma, pos, rel, abfrageLimit, 2, minDice)
    if (rows.length < 10) {
      rows = queryRelationRaw(lemma, pos, rel, abfrageLimit, 1, minDice)
    }
    if (rows.length > 0)
      logger.debug({ lemma, pos, relCode: rel, count: rows.length }, 'queryRelation: minFreq-Fallback aktiv')
  }

  // F12: Hilfsverben erst hier ausblenden, nicht in der DB. Per Default inaktiv.
  const basis = kanonischesLemma(lemma, pos)
  return rows
    .filter(r => !istVersteckterAux(r.dep_lemma, r.dep_pos))
    .map(r => ({
      form:                 r.form,
      lemma:                normalizeLemma(r.dep_lemma, r.dep_pos),
      frequency:            r.frequency,
      logDice:              String(r.logDice.toFixed(4)),
      pos:                  r.dep_pos,
      relation:             r.relation_full,
      relation_description: kasusBeschriftung(rel, r, basis, r.relation_description),
      concord_id:           null,
      has_concord:          false,
      has_mwe:              false,
    }))
    .slice(0, limit)
}

// ── Registerprofil ───────────────────────────────────────────────────────────
// Die Register-Summen kosten einen vollen Index-Scan (~1,8 s) und ändern sich
// nie — die DB ist statisch und readonly. Deshalb genau einmal berechnen.
let _registerSummen = null

/**
 * Berechnet die Register-Summen vorab. Beim Serverstart aufrufen, damit die
 * 1,8 s nicht auf dem ersten Archiv-Aufruf landen (better-sqlite3 ist synchron,
 * der Server ein einzelner Prozess).
 *
 * Idempotent und nicht fatal: schlägt es fehl, bleibt das Registerprofil leer
 * und der Rest des Archivs funktioniert weiter.
 */
export function waermeRegisterAuf() {
  if (_registerSummen) return _registerSummen
  const s = stmts()
  if (!s?.korpusSummen) {
    logger.info('Registerprofil inaktiv (kein v2-Schema / keine DB)')
    _registerSummen = { proRegister: new Map(), gesamt: 0 }
    return _registerSummen
  }
  const t0 = Date.now()
  try {
    const korpusSummen = s.korpusSummen.all()
    // register.js ist bewusst abhängigkeitsfrei (das Frontend importiert es) und
    // loggt selbst nicht — die Befunde landen hier.
    const { fehlend, unbekannt } = pruefeVollstaendigkeit(korpusSummen.map(r => r.quelle))
    if (fehlend.length) {
      logger.warn({ fehlend },
        'Registerprofil: Korpora ohne Zuordnung – sie fehlen im Erwartungswert, Faktoren leicht verzerrt')
    }
    if (unbekannt.length) logger.debug({ unbekannt }, 'Registerprofil: zugeordnete Korpora fehlen in der DB')
    _registerSummen = fasseSummenZusammen(korpusSummen)
    logger.info(
      { korpora: korpusSummen.length, register: _registerSummen.proRegister.size,
        token: _registerSummen.gesamt, ms: Date.now() - t0 },
      'Registerprofil: Korpus-Summen berechnet')
  } catch (err) {
    logger.warn({ err }, 'Registerprofil: Summen nicht berechenbar – Profil bleibt leer')
    _registerSummen = { proRegister: new Map(), gesamt: 0 }
  }
  return _registerSummen
}

/**
 * „In welcher Textsorte ist dieses Wort auffällig häufig?"
 *
 * Liefert bis zu `limit` Register mit dem Faktor beobachtet/erwartet, absteigend.
 * Leeres Array, wenn das Wort kein Profil hat — das ist ein gültiges Ergebnis
 * und keine Störung: `Jahr` und `Tor` liegen überall bei ~1,6× und fallen unter
 * MIN_FAKTOR. Details zur Metrik in server/register.js.
 *
 * @returns {Array<{register: string, faktor: number, frequenz: number}>}
 */
export function fetchRegisterProfil(lemma, pos = 'Substantiv', { limit = 3 } = {}) {
  if (!VALID_POS.has(pos)) return []
  try {
    const s = stmts()
    if (!s?.lemmaKorpusFreq) return []
    const summen = _registerSummen ?? waermeRegisterAuf()
    if (!summen.gesamt) return []
    const zeilen = s.lemmaKorpusFreq.all(kanonischesLemma(lemma, pos), pos)
    return baueProfil(zeilen, summen, { limit })
  } catch (err) {
    logger.warn({ err, lemma, pos }, 'fetchRegisterProfil fehlgeschlagen')
    return []
  }
}

/**
 * Rückwärtsabfrage: Verben die `lemma` als prädikatives Adjektiv verwenden.
 *
 * NUR NOCH ROLLBACK-PFAD (v1). In wortprofil.db v1 wurde PRED nicht invertiert,
 * es gab also keine `~PRED`-Zeilen und diese Rückwärtssuche war der einzige Weg.
 * Sie filtert auf `dep_lemma`, wofür kein Index existiert → Skip-Scan über jedes
 * distinkte (lemma, pos)-Präfix. In v2 sind das 1.030.294 statt 275.536 Präfixe;
 * gemessen 1213 ms gegen < 1 ms für die echte `~PRED`-Abfrage bei identischem
 * Ergebnis (Gate-E-Report, Abschnitt 7). Deshalb nimmt v2 diesen Weg nicht mehr.
 */
function queryRelationReverse(lemma, depPos, rel, limit = 30, minFreq = 5, minDice = 0) {
  const kanon = kanonischesLemma(lemma, depPos)
  let rows = stmts().relationReverse.all(kanon, depPos, rel, minFreq, minDice, limit)

  // Adaptiver Fallback
  if (rows.length < 10 && minFreq > 1) {
    rows = stmts().relationReverse.all(kanon, depPos, rel, 1, minDice, limit)
  }

  // Hier steht dep_lemma für das Adjektiv und `lemma` für das Verb — die
  // Spalten sind gegenüber queryRelation getauscht (Rückwärtsabfrage). Der
  // AUX-Filter muss deshalb auf den ausgegebenen Kollokator prüfen, also auf
  // r.dep_lemma/r.dep_pos in der SELECT-Umbenennung dieser Query.
  return rows
    .filter(r => !istVersteckterAux(r.dep_lemma, r.dep_pos))
    .map(r => ({
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
      // PRED_REV: Verben für Adjektive – führt drei Quellen zusammen:
      // 1) ~ADV als Adjektiv: adverbiale Verwendung, Parser-Tag = Adjektiv
      // 2) ~ADV als Adverb:   adverbiale Verwendung, Parser-Tag = Adverb (z.B. „krank feiern“)
      // 3) prädikative Verwendung (z.B. „bleiben/scheinen/wirken + grün“)
      //
      // Quelle 3 kommt in v2 aus echten `~PRED`-Zeilen (PRED ist seit
      // build_wortprofil_v2.py INVERTIBLE), in v1 weiterhin aus der langsamen
      // Rückwärtssuche. Der Name PRED_REV bleibt als Pseudo-RelCode erhalten:
      // er steht in gespeicherten `lemmata.rundenInfo`-Einträgen und in den
      // Kurs-Inhalten, ist also Teil der Datenform nach außen.
      if (relCode === 'PRED_REV') {
        const adjAdvRows  = queryRelation(lemma, 'Adjektiv', '~ADV')
        const advAdvRows  = queryRelation(lemma, 'Adverb',   '~ADV')
        const predRows    = schema() === 'v2'
          ? queryRelation(lemma, 'Adjektiv', '~PRED')
          : queryRelationReverse(lemma, 'Adjektiv', 'PRED')
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

// ── Öffentliche Kollokations-Stichprobe (SEO-Wort-Archiv) ─────────────────────
// WICHTIG: Die Lösung des Kollokationen-Spiels sind die TOP 3 Kollokatoren
// (buildOptions: items.slice(0,3)). Diese Stichprobe überspringt daher die
// stärksten COLLOC_SAMPLE_SKIP_TOP (Top 3 + Sicherheitsmarge) und zeigt nur
// schwächere, alphabetisch sortierte Verbindungen ohne logDice-Werte — echte
// Kollokationen, aber kein Spiel-Lösungsset/Ranking.
const COLLOC_SAMPLE_SKIP_TOP = 5
const COLLOC_SAMPLE_MIN_SCORE = 5
const COLLOC_SAMPLE_COUNT = 6

/**
 * Liefert eine kleine, anzeigbare Auswahl typischer Kollokatoren eines Lemmas,
 * BEWUSST ohne die stärksten (= Spiel-Lösung) und ohne Stärke-Angaben.
 * @returns {Promise<string[]>} alphabetisch sortierte Wörter (kann leer sein)
 */
export async function fetchCollocationSample(lemma, pos = 'Substantiv', {
  skipTop = COLLOC_SAMPLE_SKIP_TOP,
  minScore = COLLOC_SAMPLE_MIN_SCORE,
  count = COLLOC_SAMPLE_COUNT,
} = {}) {
  const rounds  = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  const results = await Promise.allSettled(
    rounds.map(round => fetchRelation(lemma, pos, round.relCode))
  )
  // Über alle Relationen dedupliziert (höchstes logDice gewinnt), wie im Spiel.
  const seen = new Map()
  for (const res of results) {
    if (res.status !== 'fulfilled') continue
    for (const item of res.value) {
      const key = item.lemma.toLowerCase()
      const existing = seen.get(key)
      if (!existing || parseFloat(item.logDice) > parseFloat(existing.logDice)) seen.set(key, item)
    }
  }
  const lemmaLow = lemma.toLowerCase()
  const band = [...seen.values()]
    .sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))
    .slice(skipTop) // Top-N (= Lösung) nie zeigen
    .filter(i => i.lemma && !i.lemma.includes(' ') && i.lemma.toLowerCase() !== lemmaLow
      && parseFloat(i.logDice) >= minScore)
    .slice(0, count)
    .map(i => i.lemma)
  return [...new Set(band)].sort((a, b) => a.localeCompare(b, 'de'))
}

// ── Syntagmatische Muster fürs Archiv (Bubenhofer 2015, S. 2) ─────────────────
// Zeigt zu jedem Kollokator: Relations-/Musterbeschreibung, absolute Frequenz,
// logDice (Signifikanz), Anteil an allen erfassten Verbindungen und die typische
// Stellung des Kollokators relativ zum Lemma. WICHTIG: der Prozentwert ist der
// Anteil UNTER DEN ERFASSTEN (min-count/min-dice-gefilterten) Kollokationen des
// Lemmas – NICHT Bubenhofers Muster-Anteil (Anteil eines Musters an den Belegen
// EINER Kollokation) und keine echte Korpus-Grundgesamtheit. Entsprechend
// beschriften. Die Stellung ist grammatisch begründet (typische Wortstellung je
// Relation), nicht korpusstatistisch gemessen – daher „typisch“, kein Messwert.

// Typische Stellung des Kollokators relativ zum Lemma, aus Sicht des Lemmas.
// Berücksichtigt die Perspektive: bei inversen Relationen (~) ist das Lemma der
// Dependent, der Kollokator der Kopf, deshalb dreht sich die Stellung.
// Wortarten mit reichem Kollokationsprofil – als Netzknoten für sekundäre
// Kollokatoren geeignet (Adverbien/Pronomen bewusst ausgenommen).
const BASE_POS = new Set(['Substantiv', 'Verb', 'Adjektiv'])

// Hilfs-/Funktions-/Stützverben: als Netzknoten liefern sie diffuse, wenig
// aussagekräftige Kollokate (haben → „so“/„noch“). Im primären Muster bleiben
// sie sichtbar (z.B. „Erinnerung haben“), nur nicht als Wortnetz-Basis.
const SKIP_NETZ_BASE = new Set([
  'haben', 'sein', 'werden', 'machen', 'tun', 'geben', 'lassen',
])

const REL_POSITION = {
  // direkte Relationen: Lemma ist Kopf
  ATTR:    'vor',       // geeignete Maßnahme – Adjektivattribut vor dem Nomen
  GMOD:    'nach',      // Maßnahme der Regierung – Genitivattribut nachgestellt
  KON:     'variabel',  // Koordination beidseitig
  OBJA:    'variabel',  // Objekt im Mittelfeld, Stellung je nach Satzbau
  OBJD:    'variabel',
  SUBJA:   'variabel',  // Subjekt meist vor dem Verb, aber fokusabhängig
  ADV:     'variabel',
  PRED:    'nach',      // Kopula + Prädikativ nachgestellt
  PP:      'nach',      // Präpositionalgruppe meist nachgestellt
  // inverse Relationen: Lemma ist Dependent, Kollokator ist Kopf
  '~ATTR':  'nach',     // Lemma=Adjektiv vor dem (Kollokator-)Nomen → Nomen danach
  '~GMOD':  'vor',      // Kopfnomen vor dem Genitiv-Lemma → Kollokator davor
  '~OBJA':  'variabel',
  '~OBJD':  'variabel',
  '~SUBJA': 'nach',     // Subjekt-Lemma, finites Verb (Kollokator) in V2 danach
  '~ADV':   'variabel',
}

/**
 * Syntagmatische Muster eines Lemmas fürs Archiv.
 * Liefert die stärksten Kollokatoren über alle Relationen, angereichert mit
 * frequency, logDice, Prozentanteil (an der Summe aller erfassten Frequenzen)
 * und typischer Stellung. Deterministisch sortiert nach logDice (kein Shuffle →
 * cache-/SSR-stabil). Bewusst OHNE Spiel-Bezug: es werden alle Relationen
 * gemischt gezeigt, nicht das Runden-Lösungsset.
 *
 * @returns {{ total:number, patterns: Array<{
 *   kollokator, pos, relation, muster, prep, frequency, logDice, anteil, stellung
 * }> }}
 */
export function fetchSyntagmaticPatterns(lemma, pos = 'Substantiv', { limit = 10, minFreq = 5, withTotal = true } = {}) {
  if (!VALID_POS.has(pos)) {
    logger.warn({ lemma, pos }, 'fetchSyntagmaticPatterns: unbekannte POS')
    return { total: 0, patterns: [] }
  }
  try {
    const low = kanonischesLemma(lemma, pos)
    // Summe ALLER erfassten Frequenzen des Lemmas (Nenner für den Anteil).
    // Übersprungen (withTotal=false), wenn der Aufrufer keinen Anteil braucht
    // (sekundäre Kollokatoren) – spart eine SUM-Aggregation pro Basis.
    const total = withTotal ? (stmts().synTotal.get(low, pos)?.s || 0) : 0
    // dep_pos != 'Pronomen': Funktionswörter (die/er/sie/wir …) sind zwar echte
    // Subjekt-/Objekt-Kollokatoren, fürs Wörterbuch-Archiv aber Rauschen. Der
    // Nenner `total` (oben) bleibt bewusst die volle erfasste Menge inkl.
    // Pronomen → „Anteil an allen erfassten Verbindungen“ bleibt korrekt.
    const rows = stmts().synPatterns.all(low, pos, minFreq, limit + AUX_LIMIT_PUFFER)

    // F12 (AUX) wird wie der Pronomen-Filter oben behandelt: erst bei der
    // Anzeige, und `total` bleibt die volle erfasste Menge, damit der Anteil
    // weiterhin „Anteil an allen erfassten Verbindungen" bedeutet.
    const patterns = rows
      .filter((r) => !istVersteckterAux(r.dep_lemma, r.dep_pos))
      .map((r) => ({
        kollokator: normalizeLemma(r.dep_lemma, r.dep_pos),
        pos:        r.dep_pos,
        relation:   r.relation,
        muster:     kasusBeschriftung(r.relation, r, low, r.relation_description),
        prep:       r.prep || '',
        frequency:  r.frequency,
        logDice:    Number(r.logDice.toFixed(2)),
        anteil:     total ? Number((100 * r.frequency / total).toFixed(1)) : 0,
        stellung:   REL_POSITION[r.relation] || 'variabel',
      }))
      .slice(0, limit)
    return { total, patterns }
  } catch (err) {
    logger.warn({ err, lemma, pos }, 'fetchSyntagmaticPatterns fehlgeschlagen')
    return { total: 0, patterns: [] }
  }
}

/**
 * Sekundäre Kollokatoren fürs Archiv (Kollokatoren der Kollokatoren, 1 Hop).
 * Nimmt die stärksten `baseCount` Kollokatoren des Lemmas als Basis und fragt
 * für jede Basis deren eigene stärkste `perBase` Kollokatoren ab. So wird das
 * „Wortnetz“ um ein Lemma sichtbar (z.B. Maßnahme → ergreifen → Initiative/
 * Konsequenz …). Bewusst flach (1 Hop) und schmal (Top-2 Basis) gehalten, um
 * die Zahl der Folgeabfragen klein zu halten (≈ 1 + baseCount Aufrufe).
 *
 * Das Ausgangs-Lemma wird aus den sekundären Treffern entfernt (sonst zeigt
 * jede Basis nur auf das Lemma zurück). Basen ohne abfragbare POS (z.B.
 * Pronomen) oder mehrwortige Kollokatoren werden übersprungen.
 *
 * `patterns` kann übergeben werden, wenn der Aufrufer die Muster bereits geholt
 * hat (buildWortDetail) → spart eine doppelte SELECT+SUM-Abfrage auf demselben
 * Lemma. Fehlt es, wird ohne SUM geholt (das Netz braucht keinen Anteil).
 *
 * @returns {Array<{ base:string, pos:string, relation:string,
 *   collocates: Array<{ kollokator, pos, logDice, frequency }> }>}
 */
export function fetchSecondaryCollocates(lemma, pos = 'Substantiv', {
  baseCount = 2,
  perBase = 5,
  patterns = null,
} = {}) {
  const basePatterns = patterns
    ?? fetchSyntagmaticPatterns(lemma, pos, { limit: 12, withTotal: false }).patterns
  const lemmaLow = lemma.toLowerCase()

  // Basen: stärkste Kollokatoren mit abfragbarer POS + Einzelwort, dedupliziert.
  // Nur Substantiv/Verb/Adjektiv als Netzknoten – Adverbien haben oft dünne,
  // historisch verrauschte Kollokationsprofile (z.B. „dahin“ → OCR-Varianten).
  const bases = []
  const seenBase = new Set()
  for (const p of basePatterns) {
    const key = p.kollokator.toLowerCase()
    if (!BASE_POS.has(p.pos)) continue
    if (SKIP_NETZ_BASE.has(key)) continue
    if (p.kollokator.includes(' ')) continue
    if (key === lemmaLow || seenBase.has(key)) continue
    seenBase.add(key)
    bases.push(p)
    if (bases.length >= baseCount) break
  }

  const out = []
  for (const base of bases) {
    // withTotal:false – für das Netz zählt nur logDice/Frequenz, kein Anteil.
    const { patterns: sub } = fetchSyntagmaticPatterns(base.kollokator, base.pos, { limit: perBase + 4, withTotal: false })
    const collocates = []
    const seen = new Set([lemmaLow, base.kollokator.toLowerCase()])
    for (const s of sub) {
      const key = s.kollokator.toLowerCase()
      if (seen.has(key) || s.kollokator.includes(' ')) continue
      seen.add(key)
      collocates.push({ kollokator: s.kollokator, pos: s.pos, logDice: s.logDice, frequency: s.frequency })
      if (collocates.length >= perBase) break
    }
    if (collocates.length) {
      out.push({ base: base.kollokator, pos: base.pos, relation: base.relation, collocates })
    }
  }
  return out
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
    const rows = stmts().zeitreise.all(kanonischesLemma(lemma), ZW_MIN_JAHRZEHNT)

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
    logger.warn({ err }, `fetchZeitenwende: Fehler bei „${lemma}“`)
    return null
  }
}

/**
 * Zeitenwende-Analyse für den Admin: zeigt pre/post-Kandidaten mit Scores.
 * Gibt { lemma, usable, preCandidates, postCandidates, words? } zurück.
 */
export async function fetchZeitenwendeAnalyze(lemma) {
  const rows = stmts().zeitreise.all(kanonischesLemma(lemma), ZW_MIN_JAHRZEHNT)

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
    const row = stmts().lemmaExists.get(kanonischesLemma(lemma))
    return !!row
  } catch {
    return false
  }
}
