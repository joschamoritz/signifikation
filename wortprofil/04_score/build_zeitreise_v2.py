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
  python build_zeitreise_v2.py --stats-only                    # nur Pass 1

── Phase E (2026-08-03): Umbau auf Streaming ─────────────────────────────────
Die Originalfassung machte

    SELECT … GROUP BY head_lemma, head_pos, dep_lemma, dep_pos, jahrzehnt
    HAVING SUM(count) >= 2                      … .fetchall()

Das ist bei triples_v2.db (526 Mio. Zeilen, WITHOUT ROWID) doppelt untragbar:

  1. Der GROUP BY-Schlüssel überspringt `relation`/`prep`/`quelle` und ist damit
     KEIN PK-Präfix → voller externer Sortierdurchlauf über alle Zeilen.
  2. `.fetchall()` zieht das komplette Ergebnis in eine Python-Liste, die dann
     nochmals als `batch` verdoppelt wird.

Neu: zwei sequenzielle Scans in PK-Reihenfolge. Weil die Zeilen physisch nach
(head_lemma, head_pos, …) liegen, ist eine head-Gruppe immer zusammenhängend —
ihre Kollokatoren lassen sich in einem kleinen lokalen Dict aggregieren und
sortiert ausgeben. Ergebnis identisch zum GROUP BY, aber ohne Sortierung und mit
konstantem Speicher für die Gruppierung.

  Pass 1  Marginalen je Dekade (f_head/f_dep) über die Zeilen, die HAVING
          überstehen; zusätzlich Zeilenzahl-Prognose für die Platzabschätzung.
  Pass 2  gleiche Gruppierung, logDice rechnen, in PK-Reihenfolge einfügen
          (sequenzielle Index-Anhänge); Sekundärindex erst danach.
