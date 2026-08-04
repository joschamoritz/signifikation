"""Baut eine kleine Test-DB mit echtem Schema und echten Daten, damit merge.py
vor dem Lauf auf den 17,77 GB verifiziert werden kann.

Nimmt alle Zeilen rund um eine Handvoll Lemmata, bei denen ein Merge wirklich
stattfindet (thier/tier, theil/teil, seyn/sein) - plus das Kontroll-Paar
theater/teater und maß/mass, das getrennt bleiben muss.
"""
import os
import sqlite3
import sys
from pathlib import Path

HIER = Path(__file__).parent
QUELLE = Path(r"C:\wortprofil_v2\wortprofil_v2.db")
ZIEL = HIER / "test_merge.db"

LEMMATA = ["thier", "tier", "theil", "teil", "seyn", "sein", "theater", "teater",
           "maß", "mass", "berathung", "beratung", "werth", "wert", "thun", "tun"]

for v in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
    os.environ[v] = str(HIER.parent / "_tmp")

if ZIEL.exists():
    ZIEL.unlink()
for s in ("-wal", "-shm"):
    p = Path(str(ZIEL) + s)
    if p.exists():
        p.unlink()

src = sqlite3.connect(f"file:{QUELLE}?mode=ro", uri=True)
src.execute("PRAGMA cache_size=-524288")
dst = sqlite3.connect(ZIEL)

for (sql,) in src.execute(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
):
    dst.execute(sql)
for (sql,) in src.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
):
    dst.execute(sql)
dst.commit()

ph = ",".join("?" * len(LEMMATA))
n = 0
for row in src.execute(
    f"SELECT * FROM collocations WHERE lemma IN ({ph}) OR dep_lemma IN ({ph})",
    LEMMATA * 2,
):
    dst.execute("INSERT INTO collocations VALUES (" + ",".join("?" * 14) + ")", row)
    n += 1
print(f"collocations: {n:,}")

nz = 0
for row in src.execute(
    f"SELECT * FROM zeitreise WHERE lemma IN ({ph}) OR dep_lemma IN ({ph})",
    LEMMATA * 2,
):
    dst.execute("INSERT INTO zeitreise VALUES (?,?,?,?,?,?,?)", row)
    nz += 1
print(f"zeitreise: {nz:,}")

nl = 0
for row in src.execute(
    f"SELECT * FROM lemma_corpus_freq WHERE lemma IN ({ph})", LEMMATA
):
    dst.execute("INSERT INTO lemma_corpus_freq VALUES (?,?,?,?)", row)
    nl += 1
print(f"lemma_corpus_freq: {nl:,}")

for row in src.execute("SELECT * FROM build_info"):
    dst.execute("INSERT OR REPLACE INTO build_info VALUES (?,?)", row)
for row in src.execute("SELECT * FROM lemma_corrections"):
    dst.execute("INSERT INTO lemma_corrections VALUES (?,?,?,?,?,?,?,?,?)", row)
dst.commit()
n_frei = dst.execute(
    "SELECT count(*) FROM lemma_corrections WHERE freigegeben=1").fetchone()[0]
print(f"lemma_corrections: freigegeben {n_frei:,}")
dst.close()
src.close()
print(f"\n{ZIEL} ({ZIEL.stat().st_size/2**20:,.1f} MiB)")
