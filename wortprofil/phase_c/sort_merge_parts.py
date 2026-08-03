"""
Phase D – Sortierter Merge der Teil-DBs zur finalen triples_v2.db

WARUM: Der naive Merge (je Teil-DB ein `INSERT ... SELECT ... ON CONFLICT`) fuegt
die Zeilen in zufaelliger Schluesselreihenfolge in einen wachsenden B-Baum ein.
Gemessen im echten Lauf: 73 Mio. Zeilen/h zu Beginn, nach 4 h nur noch 33 Mio./h –
mit weiter fallender Tendenz (der Cache deckt immer weniger des Baums ab), dazu ein
auf 16 GB angewachsenes WAL. Hochrechnung: 8+ Stunden und Gefahr, dass die Platte
erneut volllaeuft.

LOESUNG: Zeilen in PK-Reihenfolge schreiben, dann waechst der Baum hinten an
(append-artig) statt ueberall. Zweistufig, weil SQLite nur 10 Datenbanken
gleichzeitig anhaengen kann:

  Stufe 1: Teil-DBs in Gruppen (<=8) je per `GROUP BY <PK>` zusammenfassen.
           Das erzwingt SQLites externen Merge-Sort und schreibt das Ergebnis
           sortiert in eine WITHOUT-ROWID-Zwischen-DB (= physisch PK-sortiert).
  Stufe 2: Die wenigen Zwischen-DBs sind bereits sortiert und werden mit
           heapq.merge als k-Wege-Merge zusammengefuehrt -> ein einziger
           sortierter Strom -> sequenzielle Inserts in die Ziel-DB.
           Kein weiterer grosser Sort noetig.

Aggregation je PK: `count` wird summiert. Fuer `dep_case`/`dep_number` wird ein
Wert uebernommen (MAX in Stufe 1, erster in Stufe 2) – konsistent mit der bereits
dokumentierten Naeherung: der PK enthaelt diese Spalten nicht, sie sind schon in
den Teil-DBs nur "haeufigster Wert je Flush-Buendel" (parse_deps_v2, §3.2).

Aufruf:
    python phase_c/sort_merge_parts.py --out C:/wortprofil_v2/triples_v2.db \
        --parts C:/wortprofil_v2/parts --parts D:/.../parts_done \
        --tmp-dir D:/.../_merge_tmp [--gruppe 8]
"""

import argparse
import heapq
import os
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "03_parse"))
import parse_deps_v2 as P  # noqa: E402

PK = ["head_lemma", "head_pos", "relation", "dep_lemma", "dep_pos", "prep", "quelle", "jahr"]
PK_SQL = ", ".join(PK)
ALLE = PK + ["count", "dep_case", "dep_number"]


def pragmas(conn, cache_gb=2):
    conn.execute(f"PRAGMA cache_size=-{cache_gb * 1024 * 1024}")
    conn.execute("PRAGMA synchronous=OFF")     # Zwischenergebnisse: Tempo vor Absturzsicherheit
    conn.execute("PRAGMA journal_mode=OFF")    # kein WAL/Journal noetig (neu gebaute Datei)


def stufe1(gruppe: list, ziel: Path, cache_gb: int):
    """Eine Gruppe Teil-DBs per GROUP BY sortiert in eine WITHOUT-ROWID-DB schreiben."""
    for s in ("", "-wal", "-shm"):
        Path(str(ziel) + s).unlink(missing_ok=True)
    conn = sqlite3.connect(ziel)
    P.init_db(conn, without_rowid=True)
    pragmas(conn, cache_gb)
    for i, p in enumerate(gruppe):
        conn.execute(f"ATTACH DATABASE ? AS p{i}", (str(p),))
    union = " UNION ALL ".join(
        f"SELECT {', '.join(ALLE)} FROM p{i}.triples" for i in range(len(gruppe)))
    conn.execute(f"""
        INSERT INTO triples ({', '.join(ALLE)})
        SELECT {PK_SQL}, SUM(count), MAX(dep_case), MAX(dep_number)
        FROM ({union})
        GROUP BY {PK_SQL}
    """)
    conn.commit()
    n = conn.execute("SELECT COUNT(*) FROM triples").fetchone()[0]
    for i in range(len(gruppe)):
        conn.execute(f"DETACH DATABASE p{i}")
    conn.close()
    return n


def sortierter_strom(pfad: Path, batch=50_000):
    """Zeilen einer WITHOUT-ROWID-Zwischen-DB in PK-Reihenfolge streamen.
    Die Tabelle IST physisch PK-sortiert -> ein einfacher Scan liefert sie sortiert."""
    c = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True)
    c.execute("PRAGMA cache_size=-262144")
    cur = c.execute(f"SELECT {', '.join(ALLE)} FROM triples")
    while True:
        rows = cur.fetchmany(batch)
        if not rows:
            break
        yield from rows
    c.close()


