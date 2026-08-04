"""
Phase E2, Schritt 1 — Lemma-Inventar aus wortprofil_v2.db lesen.

Liest die collocations-Tabelle EINMAL sequenziell und aggregiert in Python:

  * dep-Inventar   (dep_lemma, dep_pos) -> (summe frequency, anzahl zeilen)
  * head-Inventar  (lemma,     pos)     -> (summe frequency, anzahl zeilen)

Warum kein `SELECT DISTINCT dep_lemma, dep_pos ... GROUP BY`:
Auf `dep_lemma` liegt kein Index (Betriebsregel 4 sinngemaess) — SQLite wuerde
die 25,7 Mio. Zeilen extern sortieren. Der sequenzielle Scan mit Python-Dict
kostet nur einen Durchlauf und konstanten Speicher (~1 Mio. Schluessel).

Ergebnis wird als eigene kleine SQLite-DB (`inventar.db`) abgelegt, damit die
Folgeschritte (Mapping-Bildung, Report) nicht erneut ueber 25,7 Mio. Zeilen
laufen muessen.

Aufruf:
  wortprofil-env/Scripts/python.exe phase_e2/scan_lemmas.py
"""

import argparse
import os
import sqlite3
import sys
import time
from pathlib import Path

HIER = Path(__file__).parent
TMP_DIR_DEFAULT = HIER.parent / "_tmp"
WP_DB_DEFAULT = Path(r"C:\wortprofil_v2\wortprofil_v2.db")
OUT_DEFAULT = HIER / "inventar.db"


def redirect_tmp(tmp_dir: Path):
    """Betriebsregel 3: SQLite-Temp nicht aufs Systemlaufwerk (Windows: TMP/TEMP)."""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wp-db", type=Path, default=WP_DB_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--tmp-dir", type=Path, default=TMP_DIR_DEFAULT)
    ap.add_argument("--limit", type=int, default=0, help="nur N Zeilen (Probelauf)")
    args = ap.parse_args()

    redirect_tmp(args.tmp_dir)

    src = sqlite3.connect(f"file:{args.wp_db}?mode=ro", uri=True)
    src.execute("PRAGMA cache_size=-262144")  # 256 MiB

    dep: dict[tuple[str, str], list[int]] = {}
    head: dict[tuple[str, str], list[int]] = {}
    # POS-Werte sind eine kleine Menge -> internen Cache halten, sonst legt
    # sqlite3 je Zeile ein frisches str-Objekt an (Betriebsregel 3b).
    pos_cache: dict[str, str] = {}

    sql = "SELECT lemma, pos, dep_lemma, dep_pos, frequency FROM collocations"
    if args.limit:
        sql += f" LIMIT {args.limit}"

    t0 = time.time()
    n = 0
    for lemma, pos, dep_lemma, dep_pos, freq in src.execute(sql):
        pos = pos_cache.setdefault(pos, pos)
        dep_pos = pos_cache.setdefault(dep_pos, dep_pos)

        e = dep.get((dep_lemma, dep_pos))
        if e is None:
            dep[(dep_lemma, dep_pos)] = [freq, 1]
        else:
            e[0] += freq
            e[1] += 1

        e = head.get((lemma, pos))
        if e is None:
            head[(lemma, pos)] = [freq, 1]
        else:
            e[0] += freq
            e[1] += 1

        n += 1
        if n % 5_000_000 == 0:
            print(f"  {n:,} Zeilen  {n/(time.time()-t0):,.0f} Z/s  "
                  f"dep={len(dep):,} head={len(head):,}", flush=True)

    src.close()
    print(f"Scan fertig: {n:,} Zeilen in {time.time()-t0:,.0f}s — "
          f"{len(dep):,} distinkte (dep_lemma, dep_pos), "
          f"{len(head):,} distinkte (lemma, pos)", flush=True)

    if args.out.exists():
        args.out.unlink()
    out = sqlite3.connect(args.out)
    out.execute("PRAGMA journal_mode=OFF")
    out.execute("PRAGMA synchronous=OFF")
    out.execute("""
        CREATE TABLE dep_inventar (
            lemma TEXT NOT NULL,
            pos   TEXT NOT NULL,
            freq  INTEGER NOT NULL,
            zeilen INTEGER NOT NULL,
            PRIMARY KEY (lemma, pos)
        ) WITHOUT ROWID
    """)
    out.execute("""
        CREATE TABLE head_inventar (
            lemma TEXT NOT NULL,
            pos   TEXT NOT NULL,
            freq  INTEGER NOT NULL,
            zeilen INTEGER NOT NULL,
            PRIMARY KEY (lemma, pos)
        ) WITHOUT ROWID
    """)
    out.executemany("INSERT INTO dep_inventar VALUES (?,?,?,?)",
                    ((l, p, v[0], v[1]) for (l, p), v in dep.items()))
    out.executemany("INSERT INTO head_inventar VALUES (?,?,?,?)",
                    ((l, p, v[0], v[1]) for (l, p), v in head.items()))
    out.commit()
    out.execute("ANALYZE")
    out.commit()
    out.close()
    print(f"geschrieben: {args.out} ({args.out.stat().st_size/2**20:,.1f} MiB)")


if __name__ == "__main__":
    sys.exit(main())
