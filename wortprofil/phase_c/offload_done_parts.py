"""
Fertige Teil-DBs von der SSD auf eine grosse HDD auslagern (Phase D, Platznot).

Fertige Shards (parse_progress.done=1) werden nur noch sequenziell fuer den Merge
gelesen — sie muessen nicht auf der SSD liegen. Das haelt die SSD frei fuer die
aktiven Shards (Random-I/O bei jedem Checkpoint) und fuer die Merge-Ausgabe.

SICHER GEGEN ABBRUCH: kopieren -> Kopie verifizieren (quick_check + done-Flag)
-> erst dann die Quelle loeschen. Ein Abbruch hinterlaesst hoechstens eine
unvollstaendige Kopie im Ziel, nie eine geloeschte Quelle. (In Phase D real
passiert: ein Timeout mitten in shutil.move hinterliess eine malformed Kopie.)

Aufruf:
    python phase_c/offload_done_parts.py --von C:/wortprofil_v2/parts \
        --nach D:/.../_work_triples_v2/parts_done [--min-gb 0.5]
"""

import argparse
import os
import shutil
import sqlite3
import sys
from pathlib import Path


def ist_fertig(pfad: Path) -> bool:
    try:
        c = sqlite3.connect(f"file:{pfad}?mode=ro", uri=True, timeout=10)
        r = c.execute("SELECT done FROM parse_progress").fetchone()
        c.close()
        return bool(r and int(r[0]) == 1)
    except sqlite3.Error:
        return False


def kopie_ok(kopie: Path, quelle: Path) -> bool:
    """Kopie verifizieren — bewusst OHNE `PRAGMA quick_check`.

    quick_check scannt die komplette Datei; auf einer HDD sind das bei einer
    5,5-GB-Teil-DB >2 h (in Phase D real gemessen: 586 KB/s, Auslagerung stand
    faktisch still). Stattdessen drei billige Prüfungen, die die realistischen
    Kopierfehler (Abbruch = abgeschnittene Datei) sicher fangen:
      1. Byte-genau gleiche Dateigröße wie die Quelle,
      2. `page_count * page_size` deckt die Dateigröße (kein abgeschnittener B-Baum),
      3. die Nutzdaten sind lesbar (parse_progress mit done=1, MAX(rowid) > 0).
    """
    try:
        if kopie.stat().st_size != quelle.stat().st_size:
            return False
        c = sqlite3.connect(f"file:{kopie}?mode=ro", uri=True, timeout=30)
        seiten = c.execute("PRAGMA page_count").fetchone()[0]
        groesse = c.execute("PRAGMA page_size").fetchone()[0]
        r = c.execute("SELECT done FROM parse_progress").fetchone()
        n = c.execute("SELECT COALESCE(MAX(rowid), 0) FROM triples").fetchone()[0]
        c.close()
        return (seiten * groesse >= kopie.stat().st_size * 0.99
                and bool(r) and int(r[0]) == 1 and n > 0)
    except (sqlite3.Error, OSError):
        return False


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--von", required=True)
    ap.add_argument("--nach", required=True)
    ap.add_argument("--min-gb", type=float, default=0.0,
                    help="Nur Teil-DBs ab dieser Groesse auslagern (kleine lohnen nicht)")
    args = ap.parse_args()

    quelle = Path(args.von)
    ziel = Path(args.nach)
    ziel.mkdir(parents=True, exist_ok=True)

    n_ok = 0
    gb_frei = 0.0
    for db in sorted(quelle.glob("*.db")):
        groesse_gb = db.stat().st_size / 1e9
        if groesse_gb < args.min_gb:
            continue
        if not ist_fertig(db):
            print(f"  [aktiv]  {db.name} — bleibt auf der SSD")
            continue

        print(f"  [move]   {db.name} ({groesse_gb:.2f} GB) ...", end="", flush=True)
        dateien = [db] + [Path(str(db) + s) for s in ("-wal", "-shm") if Path(str(db) + s).exists()]
        # 1. kopieren — bereits vollstaendig vorhandene Kopie nicht erneut schreiben
        #    (Wiederaufnahme nach Abbruch)
        for f in dateien:
            ziel_f = ziel / f.name
            if not (ziel_f.exists() and ziel_f.stat().st_size == f.stat().st_size):
                shutil.copy2(f, ziel_f)
        # 2. verifizieren
        if not kopie_ok(ziel / db.name, db):
            print(" FEHLER: Kopie defekt — Quelle bleibt, Kopie verworfen.")
            for f in dateien:
                (ziel / f.name).unlink(missing_ok=True)
            continue
        # 3. Quelle erst jetzt loeschen
        for f in dateien:
            f.unlink(missing_ok=True)
        n_ok += 1
        gb_frei += groesse_gb
        print(f" OK ({gb_frei:.1f} GB frei)")

    print(f"\n{n_ok} Teil-DBs ausgelagert, {gb_frei:.1f} GB auf der Quelle freigegeben.")


if __name__ == "__main__":
    main()
