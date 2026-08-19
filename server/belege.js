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
 * ── Lemma-Suche (Phase F2, seit 2026-08-17) ──────────────────────────────────
 * `belege_v2.db` trägt seit F2 eine zweite, additive FTS5-Tabelle `lemmata_fts`
 * (contentless, `detail=none`, nur Inhaltswörter) — pro Satz die LEMMA-Folge
 * statt der Wortformen, mit demselben `lemma_corrections`-Mapping wie
 * `wortprofil_v2` (thier→tier ist darin schon normalisiert). Das ist jetzt der
 * PRIMÄRE Suchweg: eine Suche nach den kanonischen Lemmata aus `wortprofil_v2`
 * (z. B. „digital" + „Gesundheitsanwendung") findet damit auch Sätze, in denen
 * nur die flektierte Form steht („digitale Gesundheitsanwendungen") — ohne
 * Prefix-Raten und ohne die alte Varianten-Liste, die bis F2 nötig war (siehe
 * Git-Historie für den entfernten Rückwärts-Varianten-Fallback aus Phase G:
 * er las `lemma_corrections` rückwärts und hängte `("tier" OR "thier")` an die
 * Wortform-Query — überflüssig, seit die Lemma-Spalte selbst normalisiert ist).
 *
 * `lemmata_fts` ist contentless (kein Klartext abrufbar) — eine Suche liefert
 * nur `rowid`e (= `saetze.id`), die per PK-Lookup zu vollen Zeilen werden
 * (`bySatzId`). Fenster-Sampling (siehe unten) funktioniert auf `lemmata_fts`
 * genauso wie auf `belege_fts`: `detail=none` betrifft nur Positions-/Spalten-
 * Detailtiefe, nicht die rowid-Struktur, an der die Fenster ansetzen.
 *
 * Die Wortform-Suche (`belege_fts`) bleibt als FALLBACK: läuft nur, wenn der
 * Lemma-Pool zu klein ausfällt (< `POOL_MIN`, z. B. weil ein Wort in
 * `lemmata_fts` nicht denselben Lemma-Ausschlag hat wie in `wortprofil_v2` —
 * annotate_lemmata.py lief ohne Dependenzparser/dwdsmor, rekonstruiert trennbare
 * Verben deshalb seltener als `parse_deps_v2.py`; „auftischen" findet sich in
 * der Praxis trotzdem meist, siehe Session 2026-08-17). Alte DBs ohne
 * `lemmata_fts` (Rollback-Fall) fallen automatisch komplett auf die
 * Wortform-Suche zurück (`hasLemmaFts()` prüft das Schema einmalig).
 *
 * ── Zufalls-Fenster statt `ORDER BY rank` (Gate G, Latenz-Fix) ───────────────
 * `ORDER BY rank` zwingt FTS5, JEDEN Treffer nach BM25 zu bewerten, bevor die
 * besten feststehen. Bei `zeit AND haben` sind das 121.109 Sätze — gemessen
 * 967 ms. Seit v2 (141,7 Mio. Sätze) hat das die Belege-Antwort auf 1,6–7 s
 * gezogen, der erste Kaltstart lag bei 30 s.
 *
 * Der Ersatz liest FTS5 ohne `rank` ab einem **zufälligen rowid** und bewertet
 * die Sätze danach in JavaScript mit `scoreBeleg()`.
 *
 * ⚠️ Entscheidend für das Verständnis: **`rowid > ?` ist in unserem Build KEIN
 * Sprung.** FTS5 läuft die Doclist des Terms vom Anfang ab, die Kosten wachsen
 * linear mit dem Startpunkt (gemessen 0,2 ms bei 0 %, ~100 ms bei 99 %).
 * `rowid < ?` mit `ORDER BY rowid DESC` läuft spiegelbildlich vom Ende. Das ist
 * eine Eigenschaft des Builds, nicht der SQLite-Version: dieselbe Query auf
 * derselben Datei kostet unter Pythons sqlite3 1,5 ms und unter better-sqlite3
 * 109 ms, bei identischen Trefferzeilen und identischem EXPLAIN QUERY PLAN
 * (geprüft mit SQLite 3.50.2/3.51.0/3.51.2/3.53.0 — alle Node-Builds langsam).
 * Wer hier optimiert, muss also die **Zahl** der Fenster und ihre **Lage** im
 * Blick behalten, nicht nur die Trefferzahl.
 *
 * Daraus die vier Bauentscheidungen, alle am echten Korpus gemessen:
 *
 *  1. **Sechs Fenster, drei aufsteigend und drei absteigend.** Die rowids folgen
 *     der Import-Reihenfolge, und die ist korpusweise blockiert. Ein einzelnes
 *     Fenster liefert deshalb alle Sätze aus EINEM Korpus (Zeit+haben: 15×
 *     `deu_news`). Sechs Fenster kommen auf Ø 4,3 Korpora und damit fast auf den
 *     BM25-Stand (4,7) — bei 151 ms statt 967 ms im schlimmsten Fall.
 *  2. **Startpunkte nur aus den billigen Zonen** (unten bis 34 %, oben ab 64 %).
 *     Das ist keine reine Sparmaßnahme: unten liegen `gesetze` bis
 *     `deu_newscrawl` (Bundestag + Leipziger Zeitungskorpora), oben `wikipedia`.
 *     Der teure Mittelteil 34–64 % sind die historischen Korpora (Reichstag,
 *     DTA, `gei_digital`) — für Gegenwartsbelege ohnehin die schlechtere Wahl.
 *  3. **Nachsortieren mit `scoreBeleg()`.** Reiner Zufall senkt die Satzqualität
 *     spürbar (Fragmente, Kleinschreibung). Aus einem Pool von ~66 die besten zu
 *     nehmen liegt gemessen ÜBER dem BM25-Stand — BM25 belohnt Wiederholung und
 *     lieferte für „Zeit+haben" Sätze wie „Wir haben Zeit, wir haben Zeit!".
 *  4. **Kehrpfad ab rowid 0, wenn der Pool nicht voll wird.** Ein aufsteigendes
 *     Fenster findet nur Treffer hinter seinem Startpunkt. Ein Paar mit einem
 *     einzigen Beleg weit vorn im Korpus wäre sonst je nach Würfel unauffindbar.
 *
 * **Prefix-Queries (`"haben"*`, Lückenfüller und Klassenraum) sind ausgenommen**
 * und behalten `ORDER BY rank`: dort expandiert FTS5 auf viele Terme, und die
 * Fenster verschlechterten die Messung von 1,2 s auf 9,1 s.
 *
 * ── Flexions-Fallback (2026-08-06) ───────────────────────────────────────────
 * `collocations` wird aus LEMMATISIERTEN Parses gebaut, `belege_fts` indiziert
 * dagegen die OBERFLÄCHENFORMEN der Sätze. Für Paare, die im Deutschen praktisch
 * nur flektiert vorkommen, klafft dort eine Lücke: `digital + Gesundheitsanwendung`
 * hat 463 Belege in der Kollokationstabelle, aber **null** Sätze mit den beiden
 * Grundformen — im Text steht immer „digitale Gesundheitsanwendungen". Dasselbe
 * bei `Krieg + siebenjährig` („Siebenjährigen Krieges"). Die Anzeige sagte dann
 * „Keine Korpusbelege vorhanden", obwohl der Bestand voll davon ist.
 *
 * Deshalb: findet die Suche über die Grundformen GAR NICHTS, läuft ein zweiter
 * Durchgang mit beiden Termen als Phrasen-Präfix. Beide, weil die Flexion in der
 * Regel beide Seiten trifft (Adjektivendung + Genitiv/Plural am Nomen).
 *
 * An 400 echten Kollokationspaaren (frequency ≥ 200, logDice ≥ 6) gemessen:
 *   • 13 % finden über die Grundformen nichts — dort greift der Fallback,
 *   • er repariert davon 35 von 52 (der Rest ist echt selten im Bestand),
 *   • Kosten p50 8 ms · p95 133 ms · max 356 ms (warm; der allererste
 *     Prefix-Lauf nach dem Start kostete einmalig 1,9 s, Cold-Cache).
 *
 * Die übrigen 87 % zahlen NICHTS: der Fallback läuft erst bei null Treffern, und
 * eine erfolglose Fenstersuche kostet gemessen 1–2 ms. Das ist der Grund für die
 * harte Schwelle „exakt null" statt „zu wenige" — better-sqlite3 ist synchron und
 * der Server ein einzelner Prozess, jeder unnötige Prefix-Lauf blockiert alle.
 *
 * Der Jahr-Filter (`year`) läuft ebenfalls in JavaScript über denselben Pool; in
 * SQL kostete er nach dem Sprung 7–8 s, weil FTS5 bis zum nächsten passenden
 * Jahrgang weiterläuft. Der Fallback „unter 2 Treffer → ohne Jahr" gilt
 * unverändert.
 *
 * Das v1-Schema behält `ORDER BY rank`: dort ist der Index klein genug (der
 * Regress kam mit v2), und ein Rollback soll sich exakt wie vorher verhalten.
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
let _maxRowid = null
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
// prepare() NICHT intern, jeder Aufruf kompiliert das SQL neu. Die Statements
// hier liegen auf dem Belege-Hotpath des Spiels (Review 2026-06-10).
//
// Beide Schemata liefern dieselben Spalten: satz, ref, jahr, zitation, lizenz
// (v1 kennt ref/lizenz nicht → NULL). formatQuelle() baut daraus den Anzeige-
// String. Die v2-Joins sind reine PK-/rowid-Lookups (EXPLAIN QUERY PLAN in
// Gate F geprüft). `jahr` wird mitgelesen, weil der Jahr-Filter seit dem
// Latenz-Fix in JavaScript über den Pool läuft und nicht mehr in SQL.
const V2_SELECT = `
  SELECT s.satz AS satz, d.ref AS ref, d.jahr AS jahr, s.doc_id AS doc_id,
         q.zitation AS zitation, q.lizenz AS lizenz
  FROM belege_fts
  JOIN saetze s    ON s.id     = belege_fts.rowid
  JOIN dokumente d ON d.doc_id = s.doc_id
  JOIN quellen q   ON q.quelle = d.quelle
  WHERE belege_fts MATCH ?`

const V1_SELECT = `
  SELECT satz, NULL AS ref, jahr, NULL AS doc_id, zitation, NULL AS lizenz
  FROM belege
  WHERE belege MATCH ?`

let _stmts = null
function stmts() {
  const database = db()
  if (!database) return null
  if (!_stmts) {
    const base = _schema === 'v2' ? V2_SELECT : V1_SELECT
    _stmts = {
      // v1-Pfad, Prefix-Queries und Notnagel: BM25 wie vor dem Latenz-Fix.
      top: database.prepare(`${base} ORDER BY rank LIMIT ?`),
      // v2-Fenster. `auf` läuft die Doclist vom Anfang, `ab` vom Ende — deshalb
      // gibt es beide: so bleibt jedes Fenster nah an „seinem" Ende und billig.
      auf: _schema === 'v2'
        ? database.prepare(`${base} AND belege_fts.rowid > ? LIMIT ?`)
        : null,
      ab: _schema === 'v2'
        ? database.prepare(
          `${base} AND belege_fts.rowid < ? ORDER BY belege_fts.rowid DESC LIMIT ?`)
        : null,
    }
  }
  return _stmts
}

/**
 * Prüft einmalig, ob die geöffnete DB die F2-Tabelle `lemmata_fts` hat.
 * Alte v2-DBs ohne F2 (Rollback, oder vor dem Deploy) liefern false — die
 * Aufrufer fallen dann automatisch komplett auf die Wortform-Suche zurück.
 */
let _hasLemmaFts = null
function hasLemmaFts() {
  if (_hasLemmaFts !== null) return _hasLemmaFts
  const database = db()
  _hasLemmaFts = !!(database && _schema === 'v2' && database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lemmata_fts'")
    .get())
  return _hasLemmaFts
}

// lemmata_fts ist contentless: eine Suche liefert nur rowids (= saetze.id),
// die per PK-Lookup zu vollen Zeilen werden. Dieselben Spalten wie V2_SELECT,
// damit dedupe()/besteBelege()/tokenize()/formatQuelle() unverändert greifen.
const LEMMA_AUF = `
  SELECT lemmata_fts.rowid AS id FROM lemmata_fts
  WHERE lemmata_fts MATCH ? AND lemmata_fts.rowid > ? LIMIT ?`
const LEMMA_AB = `
  SELECT lemmata_fts.rowid AS id FROM lemmata_fts
  WHERE lemmata_fts MATCH ? AND lemmata_fts.rowid < ?
  ORDER BY lemmata_fts.rowid DESC LIMIT ?`
const BY_SATZ_ID = `
  SELECT s.satz AS satz, d.ref AS ref, d.jahr AS jahr, s.doc_id AS doc_id,
         q.zitation AS zitation, q.lizenz AS lizenz
  FROM saetze s
  JOIN dokumente d ON d.doc_id = s.doc_id
  JOIN quellen q   ON q.quelle = d.quelle
  WHERE s.id = ?`

let _lemmaStmts = null
function lemmaStmts() {
  if (!hasLemmaFts()) return null
  if (!_lemmaStmts) {
    const database = db()
    _lemmaStmts = {
      auf: database.prepare(LEMMA_AUF),
      ab: database.prepare(LEMMA_AB),
      bySatzId: database.prepare(BY_SATZ_ID),
    }
  }
  return _lemmaStmts
}

/**
 * Höchste rowid der Belege — die Obergrenze für die Zufalls-Startpunkte.
 * `id` ist INTEGER PRIMARY KEY, `MAX(id)` also ein B-Tree-Seek, kein Scan.
 * Nur im v2-Schema definiert; v1 nutzt keine Fenster. Gilt für `belege_fts`
 * UND `lemmata_fts` gleichermaßen — beide teilen denselben rowid-Raum
 * (`lemmata_fts.rowid` = `saetze.id`, additiv beim F2-Lauf vergeben).
 */
function maxRowid() {
  if (_maxRowid !== null) return _maxRowid
  const database = db()
  _maxRowid = 0
  if (database && _schema === 'v2') {
    try {
      _maxRowid = database.prepare('SELECT MAX(id) AS m FROM saetze').get()?.m ?? 0
    } catch (err) {
      logger.warn({ err }, 'Belege: MAX(id) nicht ermittelbar – Fenstersuche inaktiv')
    }
  }
  return _maxRowid
}

/** FNV-1a, 32 Bit – für reproduzierbare Startpunkte aus einem Schlüssel. */
function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Drei aufsteigende und drei absteigende Fenster. Gemessen über sechs Paare von
// „sehr selten" bis „extrem häufig": Ø 4,3 Korpora bei 151 ms im schlimmsten
// Fall — gegenüber Ø 4,7 bei 967 ms mit BM25. Vier Fenster wären streng
// schlechter gewesen (dieselben 3,2 Korpora wie zwei, aber doppelte Kosten).
const FENSTER_AUF = 3
const FENSTER_AB = 3
const MIN_PRO_FENSTER = 4

// Grenzen der billigen Zonen, aus der Korpus-Lage nach Satz-rowid abgeleitet:
// 0–34 % `gesetze` … `deu_newscrawl`, ab 64 % `wikipedia`. Dazwischen liegen die
// historischen Korpora — teuer zu erreichen und für Gegenwartsbelege zweite Wahl.
const ZONE_AUF_BIS = 0.34
const ZONE_AB_AB = 0.64

/**
 * Die sechs Startpunkte als Anteil an der höchsten rowid.
 * Ohne `seed` gewürfelt, mit `seed` reproduzierbar daraus abgeleitet — das
 * Archiv braucht stabile Belege, weil seine Seiten SSR-gerendert und eine
 * Stunde zwischengespeichert werden.
 */
function fraktionen(seed) {
  const wuerfel = i => (seed == null
    ? Math.random()
    : hash32(`${seed}#${i}`) / 0x1_0000_0000)
  const auf = []
  const ab = []
  for (let i = 0; i < FENSTER_AUF; i++) auf.push(wuerfel(i) * ZONE_AUF_BIS)
  for (let i = 0; i < FENSTER_AB; i++) ab.push(ZONE_AB_AB + wuerfel(100 + i) * (1 - ZONE_AB_AB))
  return { auf, ab }
}

/**
 * Holt einen Pool von etwa `ziel` Belegzeilen für eine fertige FTS-Query.
 *
 * v2 ohne Prefix: sechs Fenster (siehe Modulkopf). Bleibt der Pool darunter —
 *     seltenes Paar, oder alle Fenster lagen hinter den wenigen Treffern —,
 *     kommt ein Durchgang ab rowid 0 dazu. Ohne den wären Belege, die weit vorn
 *     im Korpus liegen, je nach Würfel unauffindbar.
 * v1 und Prefix-Queries: eine BM25-Abfrage wie vor dem Latenz-Fix.
 */
function holePool(query, ziel, { seed = null, prefix = false } = {}) {
  const s = stmts()
  if (!s) return []
  const max = maxRowid()
  if (prefix || !s.auf || !max) return s.top.all(query, ziel)

  const proFenster = Math.max(MIN_PRO_FENSTER, Math.ceil(ziel / (FENSTER_AUF + FENSTER_AB)))
  const { auf, ab } = fraktionen(seed)
  const fenster = [
    ...auf.map(f => s.auf.all(query, Math.floor(max * f), proFenster)),
    ...ab.map(f => s.ab.all(query, Math.floor(max * f), proFenster)),
  ]

  // Reihum einsammeln statt Fenster für Fenster anzuhängen. `besteBelege()`
  // sortiert stabil, bei gleichem `scoreBeleg()` gewinnt also die frühere
  // Pool-Position — hängte man die Fenster hintereinander, fiele die Auswahl bei
  // Punktgleichheit immer in die untere Zone. Reihum ist fair und bleibt
  // deterministisch (wichtig für das Archiv).
  const rows = []
  for (let i = 0; ; i++) {
    let gefunden = false
    for (const f of fenster) {
      if (i < f.length) { rows.push(f[i]); gefunden = true }
    }
    if (!gefunden) break
  }

  if (rows.length < ziel) rows.push(...s.auf.all(query, 0, ziel))
  return rows
}

/**
 * Wie `holePool()`, aber über `lemmata_fts` (Phase F2): dieselbe Fenster-Logik,
 * liefert aber nur `id`s (contentless), die hier per PK-Lookup (`bySatzId`) zu
 * vollen Zeilen im selben Format wie `holePool()` werden. `null` wenn F2 nicht
 * verfügbar ist (Aufrufer prüfen das vorher über `hasLemmaFts()`).
 */
function holePoolLemma(query, ziel, { seed = null } = {}) {
  const s = lemmaStmts()
  const max = maxRowid()
  if (!s || !max) return []

  const proFenster = Math.max(MIN_PRO_FENSTER, Math.ceil(ziel / (FENSTER_AUF + FENSTER_AB)))
  const { auf, ab } = fraktionen(seed)
  const fenster = [
    ...auf.map(f => s.auf.all(query, Math.floor(max * f), proFenster)),
    ...ab.map(f => s.ab.all(query, Math.floor(max * f), proFenster)),
  ]

  const ids = []
  for (let i = 0; ; i++) {
    let gefunden = false
    for (const f of fenster) {
      if (i < f.length) { ids.push(f[i].id); gefunden = true }
    }
    if (!gefunden) break
  }
  if (ids.length < ziel) for (const r of s.auf.all(query, 0, ziel)) ids.push(r.id)

  const rows = []
  for (const id of new Set(ids)) {
    const row = s.bySatzId.get(id)
    if (row) rows.push(row)
  }
  return rows
}

/** Entfernt Sätze, die (aus verschiedenen Quellen oder Fenstern) doppelt kommen. */
function dedupe(rows) {
  const seen = new Set()
  return rows.filter(r => {
    const key = r.satz.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const MONATE = /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/

/**
 * Heuristik-Score: „wirkt das wie ein vollständiger Satz?". Höher = besser.
 * Bestraft typische Korpus-Fragmente (Monats-Reste, Dialog-Präfixe „Name:",
 * Klein-Anfang, Klammer-/Gleichheits-Rauschen) und sehr kurze/lange Sätze.
 *
 * Stand ursprünglich in `course/corpusAdapter.js` und war dort nur für die
 * Kurs-Arbeitsblätter zuständig. Seit dem Latenz-Fix trifft dieselbe Heuristik
 * auch die Auswahl im Spiel und im Archiv — sie ersetzt dort die BM25-Sortierung,
 * die Wiederholung belohnte („Wir haben Zeit, wir haben Zeit!").
 */
export function scoreBeleg(satz) {
  const s = String(satz ?? '').trim()
  if (!s) return -1e9
  let sc = 0
  const wc = s.split(/\s+/).length
  if (wc < 5) sc -= 25
  else if (wc <= 22) sc += 10 - Math.abs(12 - wc) * 0.4
  else sc -= (wc - 22) * 0.6
  if (/[.!?]['"»)\]]?$/.test(s)) sc += 4         // vollständige Satz-Endung
  if (/^[A-ZÄÖÜ]/.test(s)) sc += 2               // Groß-Anfang
  else sc -= 6                                    // Klein-Anfang → Fragment
  if (MONATE.test(s)) sc -= 20                    // „Februar eine … treffen." & Co.
  if (/[=()[\]]/.test(s)) sc -= 8                 // Klammern/Gleichheits-Rauschen
  if (/^\p{Lu}[\wäöüß-]*:/u.test(s)) sc -= 6      // „Kiesinger:" Redner-Präfix
  // Zusammengeklebte Schlagzeilen: „Headline: „Zitat" Nächste Headline …"
  if (/:\s*[„“]/.test(s)) sc -= 14                // Doppelpunkt + öffnendes Zitat
  if (/[“”"]\s+\p{Lu}/u.test(s)) sc -= 10         // schließendes Zitat + Großanfang (Glue)
  return sc
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

// Mindestlänge des Verb-Stamms für den Konjugations-Fallback in matchesLemma
// (siehe dort) — verhindert Kollisionen mit kurzen, unverwandten Wörtern
// ("leben" → Stamm "leb" bliebe sonst zu kurz und würde "lebhaft" markieren).
const VERB_STAMM_MIN_LEN = 4

/**
 * Prüft ob ein bereinigtes Wort zu einem Lemma gehört.
 * Kurze Lemmata (< 4 Zeichen) werden exakt verglichen, um False Positives
 * zu vermeiden ("er" würde sonst "erklären", "erhöhen" usw. markieren).
 * Längere Lemmata nutzen startsWith für Flexionsformen, die den Lemma-Stamm
 * ERGÄNZEN ("Tisch" → "Tisches").
 *
 * Zusätzlicher Verb-Fallback (gefunden 2026-08-19, sichtbar geworden durch die
 * F2-Lemma-Suche: die findet jetzt deutlich mehr konjugierte Belege, deren
 * Hervorhebung vorher schlicht nie geprüft wurde): Deutsche Verbkonjugation
 * ERSETZT die Infinitiv-Endung „-en"/„-n" oft, statt sie zu ergänzen —
 * "verblassen" → "verblasst" ist KEIN startsWith-Treffer, weil die konjugierte
 * Form kürzer ist als der Infinitiv. Fallback: Infinitiv-Endung abschneiden und
 * den verbleibenden Stamm ebenfalls per startsWith prüfen, aber erst ab
 * `VERB_STAMM_MIN_LEN` Zeichen Stammlänge.
 */
function matchesLemma(wordLow, lemmaLow) {
  if (!lemmaLow) return false
  if (lemmaLow.length < 4) return wordLow === lemmaLow
  if (wordLow.startsWith(lemmaLow)) return true
  const stamm = lemmaLow.endsWith('en') ? lemmaLow.slice(0, -2)
    : lemmaLow.endsWith('n') ? lemmaLow.slice(0, -1)
    : null
  return !!stamm && stamm.length >= VERB_STAMM_MIN_LEN && wordLow.startsWith(stamm)
}

/**
 * Tokenisiert einen Satz und markiert Wörter, die mit lemma oder collocate beginnen.
 * Gibt das DWDS-kompatible tokens-Format zurück: [{w, ws, hl}]
 *
 * `matchesLemma()` vergleicht per `startsWith` (ab vier Zeichen), markiert
 * „Rechnungen" für „Rechnung" also unabhängig davon, ob der Satz über die
 * Lemma- oder die Wortform-Suche gefunden wurde.
 */
function tokenize(sentence, lemma, collocate) {
  const formen = [lemma, collocate]
    .map(w => String(w ?? '').toLowerCase())
    .filter(Boolean)

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

const escFts = s => String(s).replace(/"/g, '""')

/**
 * Baut den FTS5-Ausdruck für EIN Suchwort. Immer als Phrase gequotet – auch im
 * Prefix-Fall. Ein nacktes `e-mail*` wäre ein FTS5-Syntaxfehler; `"e-mail"*`
 * ist ein gültiges Phrasen-Präfix. Seit F7 (Bindestrich-Lemmata zugelassen)
 * ist das kein Randfall mehr.
 */
function ftsTerm(word, { prefix = false } = {}) {
  const low = String(word ?? '').toLowerCase()
  if (!low) return '""'
  return prefix ? `"${escFts(low)}"*` : `"${escFts(low)}"`
}

/**
 * Baut einen FTS5-MATCH-Ausdruck aus lemma + collocate.
 * FTS5 sucht case-insensitiv nach Wort-Tokens. Dient sowohl der Lemma- als
 * auch der Wortform-Suche (Terme sind in beiden Fällen einfache Phrasen).
 */
function buildFtsQuery(lemma, collocate, opts = {}) {
  return `${ftsTerm(lemma, opts)} AND ${ftsTerm(collocate, opts)}`
}

// Ab dieser Wortlänge ist ein Prefix-Term vertretbar. Darunter wird die Menge
// der zufälligen Mitläufer zu groß („Tor"* fände Torte, Tornado, Torpedo).
const PREFIX_MIN_LEN = 4

/**
 * FTS5-Query mit Prefix-Matching für den Kollokator.
 * Findet auch flektierte Formen: spannend* → spannende/spannenden/spannendem.
 * Wird für den Lückenfüller-Modus verwendet, wo blankCollocate+startsWith
 * die gefundenen Formen zuverlässig dem Lemma zuordnet.
 *
 * Mindestlänge 4 Zeichen, damit kurze Wörter nicht zu viele False Positives erzeugen.
 */
function buildFtsQueryPrefix(lemma, collocate, opts = {}) {
  return `${ftsTerm(lemma, opts)} AND ${ftsTerm(collocate, { ...opts, prefix: String(collocate).length >= PREFIX_MIN_LEN })}`
}

/**
 * Wie `buildFtsQuery`, aber BEIDE Terme als Phrasen-Präfix — der Flexions-Fallback
 * aus dem Modulkopf. Beide, weil die deutsche Flexion in der Regel beide Seiten
 * trifft: „digitale Gesundheitsanwendungen", „Siebenjährigen Krieges".
 *
 * Die Hervorhebung zieht automatisch mit: `matchesLemma()` vergleicht Wörter ab
 * vier Zeichen ohnehin per `startsWith`, markiert „digitale" für „digital" also
 * schon heute. Der Fallback nutzt dieselbe Schwelle, damit Suche und Anzeige
 * nicht auseinanderlaufen — sonst fände die Query Sätze, in denen die Anzeige
 * nichts zu markieren hätte (leere KWiC-Zerlegung im Archiv).
 */
function buildFtsQueryFlexion(lemma, collocate, opts = {}) {
  const mitPrefix = w => ({ ...opts, prefix: String(w ?? '').length >= PREFIX_MIN_LEN })
  return `${ftsTerm(lemma, mitPrefix(lemma))} AND ${ftsTerm(collocate, mitPrefix(collocate))}`
}

// Wie groß der Pool je angefragtem Beleg sein soll, und wie groß mindestens.
// Zwölf mal `limit` sind bei limit=5 die gemessenen ~64 Zeilen (2–11 ms).
// Dieselbe Schwelle entscheidet jetzt auch, ob der Lemma-Pool (Tier 1) allein
// ausreicht oder die Wortform-Suche (Tier 2/3) noch ergänzen muss.
const POOL_JE_BELEG = 12
const POOL_MIN = 48

/**
 * Zwei-Term-Suche (lemma + collocate), dreistufig, jede Stufe nur bei Bedarf:
 *
 *  1. **Lemma-Suche** (`lemmata_fts`, Phase F2) — findet Sätze unabhängig von
 *     Flexion und historischer Schreibung (beides steckt schon in der
 *     gespeicherten Lemma-Folge). Übersprungen, wenn F2 nicht verfügbar ist.
 *  2. **Wortform-Suche, exakt** (`belege_fts`) — nur wenn Tier 1 den Pool nicht
 *     bis `POOL_MIN` füllt (z. B. weil `annotate_lemmata.py` ohne Dependenz-
 *     parser lief und ein trennbares Verb nicht rekonstruiert hat).
 *  3. **Wortform-Suche, Flexions-Fallback** (Prefix auf beiden Seiten) — nur
 *     wenn Tier 1+2 zusammen GAR NICHTS finden. Deckt die Fälle ab, in denen
 *     ein Paar praktisch nur flektiert vorkommt („digitale
 *     Gesundheitsanwendungen") und auch die Lemma-Suche aus Tagging-Gründen
 *     leer blieb.
 *
 * @param {string} lemma
 * @param {string} collocate
 * @param {number} ziel    Poolgröße für Tier 1/2
 * @param {{seed?: string}} opts
 */
function holeZweiTermPool(lemma, collocate, ziel, { seed = null } = {}) {
  let pool = hasLemmaFts()
    ? holePoolLemma(buildFtsQuery(lemma, collocate), ziel, { seed })
    : []
  if (pool.length < POOL_MIN) {
    const exakt = holePool(buildFtsQuery(lemma, collocate), ziel, { seed })
    pool = dedupe([...pool, ...exakt])
  }
  if (pool.length === 0) {
    pool = holePool(buildFtsQueryFlexion(lemma, collocate), ziel, { seed, prefix: true })
  }
  return pool
}

// Wie viele Belege je Korpus erlaubt sind, in Runden aufsteigend. Erst wenn eine
// Runde `limit` nicht füllt, wird die nächste großzügiger.
const QUELLEN_RUNDEN = [1, 2, Infinity]

/**
 * Nimmt die `limit` besten Sätze eines Pools nach `scoreBeleg()` — aber höchstens
 * einen je Dokument und möglichst breit über die Korpora gestreut.
 *
 * Ohne diese Regeln läuft die Fenstersuche ins Leere. Beides ist gemessen und
 * jedes für sich aufgetreten:
 *  - **je Dokument höchstens einer**: sonst standen drei von fünf Belegen für
 *    „Zeit+haben" aus derselben Bundestagssitzung;
 *  - **Korpus-Staffelung**: sonst kamen vier von fünf aus Wikipedia — das ist mit
 *    36 % der Sätze das größte Korpus und liefert sauber gebaute Sätze, gewinnt
 *    also die `scoreBeleg()`-Sortierung, wenn man sie gewähren lässt.
 *
 * Reichen die Dokumente oder Korpora nicht für `limit`, wird mit den besten
 * übrigen Sätzen aufgefüllt — ein seltenes Paar soll nicht weniger Belege
 * bekommen als vorher. v1 kennt keine doc_id (NULL) und landet direkt dort.
 */
function besteBelege(rows, limit) {
  const sortiert = [...rows].sort((a, b) => scoreBeleg(b.satz) - scoreBeleg(a.satz))
  const gewaehlt = []
  const dokumente = new Set()
  const jeQuelle = new Map()

  for (const maxJeQuelle of QUELLEN_RUNDEN) {
    for (const r of sortiert) {
      if (gewaehlt.length >= limit) return gewaehlt
      if (r.doc_id == null || dokumente.has(r.doc_id)) continue
      const quelle = r.zitation ?? ''
      if ((jeQuelle.get(quelle) ?? 0) >= maxJeQuelle) continue
      dokumente.add(r.doc_id)
      jeQuelle.set(quelle, (jeQuelle.get(quelle) ?? 0) + 1)
      gewaehlt.push(r)
    }
  }

  for (const r of sortiert) {
    if (gewaehlt.length >= limit) break
    if (!gewaehlt.includes(r)) gewaehlt.push(r)
  }
  return gewaehlt
}

/**
 * Sucht bis zu `limit` Belegsätze für ein Kollokationspaar.
 *
 * Der Pool kommt aus Zufallsfenstern (siehe Modulkopf), die Auswahl daraus
 * trifft `scoreBeleg()`. `year` filtert den Pool in JavaScript auf ±15 Jahre;
 * bleiben dabei unter zwei Belege übrig, gilt wie bisher der ungefilterte Pool.
 *
 * @param {string} lemma     - Stichwort (z.B. "Tisch")
 * @param {string} collocate - Kollokator (z.B. "rund")
 * @param {object} opts      - { limit, year }
 * @returns {Array} - [{tokens, quelle}] im DWDS-kompatiblen Format
 */
export function fetchBelege(lemma, collocate, { limit = 5, year = null } = {}) {
  const s = stmts()
  if (!s) return []

  const ziel = Math.max(limit * POOL_JE_BELEG, POOL_MIN)

  try {
    const unique = dedupe(holeZweiTermPool(lemma, collocate, ziel))

    let auswahl = unique
    if (year) {
      const y = parseInt(year)
      const imBand = unique.filter(r => r.jahr != null && r.jahr >= y - 15 && r.jahr <= y + 15)
      if (imBand.length >= 2) auswahl = imBand
    }

    return besteBelege(auswahl, limit).map(r => ({
      tokens: tokenize(r.satz, lemma, collocate),
      quelle: formatQuelle(r),
    }))
  } catch (err) {
    logger.warn({ err }, `Belege-Suche fehlgeschlagen: ${lemma}+${collocate}`)
    return []
  }
}

/**
 * Gibt rohe Belegsätze zurück (ohne Tokenisierung) – für Lückenfüller und Kurs.
 *
 * Bewusst OHNE `scoreBeleg()`-Vorsortierung: beide Aufrufer haben ein eigenes,
 * strengeres Kriterium (der Lückenfüller den längsten blankbaren Satz zwischen
 * 50 und 220 Zeichen, der Kurs-Adapter seine eigene `scoreBeleg()`-Sortierung).
 * Eine Vorsortierung hier würde ihnen die Auswahl vorwegnehmen — die besten
 * `scoreBeleg()`-Sätze liegen um zwölf Wörter, der Lückenfüller will die langen.
 *
 * `prefixCollocate` schaltet die Fenstersuche der Wortform-Ebene ab (siehe
 * Modulkopf): bei einer Prefix-Query wäre sie langsamer als BM25, nicht
 * schneller. Betrifft nur die Wortform-Stufe — die Lemma-Suche (Tier 1)
 * braucht kein Prefix, weil sie ohnehin auf der Grundform sucht.
 */
export function fetchBelegeRaw(lemma, collocate, { limit = 20, prefixCollocate = false } = {}) {
  const s = stmts()
  if (!s) return []

  try {
    let rows = hasLemmaFts()
      ? holePoolLemma(buildFtsQuery(lemma, collocate), limit)
      : []
    if (rows.length < limit) {
      const bau = prefixCollocate ? buildFtsQueryPrefix : buildFtsQuery
      const surface = holePool(bau(lemma, collocate), limit, { prefix: prefixCollocate })
      rows = dedupe([...rows, ...surface])
    }

    return dedupe(rows)
      .slice(0, limit)
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
 * Bewusst KEIN Kollokator-Match, damit hier kein Spiel-Lösungsset entsteht; es
 * sind authentische Korpus-Belege des Worts.
 *
 * **Deterministisch**: Die Fenster-Startpunkte werden aus dem Lemma abgeleitet,
 * nicht gewürfelt. Dieselbe Wortseite liefert damit immer dieselben Belege —
 * Voraussetzung für den SSR-/HTTP-Cache und dafür, dass eine gemeldete Seite
 * reproduzierbar bleibt.
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
  const ziel = Math.max(limit * POOL_JE_BELEG, POOL_MIN)
  const seed = String(lemma).toLowerCase()
  try {
    let rows = hasLemmaFts()
      ? holePoolLemma(ftsTerm(lemma), ziel, { seed })
      : []
    if (rows.length < POOL_MIN) {
      const surface = holePool(ftsTerm(lemma), ziel, { seed })
      rows = dedupe([...rows, ...surface])
    }
    return besteBelege(dedupe(rows), limit).map(r => {
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
