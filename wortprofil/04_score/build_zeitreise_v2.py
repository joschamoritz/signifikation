"""
Phase build_zeitreise (v2) – Zeitreise-Tabelle aus triples_v2.db berechnen

Baut build_zeitreise.py gemäß planning/DB-Neuaufbau.md auf die v2-Artefakte um.
Logik unverändert (Dekaden bleiben die Rohdaten-Ebene, Entscheidung F4). Die alte
build_zeitreise.py bleibt unangetastet (Grundregel „nichts in-place").

Eingabe:  03_deps/triples_v2.db   (braucht das jahr-Feld — in v2 dank K5 dichter)
Schreibt: 05_db/wortprofil_v2.db  (Tabelle zeitreise)

Muss NACH build_wortprofil_v2.py laufen (wortprofil_v2.db muss existieren).

Aufruf:
  python build_zeitreise_v2.py [--reset]
  python build_zeitreise_v2.py --deps-db X --wortprofil-db Y   # Pfade überschreiben
"""

import argparse
import math
import sqlite3
import sys
from pathlib import Path

TRIPLES_DB_DEFAULT    = Path(__file__).parent.parent / "03_deps" / "triples_v2.db"
WORTPROFIL_DB_DEFAULT = Path(__file__).parent.parent / "05_db"   / "wortprofil_v2.db"

# Relationen, die für die Zeitreise berücksichtigt werden (unverändert ggü. v1)
RELATIONS = ("ATTR", "SUBJA", "OBJA", "KON", "ADV", "PRED", "GMOD", "OBJD")

MIN_FREQ = 2  # Mindesthäufigkeit eines Kollokators pro Jahrzehnt


def build_zeitreise(triples_db: Path, wortprofil_db: Path, reset: bool = False):
    if not triples_db.exists():
        print(f"FEHLER: triples_v2.db nicht gefunden: {triples_db}")
        sys.exit(1)
    if not wortprofil_db.exists():
        print(f"FEHLER: wortprofil_v2.db nicht gefunden: {wortprofil_db}")
        print("Zuerst build_wortprofil_v2.py ausführen!")
        sys.exit(1)

    print(f"Lese:     {triples_db}")
    print(f"Schreibe: {wortprofil_db}")

    src = sqlite3.connect(f"file:{triples_db}?mode=ro", uri=True)
    dst = sqlite3.connect(wortprofil_db)
    dst.execute("PRAGMA journal_mode=WAL")
    dst.execute("PRAGMA synchronous=NORMAL")

    dst.execute("""
        CREATE TABLE IF NOT EXISTS zeitreise (
            lemma     TEXT    NOT NULL,
            pos       TEXT    NOT NULL,
            dep_lemma TEXT    NOT NULL,
            dep_pos   TEXT    NOT NULL,
            jahrzehnt INTEGER NOT NULL,
            freq      INTEGER NOT NULL,
            score     REAL    NOT NULL,
            PRIMARY KEY (lemma, pos, dep_lemma, dep_pos, jahrzehnt)
        )
    """)
    dst.execute("""
        CREATE INDEX IF NOT EXISTS idx_zt_lemma
        ON zeitreise(lemma, pos, jahrzehnt)
    """)

    if reset:
        dst.execute("DELETE FROM zeitreise")
        dst.commit()
        print("[RESET] zeitreise-Tabelle geleert.")

    rel_placeholders = ",".join("?" * len(RELATIONS))

    print("Aggregiere Kollokatoren pro Jahrzehnt …")
    rows = src.execute(f"""
        SELECT
            head_lemma, head_pos,
            dep_lemma,  dep_pos,
            (jahr / 10) * 10 AS jahrzehnt,
            SUM(count)       AS freq
        FROM triples
        WHERE jahr > 0
          AND relation IN ({rel_placeholders})
        GROUP BY head_lemma, head_pos, dep_lemma, dep_pos, jahrzehnt
        HAVING SUM(count) >= ?
    """, (*RELATIONS, MIN_FREQ)).fetchall()

    print(f"  {len(rows):,} Roh-Einträge gefunden")

    # Ein-Pass: f_head und f_dep pro Jahrzehnt gleichzeitig akkumulieren
    f_head: dict[tuple, int] = {}  # (head_lemma, head_pos, jahrzehnt)
    f_dep:  dict[tuple, int] = {}  # (dep_lemma,  dep_pos,  jahrzehnt)
    for hl, hp, dl, dp, jz, freq in rows:
        f_head[(hl, hp, jz)] = f_head.get((hl, hp, jz), 0) + freq
        f_dep[ (dl, dp, jz)] = f_dep.get( (dl, dp, jz), 0) + freq

    # logDice pro Dekade: 14 + log2(2 * f_cooc / (f_head + f_dep))
    # Gleiche Formel wie build_wortprofil_v2.py – Scores vergleichbar.
    batch = []
    for hl, hp, dl, dp, jz, freq in rows:
        fh = f_head.get((hl, hp, jz), 1)
        fd = f_dep.get( (dl, dp, jz), 1)
        score = 14 + math.log2(2 * freq / (fh + fd)) if (fh + fd) > 0 else 0.0
        batch.append((hl, hp, dl, dp, jz, freq, round(max(0.0, score), 4)))

    print(f"Schreibe {len(batch):,} Einträge …")
    CHUNK = 100_000
    for i in range(0, len(batch), CHUNK):
        dst.executemany("""
            INSERT OR REPLACE INTO zeitreise
                (lemma, pos, dep_lemma, dep_pos, jahrzehnt, freq, score)
            VALUES (?,?,?,?,?,?,?)
        """, batch[i : i + CHUNK])
        dst.commit()
        print(f"  {min(i + CHUNK, len(batch)):,} …", flush=True)

    n_dekaden = dst.execute("SELECT COUNT(DISTINCT jahrzehnt) FROM zeitreise").fetchone()[0]
    n_lemmata = dst.execute("SELECT COUNT(DISTINCT lemma)    FROM zeitreise").fetchone()[0]

    src.close()
    dst.close()

    print(f"\n=== Fertig ===")
    print(f"  Lemmata:   {n_lemmata:,}")
    print(f"  Dekaden:   {n_dekaden}")
    print(f"  Einträge:  {len(batch):,}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="build_zeitreise (v2): triples_v2 → wortprofil_v2.db")
    parser.add_argument("--deps-db", default=str(TRIPLES_DB_DEFAULT),
                        help="Eingabe triples_v2.db (Standard: 03_deps/triples_v2.db)")
    parser.add_argument("--wortprofil-db", default=str(WORTPROFIL_DB_DEFAULT),
                        help="Ziel wortprofil_v2.db (Standard: 05_db/wortprofil_v2.db)")
    parser.add_argument("--reset", action="store_true",
                        help="Zeitreise-Tabelle vor dem Befüllen leeren")
    args = parser.parse_args()
    build_zeitreise(Path(args.deps_db), Path(args.wortprofil_db), reset=args.reset)


if __name__ == "__main__":
    main()
