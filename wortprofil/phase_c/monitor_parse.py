"""
Phase D – Fortschritts-Monitor für parallel_parse.py (Tage-Lauf)

Einmaliger Snapshot über das workdir eines laufenden (oder abgestürzten)
parallel_parse-Laufs: wie viele Shards fertig / in Arbeit / offen, Gesamt-Chunks,
Gesamt-Triples, letzte Aktivität. Speichert den Snapshot und zeigt beim nächsten
Aufruf den Durchsatz + eine ETA (Delta zum letzten Aufruf).

Gedacht für einen täglichen 10-Sekunden-Blick. Liest nur (mode=ro) — stört den
laufenden Parse nicht.

Aufruf (aus wortprofil/):
    wortprofil-env\\Scripts\\python.exe phase_c/monitor_parse.py --workdir <pfad>

Der workdir-Pfad ist der von parallel_parse angelegte Ordner
(`<out-db-verzeichnis>/_work_<out-db-stem>` bzw. der explizite --workdir).
"""

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path


def shard_status(part_db: Path, shard_basis: str):
    """(offset_chunks, done, n_triples) für einen Shard. (None,…) wenn keine DB."""
    if not part_db.exists():
        return None, False, 0
    try:
        c = sqlite3.connect(f"file:{part_db}?mode=ro", uri=True)
        row = c.execute("SELECT offset, done FROM parse_progress WHERE datei=?",
                        (f"{shard_basis}.jsonl",)).fetchone()
        n_tri = c.execute("SELECT COUNT(*) FROM triples").fetchone()[0]
        c.close()
        if row is None:
            return 0, False, n_tri
        return int(row[0]), bool(row[1]), n_tri
    except sqlite3.Error:
        return None, False, 0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--workdir", required=True)
    args = ap.parse_args()
    workdir = Path(args.workdir)
    part_dir = workdir / "parts"
    meta_pfad = workdir / "_shard_meta.json"
    if not meta_pfad.exists():
        print(f"Kein _shard_meta.json in {workdir} — Shard-Phase noch nicht durch oder falscher Pfad.")
        sys.exit(1)

    meta = json.loads(meta_pfad.read_text(encoding="utf-8"))
    jobs = meta["jobs"]
    total_tokens = meta.get("total_tokens", 0)

    n_done = n_arbeit = n_offen = 0
    chunks_total = tri_total = 0
    letzte_akt = 0.0
    zeilen = []
    for job in jobs:
        pdb = part_dir / f"{job}.db"
        offset, done, n_tri = shard_status(pdb, job)
        chunks_total += (offset or 0)
        tri_total += n_tri
        if pdb.exists():
            letzte_akt = max(letzte_akt, pdb.stat().st_mtime)
        if done:
            n_done += 1
            zustand = "OK"
        elif offset:
            n_arbeit += 1
            zustand = f"…{offset:,} Chunks"
        else:
            n_offen += 1
            zustand = "offen"
        zeilen.append((job, zustand, n_tri))

    jetzt = time.time()
    print(f"=== parallel_parse Monitor: {workdir.name} ===")
    print(f"Shards: {len(jobs)}  |  fertig {n_done}  ·  in Arbeit {n_arbeit}  ·  offen {n_offen}")
    print(f"Chunks committet: {chunks_total:,}  |  Triples (Summe Teil-DBs): {tri_total:,}")
    if letzte_akt:
        alter_min = (jetzt - letzte_akt) / 60
        warn = "  ⚠️ evtl. hängt/steht" if (alter_min > 20 and n_offen + n_arbeit > 0) else ""
        print(f"Letzte DB-Aktivität: vor {alter_min:,.1f} min{warn}")

    # Durchsatz + ETA aus dem letzten Snapshot
    snap_pfad = workdir / "_monitor_last.json"
    if snap_pfad.exists():
        try:
            last = json.loads(snap_pfad.read_text(encoding="utf-8"))
            dt = jetzt - last["t"]
            d_chunks = chunks_total - last["chunks"]
            if dt > 0 and d_chunks > 0:
                rate = d_chunks / dt
                print(f"Seit letztem Check ({dt/3600:,.1f} h): +{d_chunks:,} Chunks "
                      f"→ {rate*3600:,.0f} Chunks/h")
                # grobe ETA: verbleibende Arbeit ~ (offene+laufende Shards / fertige) proportional
                if n_done > 0:
                    rest_frac = (n_arbeit + n_offen) / len(jobs)
                    getan_frac = n_done / len(jobs)
                    if getan_frac > 0:
                        # ETA über bisher committete Chunks vs. Rate (nur grobe Orientierung)
                        print(f"Fortschritt: {getan_frac*100:,.1f} % der Shards fertig")
        except (json.JSONDecodeError, KeyError):
            pass
    snap_pfad.write_text(json.dumps({"t": jetzt, "chunks": chunks_total}), encoding="utf-8")

    # Einzel-Shards (nur nicht-fertige, damit die Liste kurz bleibt)
    offen_liste = [(j, z, n) for j, z, n in zeilen if z != "OK"]
    if offen_liste:
        print("\nNicht fertige Shards:")
        for job, zustand, n_tri in offen_liste:
            print(f"  {job:<28} {zustand:<16} {n_tri:>10,} Triples")


if __name__ == "__main__":
    main()
