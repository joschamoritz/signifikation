"""
Phase build_zeitreise – Zeitreise-Tabelle aus triples.db berechnen

Fügt eine `zeitreise`-Tabelle zur wortprofil.db hinzu.
Aggregiert Kollokatoren pro Jahrzehnt mit normalisiertem Score (relative Häufigkeit).

Muss NACH build_wortprofil.py ausgeführt werden (wortprofil.db muss existieren).
Muss NACH parse_deps.py ausgeführt werden (braucht `jahr`-Feld in triples.db).

Aufruf: python build_zeitreise.py [--reset]
"""

import io
import sqlite3
import sys
import argparse
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

TRIPLES_DB   = Path(__file__).parent.parent / "03_deps" / "triples.db"
WORTPROFIL_DB = Path(__file__).parent.parent / "05_db"  / "wortprofil.db"

# Relationen, die für die Zeitreise berücksichtigt werden
RELATIONS = ("ATTR", "SUBJA", "OBJA", "KON", "ADV", "PRED", "GMOD", "OBJD")

MIN_FREQ   = 3  # Mindesthäufigkeit eines Kollokators pro Jahrzehnt
MIN_COLLOC = 3  # Mindestanzahl gültiger Kollokatoren pro Jahrzehnt (für Dekaden-Filter)


def build_zeitreise(reset: bool = False):
    if not TRIPLES_DB.exists():
        print(f"FEHLER: triples.db nicht gefunden: {TRIPLES_DB}")
        sys.exit(1)
    if not WORTPROFIL_DB.exists():
        print(f"FEHLER: wortprofil.db nicht gefunden: {WORTPROFIL_DB}")
        print("Zuerst build_wortprofil.py ausführen!")
        sys.exit(1)

    print(f"Lese:    {TRIPLES_DB}")
    print(f"Schreibe: {WORTPROFIL_DB}")

    src = sqlite3.connect(f"file:{TRIPLES_DB}?mode=ro", uri=True)
    dst = sqlite3.connect(WORTPROFIL_DB)
    dst.execute("PRAGMA journal_mode=WAL")
    dst.execute("PRAGMA synchronous=NORMAL")

    # Tabelle anlegen / leeren
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

    # Normalisierungs-Nenner: Gesamt-Häufigkeit pro (head, jahrzehnt)
    totals: dict[tuple, int] = {}
    for hl, hp, dl, dp, jz, freq in rows:
        key = (hl, hp, jz)
        totals[key] = totals.get(key, 0) + freq

    # Normalisierter Score: relative Häufigkeit × 1000
    batch = []
    for hl, hp, dl, dp, jz, freq in rows:
        total = totals.get((hl, hp, jz), 1)
        score = round(freq / total * 1000, 4)
        batch.append((hl, hp, dl, dp, jz, freq, score))

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true",
                        help="Zeitreise-Tabelle vor dem Befüllen leeren")
    args = parser.parse_args()
    build_zeitreise(reset=args.reset)
