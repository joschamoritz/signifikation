"""
Phase 4+5 OPTIMIERT – logDice berechnen & DWDS-kompatible Lookup-DB bauen

VIEL SCHNELLER: Marginals werden nicht in RAM geladen, sondern direkt in SQL berechnet.
"""

import io
import math
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

DEPS_DB  = Path(__file__).parent.parent / "03_deps"  / "triples.db"
OUT_DB   = Path(__file__).parent.parent / "05_db"    / "wortprofil.db"
OUT_DB.parent.mkdir(exist_ok=True)

MIN_COUNT = 3
MIN_DICE  = 0.0

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
    "~SUBJA": "ist Subjekt von",
    "~OBJA":  "ist Akkusativobjekt von",
    "~OBJD":  "ist Dativobjekt von",
    "~ATTR":  "ist Adjektivattribut von",
    "~GMOD":  "ist Genitivattribut von",
    "~ADV":   "modifiziert (Adverb)",
}

INVERTIBLE = {"SUBJA", "OBJA", "OBJD", "ATTR", "GMOD", "ADV"}


def init_wortprofil_db(conn: sqlite3.Connection):
    conn.execute("PRAGMA page_size=16384")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-65536")
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
            logDice              REAL    NOT NULL
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_lemma_pos
            ON collocations (lemma, pos)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_relation_full
            ON collocations (relation_full)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_collocations_lookup
            ON collocations (lemma, pos, logDice DESC)
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS build_info (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    conn.commit()


def berechne_logdice(f_ab: int, f_a: int, f_b: int) -> float:
    """logDice = 14 + log2(2 * f_ab / (f_a + f_b))"""
    if f_a + f_b == 0:
        return -99.0
    return 14.0 + math.log2(2.0 * f_ab / (f_a + f_b))


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-count", type=int, default=MIN_COUNT)
    parser.add_argument("--min-dice",  type=float, default=MIN_DICE)
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()

    if args.reset and OUT_DB.exists():
        OUT_DB.unlink()
        print("[RESET] Ziel-DB gelöscht.")

    print(f"Eingabe:  {DEPS_DB}")
    print(f"Ausgabe:  {OUT_DB}")
    print(f"Filter:   count >= {args.min_count}, logDice >= {args.min_dice}")
    print()

    src = sqlite3.connect(f"file:{DEPS_DB}?mode=ro", uri=True)
    dst = sqlite3.connect(OUT_DB)

    init_wortprofil_db(dst)

    print("Verarbeite Triples (mit Marginals im Flight) ...")
    n_ok = n_inv = n_skip = 0
    batch = []
    BATCH_SIZE = 50_000

    def flush():
        if batch:
            dst.executemany("""
                INSERT INTO collocations
                    (lemma, pos, relation, relation_full, relation_description,
                     form, dep_lemma, dep_pos, prep, frequency, logDice)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """, batch)
            dst.commit()
            batch.clear()

    # Hauptquery: direkter GROUP BY über triples, Marginals als Subqueries
    query = """
        SELECT
            head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, cnt,
            (SELECT SUM(count) FROM triples t2
             WHERE t2.head_lemma = main.head_lemma AND t2.head_pos = main.head_pos) as f_a,
            (SELECT SUM(count) FROM triples t3
             WHERE t3.dep_lemma = main.dep_lemma AND t3.dep_pos = main.dep_pos) as f_b
        FROM (
            SELECT head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, SUM(count) as cnt
            FROM triples
            GROUP BY head_lemma, head_pos, relation, dep_lemma, dep_pos, prep
            HAVING cnt >= ?
        ) as main
    """

    for hl, hp, rel, dl, dp, prep, cnt, f_a, f_b in src.execute(query, (args.min_count,)):
        # ── Direkte Relation ──────────────────────────────────────────────
        dice = berechne_logdice(cnt, f_a, f_b)

        if dice >= args.min_dice:
            rel_full = f"{hl}-{hp}-{rel}" if not prep else f"{hl}-{hp}-PP~{prep}"
            rel_desc = REL_DESC.get(rel, rel)
            if prep:
                rel_desc = f"Präpositionalphrase ({prep})"
            batch.append((hl, hp, rel, rel_full, rel_desc, dl, dl, dp, prep, cnt, dice))
            n_ok += 1
        else:
            n_skip += 1

        # ── Inverse Relation ──────────────────────────────────────────────
        if rel in INVERTIBLE:
            inv_rel = f"~{rel}"
            f_a_inv = f_b  # tauschen
            f_b_inv = f_a
            dice_inv = berechne_logdice(cnt, f_a_inv, f_b_inv)

            if dice_inv >= args.min_dice:
                inv_full = f"{dl}-{dp}-{inv_rel}"
                inv_desc = REL_DESC.get(inv_rel, inv_rel)
                batch.append((dl, dp, inv_rel, inv_full, inv_desc, hl, hl, hp, prep, cnt, dice_inv))
                n_inv += 1

        if len(batch) >= BATCH_SIZE:
            flush()
            print(f"  {n_ok:,} direkt + {n_inv:,} invers geschrieben ...", flush=True)

    flush()

    build_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    dst.executemany("INSERT OR REPLACE INTO build_info (key, value) VALUES (?,?)", [
        ("built_at",      build_ts),
        ("min_count",     str(args.min_count)),
        ("min_dice",      str(args.min_dice)),
        ("n_direct",      str(n_ok)),
        ("n_inverse",     str(n_inv)),
        ("n_filtered",    str(n_skip)),
    ])
    dst.commit()

    src.close()
    dst.close()

    print(f"\n=== Fertig ===")
    print(f"  Direkte Kollokationen:  {n_ok:,}")
    print(f"  Inverse Kollokationen:  {n_inv:,}")
    print(f"  Gefiltert:              {n_skip:,} (logDice < {args.min_dice})")
    print(f"  Build-Zeit (UTC):       {build_ts}")
    print(f"  DB: {OUT_DB}")


if __name__ == "__main__":
    main()