"""

import argparse
import math
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

TRIPLES_DB_DEFAULT    = Path(__file__).parent.parent / "03_deps" / "triples_v2.db"
WORTPROFIL_DB_DEFAULT = Path(__file__).parent.parent / "05_db"   / "wortprofil_v2.db"

# Relationen, die für die Zeitreise berücksichtigt werden (unverändert ggü. v1)
RELATIONS = ("ATTR", "SUBJA", "OBJA", "KON", "ADV", "PRED", "GMOD", "OBJD")

MIN_FREQ = 2  # Mindesthäufigkeit eines Kollokators pro Jahrzehnt

TMP_DIR_DEFAULT = Path(__file__).parent.parent / "_tmp"
MIN_FREE_GB = 10.0
PROGRESS_EVERY = 20_000_000

# Streaming-Reihenfolge = PK-Präfix von triples_v2 (WITHOUT ROWID)
PK_ORDER = "head_lemma, head_pos, relation, dep_lemma, dep_pos, prep"

BYTES_PRO_ZEITREISE = 110   # Zeile + PK-Autoindex + idx_zt_lemma, gemessen


def redirect_tmp(tmp_dir: Path):
    """TMP/TEMP/TMPDIR/SQLITE_TMPDIR umlenken — vor dem ersten connect.
    Windows liest TMP/TEMP; SQLITE_TMPDIR allein genügt dort nicht."""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp_dir)


def free_gb(pfad: Path) -> float:
    ziel = pfad if pfad.exists() else pfad.parent
    return shutil.disk_usage(ziel).free / 2**30


def rss_gb() -> float:
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss / 2**30
    except Exception:
        return 0.0


def iter_dekaden_gruppen(src: sqlite3.Connection, label: str):
    """Streamt (head_lemma, head_pos, dep_lemma, dep_pos, jahrzehnt, freq) —
    genau die Zeilen, die das alte `GROUP BY … HAVING SUM(count) >= MIN_FREQ`
    geliefert hätte, aber ohne externe Sortierung.

    Weil die Tabelle physisch nach (head_lemma, head_pos, …) sortiert ist, ist
    jede head-Gruppe zusammenhängend. Nur deren Kollokatoren werden in einem
    lokalen Dict aggregiert und dann sortiert ausgegeben — dadurch entsteht der
    Gesamtstrom in genau der zeitreise-PK-Reihenfolge
    (lemma, pos, dep_lemma, dep_pos, jahrzehnt), was den Insert in Pass 2 zu
    sequenziellen Index-Anhängen macht.
    """
    rel_ph = ",".join("?" * len(RELATIONS))
    q = (f"SELECT head_lemma, head_pos, dep_lemma, dep_pos, (jahr / 10) * 10, count "
         f"FROM triples WHERE jahr > 0 AND relation IN ({rel_ph}) "
         f"ORDER BY {PK_ORDER}")
    cur_head = None
    gruppe: dict[tuple, int] = {}
    n = 0
    t0 = time.time()
    for hl, hp, dl, dp, jz, c in src.execute(q, RELATIONS):
        n += 1
        if (hl, hp) != cur_head:
            if cur_head is not None:
                for (d_l, d_p, j), f in sorted(gruppe.items()):
                    if f >= MIN_FREQ:
                        yield (cur_head[0], cur_head[1], d_l, d_p, j, f)
            cur_head = (hl, hp)
            gruppe = {}
        k = (dl, dp, jz)
        gruppe[k] = gruppe.get(k, 0) + c
        if n % PROGRESS_EVERY == 0:
            dt = max(time.time() - t0, 1e-9)
            print(f"  [{label}] {n:,} Zeilen gelesen | {n/dt/1000:,.0f}k/s | "
                  f"{dt/60:.1f} min | RSS {rss_gb():.1f} GiB", flush=True)
    if cur_head is not None:
        for (d_l, d_p, j), f in sorted(gruppe.items()):
            if f >= MIN_FREQ:
                yield (cur_head[0], cur_head[1], d_l, d_p, j, f)


def build_zeitreise(triples_db: Path, wortprofil_db: Path, reset: bool = False,
                    stats_only: bool = False):
    if not triples_db.exists():
        print(f"FEHLER: triples_v2.db nicht gefunden: {triples_db}")
        sys.exit(1)
    if not wortprofil_db.exists():
        print(f"FEHLER: wortprofil_v2.db nicht gefunden: {wortprofil_db}")
        print("Zuerst build_wortprofil_v2.py ausführen!")
        sys.exit(1)

    print(f"Lese:     {triples_db}")
    print(f"Schreibe: {wortprofil_db}")
    print(f"Frei auf Ziel-Laufwerk: {free_gb(wortprofil_db):.1f} GB", flush=True)

    src = sqlite3.connect(f"file:{triples_db}?mode=ro", uri=True)
    src.execute("PRAGMA cache_size=-1048576")   # 1 GB
    src.execute("PRAGMA temp_store=FILE")

    # ── Pass 1: Marginalen je Dekade über die HAVING-Überlebenden ───────────
    print("Pass 1: Marginalen je Dekade (sequenzieller Scan) …", flush=True)
    t0 = time.time()
    f_head: dict[tuple, int] = {}   # (head_lemma, head_pos, jahrzehnt)
    f_dep:  dict[tuple, int] = {}   # (dep_lemma,  dep_pos,  jahrzehnt)
    n_eintraege = 0
    dekaden: dict[int, int] = {}
    for hl, hp, dl, dp, jz, freq in iter_dekaden_gruppen(src, "Pass 1"):
        n_eintraege += 1
        k = (hl, hp, jz)
        f_head[k] = f_head.get(k, 0) + freq
        k = (dl, dp, jz)
        f_dep[k] = f_dep.get(k, 0) + freq
        dekaden[jz] = dekaden.get(jz, 0) + 1
    gb = n_eintraege * BYTES_PRO_ZEITREISE / 2**30
    print(f"  {n_eintraege:,} zeitreise-Einträge | f_head {len(f_head):,} | "
          f"f_dep {len(f_dep):,}")
    print(f"  Pass 1: {(time.time()-t0)/60:.1f} min | RSS {rss_gb():.1f} GiB")
    print(f"  Hochrechnung zeitreise: ~{gb:.2f} GB "
          f"({BYTES_PRO_ZEITREISE} B/Zeile inkl. beider Indizes)")
    print(f"  Dekaden: {len(dekaden)} — "
          f"{', '.join(f'{d}:{c:,}' for d, c in sorted(dekaden.items()))}", flush=True)

    if stats_only:
        src.close()
        print("\n[STATS-ONLY] Kein Schreibvorgang.")
        return

    frei = free_gb(wortprofil_db)
    if frei < 2 * gb:
        print(f"ABBRUCH: weniger als das Doppelte der Hochrechnung frei "
              f"({frei:.1f} GB < {2*gb:.1f} GB). Betriebsregel 1.")
        src.close()
        sys.exit(1)

    dst = sqlite3.connect(wortprofil_db)
    dst.execute("PRAGMA journal_mode=WAL")
    dst.execute("PRAGMA synchronous=NORMAL")
    dst.execute("PRAGMA cache_size=-1048576")
    dst.execute("PRAGMA temp_store=FILE")
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
    # idx_zt_lemma wird NACH dem Insert angelegt (Betriebsregel 7).

    vorhanden = dst.execute("SELECT COUNT(*) FROM zeitreise").fetchone()[0]
    if reset:
        dst.execute("DELETE FROM zeitreise")
        dst.execute("DROP INDEX IF EXISTS idx_zt_lemma")
        dst.commit()
        print(f"[RESET] zeitreise-Tabelle geleert ({vorhanden:,} Zeilen entfernt).")
    elif vorhanden:
        print(f"FEHLER: zeitreise enthält schon {vorhanden:,} Zeilen — mit --reset "
              f"neu bauen (kein Weiterschreiben auf halbe Artefakte).")
        src.close()
        dst.close()
        sys.exit(1)

    # ── Pass 2: logDice pro Dekade + Insert in PK-Reihenfolge ───────────────
    # 14 + log2(2 * f_cooc / (f_head + f_dep)) — gleiche Formel wie
    # build_wortprofil_v2.py, Scores bleiben vergleichbar.
    print("Pass 2: logDice + schreiben …", flush=True)
    t0 = time.time()
    CHUNK = 200_000
    batch = []
    n = 0
    for hl, hp, dl, dp, jz, freq in iter_dekaden_gruppen(src, "Pass 2"):
        fh = f_head.get((hl, hp, jz), 1)
        fd = f_dep.get((dl, dp, jz), 1)
        score = 14 + math.log2(2 * freq / (fh + fd)) if (fh + fd) > 0 else 0.0
        batch.append((hl, hp, dl, dp, jz, freq, round(max(0.0, score), 4)))
        if len(batch) >= CHUNK:
            dst.executemany("""
                INSERT OR REPLACE INTO zeitreise
                    (lemma, pos, dep_lemma, dep_pos, jahrzehnt, freq, score)
                VALUES (?,?,?,?,?,?,?)
            """, batch)
            dst.commit()
            n += len(batch)
            batch.clear()
            if free_gb(wortprofil_db) < MIN_FREE_GB:
                print(f"ABBRUCH: nur noch {free_gb(wortprofil_db):.1f} GB frei.")
                dst.close()
                sys.exit(2)
    if batch:
        dst.executemany("""
            INSERT OR REPLACE INTO zeitreise
                (lemma, pos, dep_lemma, dep_pos, jahrzehnt, freq, score)
            VALUES (?,?,?,?,?,?,?)
        """, batch)
        dst.commit()
        n += len(batch)
    print(f"  {n:,} Einträge in {(time.time()-t0)/60:.1f} min", flush=True)

    f_head.clear()
    f_dep.clear()

    print("Erzeuge idx_zt_lemma …", flush=True)
    t0 = time.time()
    dst.execute("CREATE INDEX IF NOT EXISTS idx_zt_lemma ON zeitreise(lemma, pos, jahrzehnt)")
    dst.commit()
    print(f"  {(time.time()-t0)/60:.1f} min", flush=True)

    n_dekaden = dst.execute("SELECT COUNT(DISTINCT jahrzehnt) FROM zeitreise").fetchone()[0]
    n_lemmata = dst.execute("SELECT COUNT(DISTINCT lemma)    FROM zeitreise").fetchone()[0]
    dst.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    dst.commit()

    src.close()
    dst.close()

    print(f"\n=== Fertig ===")
    print(f"  Lemmata:   {n_lemmata:,}")
    print(f"  Dekaden:   {n_dekaden}")
    print(f"  Einträge:  {n:,}")
    print(f"  DB: {wortprofil_db}  ({wortprofil_db.stat().st_size/2**30:.2f} GB)")
    print(f"  Frei auf Ziel-Laufwerk: {free_gb(wortprofil_db):.1f} GB")


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
    parser.add_argument("--tmp-dir", default=str(TMP_DIR_DEFAULT),
                        help="Temp-Verzeichnis für SQLite (NICHT das Systemlaufwerk)")
    parser.add_argument("--stats-only", action="store_true",
                        help="Nur Pass 1: Zeilen-/Dekaden-Prognose, nichts schreiben")
    args = parser.parse_args()
    redirect_tmp(Path(args.tmp_dir))    # vor dem ersten sqlite3.connect
    build_zeitreise(Path(args.deps_db), Path(args.wortprofil_db), reset=args.reset,
                    stats_only=args.stats_only)


if __name__ == "__main__":
    main()
