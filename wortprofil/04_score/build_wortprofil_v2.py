"""
Phase 4+5 (v2) – logDice berechnen & DWDS-kompatible Lookup-DB bauen

Baut build_wortprofil.py gemäß planning/DB-Neuaufbau.md (Abschnitt 3.3) zur v2
aus. Die alten Skripte (build_wortprofil.py, build_wortprofil_fast.py) und die
alte 05_db/wortprofil.db bleiben unangetastet (Grundregel „nichts in-place").

Eingabe:  03_deps/triples_v2.db   (Schema §3.2: … quelle, dep_case, dep_number)
Ausgabe:  05_db/wortprofil_v2.db  (Schema §3.3)

Aufruf:
  python build_wortprofil_v2.py                    # min_count=3 (Standard)
  python build_wortprofil_v2.py --min-count 5      # F6-A/B-Test (Phase C)
  python build_wortprofil_v2.py --reset            # Ziel-DB neu anlegen
  python build_wortprofil_v2.py --deps-db X --out-db Y   # Pfade überschreiben
                                                         # (Gate-A-/Subset-Builds)

Änderungen gegenüber v1 (§3.3):
  1. PRED in INVERTIBLE  → echte ~PRED-Einträge (Beschreibung „ist Prädikativ
     von"). Löst „grün (Adj.) ohne Verben" (Golden Query #3); der PRED_REV-
     Sonderweg in server/wortprofil.js kann in Phase G entfallen.
  2. Neue Spalten dep_case / dep_number in collocations, aus triples_v2
     durchgereicht (häufigster Wert je Kollokation, count-gewichtet). Für
     abgeleitete INVERSE Relationen leer ('') — der syntaktische Kasus des
     ursprünglichen Heads wird beim Parsen nicht erfasst. App-seitig ignorierbar
     (abwärtskompatibel, Abfragen sind spaltenbasiert).
  3. Neue Tabelle lemma_corpus_freq(lemma, pos, quelle, freq) — je Korpus die
     Summe der counts, in denen ein Lemma als Head ODER Dep an einer Relation
     teilnimmt. ⚠️ Bewusste NÄHERUNG: Das ist Kollokations-Teilnahme-Häufigkeit,
     NICHT die reine Token-Frequenz (nur Lemmata in erfassten Dependenzrelationen
     werden gezählt, ein Triple trägt zu Head- UND Dep-Lemma bei). Guter Proxy für
     den Archiv-Chip „Top-10 · Vollverben · Bundestag" bei Inhaltswörtern; die
     exakte Token-Frequenz liefert erst Phase F2 (Tagger-Lauf). So akzeptiert
     (User, 2026-07-22).
  4. build_info erweitert um Korpusliste, Pipeline-Version, Git-Commit, Quell-DB.

Marginals: über ALLE triples (nicht nur die gefilterten) — wie in der zuletzt
produktiv genutzten build_wortprofil_fast.py, damit die logDice-Werte zur
bestehenden Produktions-DB konsistent bleiben.

logDice-Formel:  logDice(a, b) = 14 + log2( 2 * f_ab / (f_a + f_b) )
Referenz: Rychlý (2008), Kilgarriff & Tugwell (2001)

── Phase E (2026-08-03): Umbau auf Streaming, keine externen Sortierungen ────
triples_v2.db ist WITHOUT ROWID mit PK
(head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr) — die
Zeilen liegen physisch in dieser Reihenfolge. Für 526 Mio. Zeilen gilt:

  * `GROUP BY head_lemma, head_pos` ist ein PK-Präfix → streamt.
  * `GROUP BY dep_lemma, dep_pos` und das alte
    `GROUP BY … , dep_case, dep_number ORDER BY … c DESC` in iter_collocations
    sind KEINE Präfixe → jeweils ein voller externer Sortierdurchlauf über
    526 Mio. Zeilen (zweistellige GB Temp-Dateien, Stunden).

Beides wird jetzt in Python beim sequenziellen Scan aggregiert (`SCAN triples`,
kein TEMP B-TREE — per EXPLAIN QUERY PLAN geprüft). Gegen die alten
GROUP-BY-Abfragen auf einer echten Datenscheibe der Voll-DB verifiziert:
f_head, f_dep und die Zahl der Kollokations-Keys ≥ min_count sind identisch.

Zwei sequenzielle Durchläufe:
  Pass 1  Marginals f_head/f_dep + lemma_corpus_freq-Aggregat (RAM-Dicts),
          Ergebnis als Cache-Datei (--marginals-cache) → wiederaufnahmefähig.
  Pass 2  Kollokationen gruppieren, logDice rechnen, schreiben.

`PRAGMA temp_store` bleibt auf FILE (Standard) und TMP/TEMP/SQLITE_TMPDIR
zeigen auf --tmp-dir: MEMORY war für das 1-%-Subset der Phase C richtig, würde
bei dieser Datenmenge aber den RAM sprengen. Windows ermittelt SQLites
Temp-Verzeichnis über TMP/TEMP, nicht nur über SQLITE_TMPDIR.
"""

