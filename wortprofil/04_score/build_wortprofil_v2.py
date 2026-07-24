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
"""

import argparse
import math
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PIPELINE_VERSION = "v2"

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


def init_wortprofil_db(conn: sqlite3.Connection):
    conn.execute("PRAGMA page_size=16384")       # Größere Pages: weniger I/O
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-1048576")   # 1 GB Cache (weniger HDD-Reads)
    # temp_store=MEMORY: die großen GROUP BY/ORDER BY (Marginals + iter_collocations
    # über Mio. Triples) sortieren im RAM statt in temp-Dateien. Ohne das läuft der
    # externe Sort als random-I/O auf der HDD → Build hängt (in Phase C beobachtet:
    # 17 min bei „Lade Marginals", nur ~8 s aktive Zeit). Auch für Phase E essenziell.
    conn.execute("PRAGMA temp_store=MEMORY")
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
    # Index-Satz wie in der produktiv genutzten build_wortprofil_fast.py, damit
    # die App (server/wortprofil.js, Archiv fetchSyntagmaticPatterns) keinen
    # Regress erleidet. Zusätzlicher (…, relation, …)-Index für relation-
    # gefilterte Hot-Path-Queries (aus der kanonischen build_wortprofil.py).
    conn.execute("CREATE INDEX IF NOT EXISTS idx_collocations_lookup "
                 "ON collocations (lemma, pos, relation, logDice DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lemma_pos "
                 "ON collocations (lemma, pos)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_relation_full "
                 "ON collocations (relation_full)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_collocations_top "
                 "ON collocations (lemma, pos, logDice DESC, frequency, dep_pos)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lemma_corpus_freq (
            lemma  TEXT    NOT NULL,
            pos    TEXT    NOT NULL,
            quelle TEXT    NOT NULL,
            freq   INTEGER NOT NULL,
            PRIMARY KEY (lemma, pos, quelle)
        )
    """)
    # Chip „Top-N je (Korpus, POS)": nach freq DESC gefiltert auf quelle+pos.
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lcf_quelle "
                 "ON lemma_corpus_freq (quelle, pos, freq DESC)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS build_info (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()


def lade_marginals(conn: sqlite3.Connection) -> tuple[dict, dict]:
    """Marginalfrequenzen f_head/f_dep über ALLE triples (ein GROUP BY je Rolle).
    Speicherarm: eine Zeile je (lemma, pos), nicht je Kollokation."""
    print("Lade Marginals (f_head, f_dep über alle Triples) ...")
    f_head: dict[tuple, int] = {}
    for hl, hp, s in conn.execute(
        "SELECT head_lemma, head_pos, SUM(count) FROM deps.triples "
        "GROUP BY head_lemma, head_pos"):
        f_head[(hl, hp)] = s
    f_dep: dict[tuple, int] = {}
    for dl, dp, s in conn.execute(
        "SELECT dep_lemma, dep_pos, SUM(count) FROM deps.triples "
        "GROUP BY dep_lemma, dep_pos"):
        f_dep[(dl, dp)] = s
    print(f"  {len(f_head):,} Head-Lemmata | {len(f_dep):,} Dep-Lemmata")
    return f_head, f_dep


def berechne_logdice(f_ab: int, f_a: int, f_b: int) -> float:
    """logDice = 14 + log2(2 * f_ab / (f_a + f_b))"""
    if f_a + f_b == 0:
        return -99.0
    return 14.0 + math.log2(2.0 * f_ab / (f_a + f_b))


def iter_collocations(conn: sqlite3.Connection, min_count: int):
    """Streamt je Kollokation (Gesamt-count + häufigster dep_case/dep_number).

    Gruppiert feiner (Kollokations-Key + dep_case + dep_number) und sortiert
    innerhalb des Keys nach count DESC → die erste Zeile eines Keys liefert den
    count-gewichtet häufigsten (case, number)-Wert; die Summe über die Zeilen des
    Keys ergibt den Gesamt-count. Speicherarm: nur die aktuelle Key-Gruppe wird
    gepuffert (SQLite sortiert das Aggregat notfalls über temp files)."""
    query = """
        SELECT head_lemma, head_pos, relation, dep_lemma, dep_pos, prep,
               dep_case, dep_number, SUM(count) AS c
        FROM deps.triples
        GROUP BY head_lemma, head_pos, relation, dep_lemma, dep_pos, prep,
                 dep_case, dep_number
        ORDER BY head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, c DESC
    """
    cur_key = None
    total = 0
    best_case = best_num = ""
    for hl, hp, rel, dl, dp, prep, dcase, dnum, c in conn.execute(query):
        key = (hl, hp, rel, dl, dp, prep)
        if key != cur_key:
            if cur_key is not None and total >= min_count:
                yield (*cur_key, total, best_case, best_num)
            cur_key = key
            total = 0
            best_case, best_num = dcase, dnum   # erste Zeile = höchster count
        total += c
    if cur_key is not None and total >= min_count:
        yield (*cur_key, total, best_case, best_num)


def baue_lemma_corpus_freq(conn: sqlite3.Connection) -> int:
    """lemma_corpus_freq(lemma, pos, quelle, freq) direkt in SQL aggregieren
    (kein Python-RAM). Head- UND Dep-Teilnahme, über alle Korpora getrennt."""
    print("Baue lemma_corpus_freq (Kollokations-Teilnahme-Proxy je Korpus) ...")
    conn.execute("DELETE FROM lemma_corpus_freq")
    conn.execute("""
        INSERT INTO lemma_corpus_freq (lemma, pos, quelle, freq)
        SELECT lemma, pos, quelle, SUM(c) FROM (
            SELECT head_lemma AS lemma, head_pos AS pos, quelle, count AS c
            FROM deps.triples
            UNION ALL
            SELECT dep_lemma AS lemma, dep_pos AS pos, quelle, count AS c
            FROM deps.triples
        )
        GROUP BY lemma, pos, quelle
    """)
    conn.commit()
    return conn.execute("SELECT COUNT(*) FROM lemma_corpus_freq").fetchone()[0]


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
    args = parser.parse_args()

    deps_db = Path(args.deps_db)
    out_db = Path(args.out_db)
    out_db.parent.mkdir(parents=True, exist_ok=True)

    if not deps_db.exists():
        print(f"FEHLER: triples_v2.db nicht gefunden: {deps_db}")
        sys.exit(1)

    if args.reset:
        for suffix in ("", "-shm", "-wal"):
            Path(str(out_db) + suffix).unlink(missing_ok=True)
        print("[RESET] Ziel-DB gelöscht.")

    print(f"Eingabe:  {deps_db}")
    print(f"Ausgabe:  {out_db}")
    print(f"Filter:   count >= {args.min_count}, logDice >= {args.min_dice}")

    dst = sqlite3.connect(out_db)
    init_wortprofil_db(dst)
    # Quell-DB anhängen: ein Connection-Kontext für alle Reads + das
    # INSERT...SELECT von lemma_corpus_freq. Einfacher Pfad (kein file:-URI —
    # das würde uri=True am connect verlangen); es wird nie in deps.* geschrieben.
    dst.execute("ATTACH DATABASE ? AS deps", (str(deps_db),))

    f_head, f_dep = lade_marginals(dst)

    print("Berechne logDice + schreibe Kollokationen ...")
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
            print(f"  {n_ok:,} direkt + {n_inv:,} invers geschrieben ...", flush=True)

    flush()

    n_lcf = baue_lemma_corpus_freq(dst)

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
    ])
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
    print(f"  DB: {out_db}")


if __name__ == "__main__":
    main()