def stufe2(zwischen: list, ziel: Path, cache_gb: int):
    """k-Wege-Merge der sortierten Zwischen-DBs -> sequenzielle Inserts ins Ziel."""
    for s in ("", "-wal", "-shm"):
        Path(str(ziel) + s).unlink(missing_ok=True)
    conn = sqlite3.connect(ziel)
    P.init_db(conn, without_rowid=True)
    pragmas(conn, cache_gb)
    ins = f"INSERT INTO triples ({', '.join(ALLE)}) VALUES ({','.join('?' * len(ALLE))})"

    strom = heapq.merge(*(sortierter_strom(z) for z in zwischen), key=lambda r: r[:8])
    puffer = []
    n_out = 0
    akt_key = None
    akt_count = 0
    akt_case = akt_num = ""
    t0 = time.time()

    def schreibe():
        nonlocal puffer
        if puffer:
            conn.executemany(ins, puffer)
            puffer = []

    for r in strom:
        key = r[:8]
        if key != akt_key:
            if akt_key is not None:
                puffer.append((*akt_key, akt_count, akt_case, akt_num))
                n_out += 1
                if len(puffer) >= 20_000:
                    schreibe()
                    if n_out % 20_000_000 == 0:
                        print(f"    {n_out:,} Zeilen ... ({n_out/(time.time()-t0)/1000:.0f}k/s)", flush=True)
            akt_key, akt_count, akt_case, akt_num = key, r[8], r[9], r[10]
        else:
            akt_count += r[8]
    if akt_key is not None:
        puffer.append((*akt_key, akt_count, akt_case, akt_num))
        n_out += 1
    schreibe()
    conn.commit()
    conn.close()
    return n_out


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--parts", action="append", required=True,
                    help="Verzeichnis mit Teil-DBs (mehrfach angebbar)")
    ap.add_argument("--tmp-dir", required=True,
                    help="Verzeichnis fuer die Zwischen-DBs (viel Platz, gern HDD)")
    ap.add_argument("--gruppe", type=int, default=8, help="Teil-DBs je Stufe-1-Gruppe (max 9)")
    ap.add_argument("--cache-gb", type=int, default=2)
    args = ap.parse_args()

    teile = []
    for d in args.parts:
        teile += sorted(Path(d).glob("*.db"))
    if not teile:
        print("Keine Teil-DBs gefunden.")
        sys.exit(1)

    tmp = Path(args.tmp_dir)
    tmp.mkdir(parents=True, exist_ok=True)
    # SQLites externer Sortierer soll seine temporaeren Dateien dorthin legen.
    # Auf Windows ermittelt SQLite das Temp-Verzeichnis ueber GetTempPath(), das
    # TMP/TEMP auswertet - ohne diese beiden landen die Sortierdateien (zweistellige
    # GB!) auf dem Systemlaufwerk und koennen es fuellen.
    for var in ("SQLITE_TMPDIR", "TMPDIR", "TMP", "TEMP"):
        os.environ[var] = str(tmp)

    print(f"{len(teile)} Teil-DBs | Gruppengroesse {args.gruppe} | tmp: {tmp}")
    gruppen = [teile[i:i + args.gruppe] for i in range(0, len(teile), args.gruppe)]

    t_start = time.time()
    zwischen = []
    for gi, g in enumerate(gruppen):
        ziel = tmp / f"_l1_{gi}.db"
        print(f"\n[Stufe 1 – Gruppe {gi + 1}/{len(gruppen)}] {len(g)} Teil-DBs -> {ziel.name}")
        for p in g:
            print(f"    {p.name}")
        t0 = time.time()
        n = stufe1(g, ziel, args.cache_gb)
        print(f"  -> {n:,} Zeilen, {ziel.stat().st_size/1e9:.2f} GB, {time.time()-t0:.0f}s", flush=True)
        zwischen.append(ziel)

    print(f"\n[Stufe 2] k-Wege-Merge von {len(zwischen)} sortierten Zwischen-DBs -> {args.out}")
    t0 = time.time()
    n_final = stufe2(zwischen, Path(args.out), args.cache_gb)
    print(f"  -> {n_final:,} Zeilen in {time.time()-t0:.0f}s")

    groesse = Path(args.out).stat().st_size
    print(f"\n=== FERTIG ===")
    print(f"  triples_v2.db: {n_final:,} distinkte Triples, {groesse/1e9:.2f} GB")
    print(f"  Gesamtzeit: {(time.time()-t_start)/60:.1f} min")
    print(f"  Zwischen-DBs koennen geloescht werden: {tmp}")


if __name__ == "__main__":
    main()