import argparse
import math
import os
import pickle
import shutil
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

PIPELINE_VERSION = "v2"

# Temp-Verzeichnis für SQLite (Betriebsregel 3): NICHT auf das Systemlaufwerk.
TMP_DIR_DEFAULT = Path(__file__).parent.parent / "_tmp"

# Abbruchschwelle für freien Platz auf dem Ziel-Laufwerk (Betriebsregel 1).
MIN_FREE_GB = 10.0

# Fortschritts-Ausgabe alle N gelesenen Zeilen
PROGRESS_EVERY = 20_000_000


def redirect_tmp(tmp_dir: Path):
    """TMP/TEMP/TMPDIR/SQLITE_TMPDIR auf tmp_dir umlenken.

    Muss VOR dem ersten sqlite3.connect passieren. Auf Windows liest SQLite
    TMP/TEMP — SQLITE_TMPDIR allein genügt dort nicht.
    """
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def free_gb(pfad: Path) -> float:
    ziel = pfad if pfad.exists() else pfad.parent
    return shutil.disk_usage(ziel).free / 2**30


def rss_gb() -> float:
    """Resident-Set-Size in GiB (0.0 wenn psutil fehlt)."""
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss / 2**30
    except Exception:
        return 0.0

DEPS_DB_DEFAULT = Path(__file__).parent.parent / "03_deps" / "triples_v2.db"
OUT_DB_DEFAULT  = Path(__file__).parent.parent / "05_db"   / "wortprofil_v2.db"

# ── Filter-Parameter ────────────────────────────────────────────────────────
MIN_COUNT = 3    # Mindest-Kookkurrenz-Häufigkeit (F6: 3 vs. 5 → Phase C)
MIN_DICE  = 0.0  # logDice-Schwellwert (0 = alle positiven)

# ── Relation-Beschreibungen ──────────────────────────────────────────────────
REL_DESC = {
    "SUBJA":  "Subjekt (aktiv)",
    "SUBJP":  "Subjekt (passiv)",
    "OBJA":   "Akkusativobjekt",
    "OBJD":   "Dativobjekt",
    "ATTR":   "Adjektivattribut",
    "GMOD":   "Genitivattribut",
    "KON":    "Koordination",
    "ADV":    "Adverbialbestimmung",
    "PRED":   "Prädikativ",
    "PP":     "Präpositionalphrase",
    # Inverse Relationen
    "~SUBJA": "ist Subjekt von",
    "~OBJA":  "ist Akkusativobjekt von",
    "~OBJD":  "ist Dativobjekt von",
    "~ATTR":  "ist Adjektivattribut von",
    "~GMOD":  "ist Genitivattribut von",
    "~ADV":   "modifiziert (Adverb)",
    "~PRED":  "ist Prädikativ von",     # NEU (§3.3)
}

# Welche Relationen invertiert werden. NEU: PRED (§3.3) — erzeugt ~PRED-Einträge.
# PP nicht (semantisch unklar). KON ist bereits im Parser bidirektional.
INVERTIBLE = {"SUBJA", "OBJA", "OBJD", "ATTR", "GMOD", "ADV", "PRED"}


def git_commit() -> str:
    """Kurzer Git-Commit-Hash der Skripte (für build_info). Fallback 'unbekannt'."""
    try:
        out = subprocess.run(
            ["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        if out.returncode == 0:
            return out.stdout.strip() or "unbekannt"
    except Exception:
        pass
    return "unbekannt"


def init_wortprofil_db(conn: sqlite3.Connection, cache_mb: int = 2048):
    conn.execute("PRAGMA page_size=16384")       # Größere Pages: weniger I/O
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(f"PRAGMA cache_size=-{cache_mb * 1024}")
    # temp_store bewusst FILE (nicht MEMORY): Phase C setzte MEMORY für das
    # 1-%-Subset — bei 526 Mio. Zeilen würde eine externe Sortierung im RAM die
    # Maschine sprengen. Die teuren Sortierungen sind ohnehin durch
    # Streaming-Aggregation ersetzt (siehe Modul-Docstring); FILE ist die
    # Absicherung für alles, was SQLite doch noch sortieren will. Zielverzeichnis
    # kommt aus redirect_tmp() (TMP/TEMP, Windows-Falle).
    conn.execute("PRAGMA temp_store=FILE")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS collocations (
            id                   INTEGER PRIMARY KEY,
            lemma                TEXT    NOT NULL,
            pos                  TEXT    NOT NULL,
            relation             TEXT    NOT NULL,
            relation_full        TEXT    NOT NULL,
            relation_description TEXT    NOT NULL,
            form                 TEXT    NOT NULL,
            dep_lemma            TEXT    NOT NULL,
            dep_pos              TEXT    NOT NULL,
            prep                 TEXT    NOT NULL DEFAULT '',
            frequency            INTEGER NOT NULL,
            logDice              REAL    NOT NULL,
            dep_case             TEXT    NOT NULL DEFAULT '',   -- NEU §3.3
            dep_number           TEXT    NOT NULL DEFAULT ''    -- NEU §3.3
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lemma_corpus_freq (
            lemma  TEXT    NOT NULL,
            pos    TEXT    NOT NULL,
            quelle TEXT    NOT NULL,
            freq   INTEGER NOT NULL,
            PRIMARY KEY (lemma, pos, quelle)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS build_info (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()


# Index-Satz wie in der produktiv genutzten build_wortprofil_fast.py, damit die
# App (server/wortprofil.js, Archiv fetchSyntagmaticPatterns) keinen Regress
# erleidet. Zusätzlicher (…, relation, …)-Index für relation-gefilterte
# Hot-Path-Queries (aus der kanonischen build_wortprofil.py).
INDIZES = [
    ("idx_collocations_lookup",
     "CREATE INDEX IF NOT EXISTS idx_collocations_lookup "
     "ON collocations (lemma, pos, relation, logDice DESC)"),
    ("idx_lemma_pos",
     "CREATE INDEX IF NOT EXISTS idx_lemma_pos ON collocations (lemma, pos)"),
    ("idx_relation_full",
     "CREATE INDEX IF NOT EXISTS idx_relation_full ON collocations (relation_full)"),
    ("idx_collocations_top",
     "CREATE INDEX IF NOT EXISTS idx_collocations_top "
     "ON collocations (lemma, pos, logDice DESC, frequency, dep_pos)"),
    # Chip „Top-N je (Korpus, POS)": nach freq DESC gefiltert auf quelle+pos.
    ("idx_lcf_quelle",
     "CREATE INDEX IF NOT EXISTS idx_lcf_quelle "
     "ON lemma_corpus_freq (quelle, pos, freq DESC)"),
]


def erzeuge_indizes(conn: sqlite3.Connection, out_db: Path):
    """Indizes NACH dem Bulk-Insert anlegen.

    Vorher angelegte Indizes bedeuten bei Dutzenden Mio. Zeilen wahlfreie
    Schreibzugriffe über den ganzen Lauf — genau der Effekt, der in Phase D den
    naiven Merge von 73 auf 33 Mio. Zeilen/h einbrechen ließ (Betriebsregel 7).
    Nachträglich baut SQLite jeden Index über einen sequenziellen Tabellen-Scan
    plus eine externe Sortierung im umgelenkten Temp-Verzeichnis.
    """
    print("Erzeuge Indizes (nach dem Bulk-Insert) ...", flush=True)
    for name, sql in INDIZES:
        t0 = time.time()
        conn.execute(sql)
        conn.commit()
        print(f"  {name}: {(time.time()-t0)/60:.1f} min | "
              f"frei {free_gb(out_db):.1f} GB", flush=True)


# Streaming-Reihenfolge = PK-Präfix von triples_v2 (WITHOUT ROWID).
# EXPLAIN QUERY PLAN liefert dafür „SCAN triples" ohne TEMP B-TREE.
PK_ORDER = "head_lemma, head_pos, relation, dep_lemma, dep_pos, prep"


def _fortschritt(n: int, t0: float, label: str):
    dt = max(time.time() - t0, 1e-9)
    print(f"  [{label}] {n:,} Zeilen | {n/dt/1000:,.0f}k Zeilen/s | "
          f"{dt/60:.1f} min | RSS {rss_gb():.1f} GiB", flush=True)


def lade_marginals(conn: sqlite3.Connection, min_count: int,
                   mit_lcf: bool = True,
                   max_rss_gb: float = 0.0) -> tuple[dict, dict, dict, dict]:
    """Pass 1: EIN sequenzieller Scan über alle Triples liefert

      f_head[(lemma, pos)]           Marginalfrequenz in Head-Rolle
      f_dep[(lemma, pos)]            Marginalfrequenz in Dep-Rolle
      lcf[(lemma, pos, quelle)]      lemma_corpus_freq-Aggregat (Head + Dep)
      stats                          Zeilen, Kollokations-Keys, Keys >= min_count

    Ersetzt zwei `GROUP BY`-Abfragen, von denen eine (`dep_lemma, dep_pos`) kein
    PK-Präfix ist und über 526 Mio. Zeilen extern sortiert werden müsste.
    Gegen beide Original-Abfragen auf einer echten Datenscheibe verifiziert.
    """
    print(f"Pass 1: Marginals{' + lemma_corpus_freq' if mit_lcf else ''} "
          f"(ein sequenzieller Scan) ...", flush=True)
    f_head: dict[tuple, int] = {}
    f_dep: dict[tuple, int] = {}
    lcf: dict[tuple, int] = {}
    n = keys = keys_min = 0
    cur_key = None
    total = 0
    t0 = time.time()

    # sqlite3 liefert für jede Zeile FRISCHE str-Objekte. head_pos/dep_pos haben
    # aber nur ~5, quelle nur ~34 verschiedene Werte — die stecken sonst
    # millionenfach als Duplikat in den Dict-Keys. Ein kleiner Intern-Cache je
    # Spalte macht daraus je ein einziges Objekt und spart bei ~100 Mio.
    # Dict-Einträgen mehrere GB RAM. Für die Lemmata lohnt es nicht: dort ist
    # jeder Wert nahezu einzigartig, der Cache würde selbst zum Speicherfresser.
    i_pos: dict[str, str] = {}
    i_quelle: dict[str, str] = {}

    cur = conn.execute(
        f"SELECT head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, count "
        f"FROM deps.triples ORDER BY {PK_ORDER}")
    for hl, hp, rel, dl, dp, prep, quelle, c in cur:
        n += 1
        hp = i_pos.setdefault(hp, hp)
        dp = i_pos.setdefault(dp, dp)
        k = (hl, hp)
        f_head[k] = f_head.get(k, 0) + c
        k = (dl, dp)
        f_dep[k] = f_dep.get(k, 0) + c
        if mit_lcf:
            quelle = i_quelle.setdefault(quelle, quelle)
            k = (hl, hp, quelle)
            lcf[k] = lcf.get(k, 0) + c
            k = (dl, dp, quelle)
            lcf[k] = lcf.get(k, 0) + c
        key = (hl, hp, rel, dl, dp, prep)
        if key != cur_key:
            if cur_key is not None:
                keys += 1
                if total >= min_count:
                    keys_min += 1
            cur_key = key
            total = 0
        total += c
        if n % PROGRESS_EVERY == 0:
            _fortschritt(n, t0, "Pass 1")
            # Sauber abbrechen statt vom OOM-Killer beendet zu werden — ein
            # halber Lauf ohne Diagnose kostet mehr als ein früher Stopp.
            if max_rss_gb and rss_gb() > max_rss_gb:
                raise MemoryError(
                    f"Pass 1: RSS {rss_gb():.1f} GiB über der Grenze von "
                    f"{max_rss_gb} GiB bei {n:,} gelesenen Zeilen. Optionen: "
                    f"--no-lcf (lemma_corpus_freq weglassen, spart den größten "
                    f"Dict) oder --max-rss-gb anheben (64 GB RAM insgesamt).")
    if cur_key is not None:
        keys += 1
        if total >= min_count:
            keys_min += 1

    stats = {
        "zeilen": n,
        "kollokations_keys": keys,
        "kollokations_keys_min": keys_min,
        "f_head_keys": len(f_head),
        "f_dep_keys": len(f_dep),
        "lcf_keys": len(lcf),
        "pass1_sekunden": round(time.time() - t0, 1),
        "pass1_rss_gib": round(rss_gb(), 2),
    }
    print(f"  {len(f_head):,} Head-Lemmata | {len(f_dep):,} Dep-Lemmata | "
          f"{len(lcf):,} lcf-Keys")
    print(f"  Kollokations-Keys: {keys:,} total, {keys_min:,} mit count >= {min_count} "
          f"({keys_min/max(keys,1)*100:.1f} %)")
    print(f"  Pass 1: {stats['pass1_sekunden']/60:.1f} min, RSS {stats['pass1_rss_gib']:.1f} GiB")
    return f_head, f_dep, lcf, stats


def berechne_logdice(f_ab: int, f_a: int, f_b: int) -> float:
    """logDice = 14 + log2(2 * f_ab / (f_a + f_b))"""
    if f_a + f_b == 0:
        return -99.0
    return 14.0 + math.log2(2.0 * f_ab / (f_a + f_b))


def _bestes_case_number(varianten: dict) -> tuple:
    """Häufigstes (dep_case, dep_number)-Paar einer Kollokation.

    Bei niederfrequenten Paaren ist der Spitzenwert oft ein Gleichstand (an einer
    echten Datenscheibe gemessen: 13 von 400 Kollokationen). Das alte SQL
    (`ORDER BY … c DESC LIMIT 1`) entschied solche Fälle willkürlich und nicht
    reproduzierbar. Reihenfolge hier: höherer count, dann ein GEFÜLLTER Kasus vor
    einem leeren (der gefüllte trägt Information, die die App anzeigen kann),
    dann lexikografisch → deterministisch und über Builds hinweg stabil.
    """
    return max(varianten.items(),
               key=lambda kv: (kv[1], kv[0][0] != "", kv[0][1] != "", kv[0]))[0]


def iter_collocations(conn: sqlite3.Connection, min_count: int):
    """Pass 2: streamt je Kollokation (Gesamt-count + häufigster dep_case/dep_number).

    Das alte `GROUP BY … , dep_case, dep_number ORDER BY … , c DESC` war KEIN
    PK-Präfix (dep_case/dep_number stehen nicht im Primärschlüssel) und hätte über
    526 Mio. Zeilen extern sortiert werden müssen. Stattdessen wird in
    PK-Reihenfolge gescannt (`SCAN triples`, keine Sortierung) und in Python
    gruppiert:

      * Gesamt-count  = Summe der counts aller Zeilen des Keys,
      * dep_case/dep_number = das (case, number)-Paar mit der höchsten
        count-Summe innerhalb des Keys — semantisch identisch zum alten
        „erste Zeile nach c DESC".

    Speicherarm: gepuffert wird nur ein kleines Dict je Key-Gruppe.
    """
    cur_key = None
    total = 0
    varianten: dict[tuple, int] = {}
    n = 0
    t0 = time.time()
    cur = conn.execute(
        f"SELECT head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, "
        f"dep_case, dep_number, count FROM deps.triples ORDER BY {PK_ORDER}")
    for hl, hp, rel, dl, dp, prep, dcase, dnum, c in cur:
        n += 1
        key = (hl, hp, rel, dl, dp, prep)
        if key != cur_key:
            if cur_key is not None and total >= min_count:
                best = _bestes_case_number(varianten)
                yield (*cur_key, total, best[0], best[1])
            cur_key = key
            total = 0
            varianten = {}
        total += c
        v = (dcase, dnum)
        varianten[v] = varianten.get(v, 0) + c
        if n % PROGRESS_EVERY == 0:
            _fortschritt(n, t0, "Pass 2")
    if cur_key is not None and total >= min_count:
        best = max(varianten.items(), key=lambda kv: kv[1])[0]
        yield (*cur_key, total, best[0], best[1])


def baue_lemma_corpus_freq(conn: sqlite3.Connection, lcf: dict) -> int:
    """lemma_corpus_freq(lemma, pos, quelle, freq) aus dem Pass-1-Aggregat schreiben.

    Die frühere SQL-Variante (`UNION ALL` beider Rollen + `GROUP BY lemma, pos,
    quelle`) hätte 1,05 Mrd. Zeilen extern sortieren müssen — kein PK-Präfix.
    Das Aggregat entsteht stattdessen gratis im Pass-1-Scan; hier wird es nur
    noch in Schlüsselreihenfolge eingefügt (sequenzielle Index-Anhänge statt
    wahlfreier Schreibzugriffe, Betriebsregel 7).
    """
    print(f"Schreibe lemma_corpus_freq ({len(lcf):,} Zeilen, sortiert) ...", flush=True)
    conn.execute("DELETE FROM lemma_corpus_freq")
    t0 = time.time()
    CHUNK = 200_000
    batch = []
    n = 0
    for key in sorted(lcf):
        batch.append((key[0], key[1], key[2], lcf[key]))
        if len(batch) >= CHUNK:
            conn.executemany(
                "INSERT INTO lemma_corpus_freq (lemma, pos, quelle, freq) VALUES (?,?,?,?)",
                batch)
            n += len(batch)
            batch.clear()
    if batch:
        conn.executemany(
            "INSERT INTO lemma_corpus_freq (lemma, pos, quelle, freq) VALUES (?,?,?,?)",
            batch)
        n += len(batch)
    conn.commit()
    print(f"  {n:,} Zeilen in {(time.time()-t0)/60:.1f} min", flush=True)
    return conn.execute("SELECT COUNT(*) FROM lemma_corpus_freq").fetchone()[0]


# Bytes je Zeile — GEMESSEN, nicht geschätzt (Betriebsregel 1: in Phase D lag die
# Schätzung um Faktor 2 daneben und das Laufwerk lief voll).
#
# Messung 2026-08-03 an einem echten Probe-Build über 12 vollständige
# head_lemma-Bereiche der Voll-DB (69.065.226 Triples = 13,12 % der Zeilen; weil
# ganze head-Gruppen kopiert wurden, sind die counts darin die echten
# Vollkorpus-Werte, nicht subset-verzerrt wie beim 1-%-Sample der Phase C).
# Ergebnis: 4.407.548 Kollokationen + 7.863.182 lcf-Zeilen = 2.051 GB.
# Aufteilung durch Drop + VACUUM der lcf-Tabelle bestimmt.
BYTES_PRO_COLLOCATION = 275     # collocations inkl. der 4 Indizes (gemessen 274,4)
BYTES_PRO_LCF = 127             # lemma_corpus_freq inkl. PK + idx_lcf_quelle (126,3)


def schaetze_groesse(n_direkt: int, n_lcf: int) -> dict:
    """Größen-Hochrechnung aus gemessenen Zeilenzahlen (nicht geraten).

    n_direkt = Kollokations-Keys mit count >= min_count. Der Anteil invertierbarer
    Relationen liegt erfahrungsgemäß bei ~65–70 % (INVERTIBLE deckt SUBJA, OBJA,
    OBJD, ATTR, GMOD, ADV, PRED ab; nicht invertiert werden KON und PP) — hier
    bewusst konservativ mit 1,0 gerechnet, also ein doppelt so großer Ausgang.
    """
    n_gesamt = n_direkt * 2                       # direkt + invers (obere Schranke)
    gb_coll = n_gesamt * BYTES_PRO_COLLOCATION / 2**30
    gb_lcf = n_lcf * BYTES_PRO_LCF / 2**30
    gb = gb_coll + gb_lcf
    return {
        "n_direkt": n_direkt,
        "n_gesamt_obere_schranke": n_gesamt,
        "n_lcf": n_lcf,
        "gb": gb,
        "zeilen": [
            f"Kollokations-Keys >= min_count:  {n_direkt:,}",
            f"+ inverse (obere Schranke 1:1):  {n_gesamt:,} Zeilen in collocations",
            f"lemma_corpus_freq:               {n_lcf:,} Zeilen",
            f"collocations + 4 Indizes:        ~{gb_coll:.1f} GB "
            f"({BYTES_PRO_COLLOCATION} B/Zeile, gemessen)",
            f"lemma_corpus_freq + Index:       ~{gb_lcf:.1f} GB "
            f"({BYTES_PRO_LCF} B/Zeile, gemessen)",
            f"ERWARTETE DB-GRÖSSE:             ~{gb:.1f} GB "
            f"(obere Schranke; zzgl. WAL-Spitze, Index-Temp auf --tmp-dir "
            f"und zeitreise aus build_zeitreise_v2)",
        ],
    }


def json_dumps_stats(stats: dict, hochrechnung: dict) -> str:
    import json
    return json.dumps({"pass1": stats,
                       "hochrechnung": {k: v for k, v in hochrechnung.items()
                                        if k != "zeilen"}},
                      indent=2, ensure_ascii=False)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="Phase 4+5 (v2): triples_v2 → wortprofil_v2.db")
    parser.add_argument("--min-count", type=int, default=MIN_COUNT,
                        help="Mindest-Kookkurrenz (F6: 3 oder 5)")
    parser.add_argument("--min-dice", type=float, default=MIN_DICE)
    parser.add_argument("--deps-db", default=str(DEPS_DB_DEFAULT),
                        help="Eingabe triples_v2.db (Standard: 03_deps/triples_v2.db)")
    parser.add_argument("--out-db", default=str(OUT_DB_DEFAULT),
                        help="Ausgabe wortprofil_v2.db (Standard: 05_db/wortprofil_v2.db)")
    parser.add_argument("--reset", action="store_true", help="Ziel-DB neu anlegen")
    parser.add_argument("--tmp-dir", default=str(TMP_DIR_DEFAULT),
                        help="Temp-Verzeichnis für SQLite-Sortierungen (NICHT das "
                             "Systemlaufwerk; setzt TMP/TEMP/SQLITE_TMPDIR)")
    parser.add_argument("--cache-mb", type=int, default=2048,
                        help="SQLite-Page-Cache in MB (Standard 2048)")
    parser.add_argument("--stats-only", action="store_true",
                        help="Nur Pass 1 (Marginals + Kennzahlen + Platz-Hochrechnung), "
                             "nichts schreiben. Für die Vorab-Abschätzung.")
    parser.add_argument("--no-lcf", action="store_true",
                        help="lemma_corpus_freq nicht bauen (spart in Pass 1 den "
                             "größten RAM-Posten; Notausgang bei Speichermangel)")
    parser.add_argument("--max-rss-gb", type=float, default=40.0,
                        help="Pass 1 sauber abbrechen, wenn der Prozess mehr "
                             "Arbeitsspeicher belegt (0 = keine Grenze)")
    parser.add_argument("--marginals-cache", default="",
                        help="Pfad für den Pass-1-Cache (pickle). Wird gelesen wenn "
                             "vorhanden, sonst geschrieben → Pass 1 muss nach einem "
                             "Abbruch nicht wiederholt werden.")
    args = parser.parse_args()

    deps_db = Path(args.deps_db)
    out_db = Path(args.out_db)
    tmp_dir = Path(args.tmp_dir)
    redirect_tmp(tmp_dir)          # muss vor dem ersten connect passieren
    out_db.parent.mkdir(parents=True, exist_ok=True)

    if not deps_db.exists():
        print(f"FEHLER: triples_v2.db nicht gefunden: {deps_db}")
        sys.exit(1)

    if args.reset and not args.stats_only:
        for suffix in ("", "-shm", "-wal"):
            Path(str(out_db) + suffix).unlink(missing_ok=True)
        print("[RESET] Ziel-DB gelöscht.")

    print(f"Eingabe:  {deps_db}  ({deps_db.stat().st_size/2**30:.2f} GB)")
    print(f"Ausgabe:  {out_db}")
    print(f"Temp:     {tmp_dir}  (TMP/TEMP/SQLITE_TMPDIR umgelenkt, "
          f"{free_gb(tmp_dir):.0f} GB frei)")
    print(f"Filter:   count >= {args.min_count}, logDice >= {args.min_dice}")
    print(f"Frei auf Ziel-Laufwerk: {free_gb(out_db):.1f} GB", flush=True)

    dst = sqlite3.connect(out_db)
    init_wortprofil_db(dst, cache_mb=args.cache_mb)
    # Quell-DB anhängen: ein Connection-Kontext für alle Reads.
    # Einfacher Pfad (kein file:-URI — das würde uri=True am connect verlangen);
    # es wird nie in deps.* geschrieben.
    dst.execute("ATTACH DATABASE ? AS deps", (str(deps_db),))

    # Kein „falsches Fertig": eine teilweise gefüllte Ziel-DB nicht weiterschreiben.
    vorhanden = dst.execute("SELECT COUNT(*) FROM collocations").fetchone()[0]
    if vorhanden and not args.stats_only:
        print(f"FEHLER: collocations enthält schon {vorhanden:,} Zeilen. "
              f"Mit --reset neu bauen (oder eine andere --out-db wählen).")
        sys.exit(1)

    # ── Pass 1: Marginals (+ lcf-Aggregat), optional aus Cache ───────────────
    cache = Path(args.marginals_cache) if args.marginals_cache else None
    if cache and cache.exists():
        print(f"Lade Pass-1-Cache: {cache} ({cache.stat().st_size/2**30:.2f} GB) ...",
              flush=True)
        t0 = time.time()
        with cache.open("rb") as fh:
            gepackt = pickle.load(fh)
        f_head = gepackt["f_head"]
        f_dep = gepackt["f_dep"]
        lcf = gepackt["lcf"]
        stats = gepackt["stats"]
        print(f"  {len(f_head):,} / {len(f_dep):,} / {len(lcf):,} Keys "
              f"in {(time.time()-t0)/60:.1f} min | RSS {rss_gb():.1f} GiB", flush=True)
    else:
        f_head, f_dep, lcf, stats = lade_marginals(
            dst, args.min_count, mit_lcf=not args.no_lcf, max_rss_gb=args.max_rss_gb)
        if cache:
            print(f"Schreibe Pass-1-Cache: {cache} ...", flush=True)
            t0 = time.time()
            cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = cache.with_suffix(cache.suffix + ".part")
            with tmp.open("wb") as fh:
                pickle.dump({"f_head": f_head, "f_dep": f_dep, "lcf": lcf,
                             "stats": stats}, fh, protocol=pickle.HIGHEST_PROTOCOL)
            tmp.replace(cache)
            print(f"  {cache.stat().st_size/2**30:.2f} GB in "
                  f"{(time.time()-t0)/60:.1f} min", flush=True)

    # ── Platz-Hochrechnung aus den gemessenen Kennzahlen ────────────────────
    n_erwartet_direkt = stats["kollokations_keys_min"]
    hochrechnung = schaetze_groesse(n_erwartet_direkt, stats["lcf_keys"])
    print("\n── Platzbedarf-Hochrechnung (aus gemessenen Kennzahlen) ──")
    for zeile in hochrechnung["zeilen"]:
        print(f"  {zeile}")
    frei = free_gb(out_db)
    print(f"  Frei auf Ziel-Laufwerk: {frei:.1f} GB  "
          f"→ {'OK (>= 2x)' if frei >= 2 * hochrechnung['gb'] else 'ZU WENIG (< 2x)'}",
          flush=True)

    if args.stats_only:
        dst.execute("DETACH DATABASE deps")
        dst.close()
        print("\n[STATS-ONLY] Kein Schreibvorgang. Kennzahlen als JSON:")
        print(json_dumps_stats(stats, hochrechnung))
        return

    if frei < 2 * hochrechnung["gb"]:
        print(f"\nABBRUCH: weniger als das Doppelte der Hochrechnung frei "
              f"({frei:.1f} GB < {2*hochrechnung['gb']:.1f} GB). Betriebsregel 1.")
        dst.execute("DETACH DATABASE deps")
        dst.close()
        sys.exit(1)

    print("\nPass 2: logDice rechnen + Kollokationen schreiben ...", flush=True)
    n_ok = n_inv = n_skip = 0
    batch = []
    BATCH_SIZE = 50_000

    def flush():
        if batch:
            dst.executemany("""
                INSERT INTO collocations
                    (lemma, pos, relation, relation_full, relation_description,
                     form, dep_lemma, dep_pos, prep, frequency, logDice,
                     dep_case, dep_number)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, batch)
            dst.commit()
            batch.clear()

    for hl, hp, rel, dl, dp, prep, cnt, dcase, dnum in iter_collocations(dst, args.min_count):
        # ── Direkte Relation ──────────────────────────────────────────────
        f_a = f_head.get((hl, hp), 0)
        f_b = f_dep.get((dl, dp), 0)
        dice = berechne_logdice(cnt, f_a, f_b)

        if dice >= args.min_dice:
            rel_full = f"{hl}-{hp}-{rel}" if not prep else f"{hl}-{hp}-PP~{prep}"
            rel_desc = REL_DESC.get(rel, rel)
            if prep:
                rel_desc = f"Präpositionalphrase ({prep})"
            batch.append((hl, hp, rel, rel_full, rel_desc, dl, dl, dp, prep,
                          cnt, dice, dcase, dnum))
            n_ok += 1
        else:
            n_skip += 1

        # ── Inverse Relation ──────────────────────────────────────────────
        if rel in INVERTIBLE:
            inv_rel = f"~{rel}"
            # Marginals der DIREKTEN Relation tauschen (wie build_wortprofil_fast.py,
            # die zuletzt produktiv genutzte Variante): die Assoziation eines Paares
            # ist symmetrisch → dice_inv == dice. Die alte build_wortprofil.py nutzte
            # stattdessen f_head(dep)/f_dep(head) — das droppt ~PRED, wenn das Verb nie
            # als Dep und das Adjektiv nie als Head vorkommt (beide 0 → logDice −99),
            # genau der grün→wirken-Fall aus Golden Query #3.
            dice_inv = berechne_logdice(cnt, f_b, f_a)
            if dice_inv >= args.min_dice:
                inv_full = f"{dl}-{dp}-{inv_rel}"
                inv_desc = REL_DESC.get(inv_rel, inv_rel)
                # dep_case/dep_number leer: der Kasus des ursprünglichen Heads
                # wird beim Parsen nicht erfasst.
                batch.append((dl, dp, inv_rel, inv_full, inv_desc, hl, hl, hp, prep,
                              cnt, dice_inv, "", ""))
                n_inv += 1

        if len(batch) >= BATCH_SIZE:
            flush()
            frei = free_gb(out_db)
            if frei < MIN_FREE_GB:
                # Lieber jetzt abbrechen als ein halb geschriebenes Artefakt
                # hinterlassen (Betriebsregel 1 + 5).
                print(f"\nABBRUCH: nur noch {frei:.1f} GB frei auf dem Ziel-Laufwerk.")
                dst.commit()
                dst.close()
                sys.exit(2)

    flush()
    print(f"  Pass 2 fertig: {n_ok:,} direkt + {n_inv:,} invers | "
          f"frei {free_gb(out_db):.1f} GB", flush=True)

    # WAL jetzt einholen. Solange der deps-Lesecursor offen war, lag auf DIESER
    # Verbindung eine Lese-Transaktion — SQLite kann dann nicht automatisch
    # auschecken, und das WAL wuchs auf mehrere GB (im Voll-Lauf gemessen: 1,7 GB
    # schon bei einem Drittel von Pass 2). Der Cursor ist hier erschöpft, also
    # zusammenführen, bevor lcf-Insert und Index-Aufbau unnötig durch ein großes
    # WAL lesen.
    dst.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"  WAL eingeholt | frei {free_gb(out_db):.1f} GB", flush=True)

    n_lcf = baue_lemma_corpus_freq(dst, lcf) if lcf else 0
    lcf.clear()          # RAM freigeben, bevor SQLite die Indizes sortiert
    f_head.clear()
    f_dep.clear()

    erzeuge_indizes(dst, out_db)

    korpora = [r[0] for r in dst.execute(
        "SELECT DISTINCT quelle FROM deps.triples WHERE quelle<>'' ORDER BY quelle")]

    build_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dst.executemany("INSERT OR REPLACE INTO build_info (key, value) VALUES (?,?)", [
        ("built_at",         build_ts),
        ("pipeline_version", PIPELINE_VERSION),
        ("git_commit",       git_commit()),
        ("source_db",        deps_db.name),
        ("korpora",          ", ".join(korpora)),
        ("min_count",        str(args.min_count)),
        ("min_dice",         str(args.min_dice)),
        ("n_direct",         str(n_ok)),
        ("n_inverse",        str(n_inv)),
        ("n_filtered",       str(n_skip)),
        ("n_lemma_corpus_freq", str(n_lcf)),
        ("triples_zeilen",   str(stats["zeilen"])),
    ])
    dst.commit()

    # WAL zusammenführen, damit die Dateigröße der Realität entspricht
    dst.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    dst.execute("ANALYZE")
    dst.commit()
    dst.execute("DETACH DATABASE deps")
    dst.close()

    print(f"\n=== Fertig ===")
    print(f"  Direkte Kollokationen:  {n_ok:,}")
    print(f"  Inverse Kollokationen:  {n_inv:,}")
    print(f"  Gefiltert (logDice<{args.min_dice}): {n_skip:,}")
    print(f"  lemma_corpus_freq:      {n_lcf:,} Zeilen")
    print(f"  Korpora:                {', '.join(korpora) or '(keine)'}")
    print(f"  Build-Zeit (UTC):       {build_ts}")
    print(f"  DB: {out_db}  ({out_db.stat().st_size/2**30:.2f} GB)")
    print(f"  Frei auf Ziel-Laufwerk:  {free_gb(out_db):.1f} GB")


if __name__ == "__main__":
    main()
