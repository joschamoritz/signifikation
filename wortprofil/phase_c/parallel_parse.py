"""
Phase C / F9 – Prozess-Level-Parallel-Parser (Windows-Weg)

Hintergrund: spaCys eingebaute Parallelisierung `nlp.pipe(n_process=N)` bricht mit
dwdsmor auf Windows ab — der sfst-Transducer (`sfst_transduce.CompactTransducer`)
ist nicht picklebar, und Windows-`spawn` muss die Pipeline picklen
(`TypeError: cannot pickle 'sfst_transduce.CompactTransducer'`). Auf Linux würde
`fork` das umgehen; auf Windows nicht.

Dieser Orchestrator umgeht das über PROZESS-Parallelität: mehrere unabhängige
`parse_deps_v2.py`-Instanzen (jede single-thread, eigenes Modell, dwdsmor AN),
die verschiedene Shards parsen und ihre Teil-DBs am Ende gemergt werden. Kein
Pickling, kein spawn innerhalb spaCy.

Ablauf:
  1. Shard-Phase: jede Eingabedatei wird deterministisch in --shards Teile
     zerlegt (Zeile j → Shard j % shards); leere Shards werden übersprungen.
  2. Parse-Phase: Prozess-Pool von --pool gleichzeitigen parse_deps_v2-Instanzen
     (--only <shard> --db parts/<shard>.db --reset --no-... wie konfiguriert).
  3. Merge-Phase: alle parts/*.db → --out-db (UPSERT count += count; dep_case/
     dep_number behalten den zuerst gemergten Wert — dokumentierte Näherung wie
     in parse_deps_v2 selbst, App-seitig ungenutzt).
  4. Report: Wall-Clock + aggregierter Durchsatz (split-Tokens via count_tokens-
     Logik über die tatsächlich geparsten Shards).

Aufruf (aus wortprofil/):
    wortprofil-env\\Scripts\\python.exe phase_c/parallel_parse.py \\
        --input-dir 02_parsed_v2_subset --out-db phase_c/db/triples_subset.db \\
        --shards 6 --pool 8
"""

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
PY = sys.executable
PARSE_SCRIPT = ROOT / "03_parse" / "parse_deps_v2.py"

sys.path.insert(0, str(ROOT / "03_parse"))
import parse_deps_v2 as P  # noqa: E402


def shard_datei(pfad: Path, shards: int, out_dir: Path, basisname: str):
    """Zerlegt pfad deterministisch in <=shards Shard-JSONL. Gibt Liste der
    erzeugten (nicht-leeren) Shard-Basisnamen + split-Token-Summe zurück."""
    handles = []
    counts = [0] * shards
    tokens = 0
    for i in range(shards):
        handles.append((out_dir / f"{basisname}__{i}.jsonl").open("w", encoding="utf-8"))
    idx = 0
    with pfad.open(encoding="utf-8") as f:
        for zeile in f:
            if not zeile.strip():
                continue
            s = idx % shards
            handles[s].write(zeile if zeile.endswith("\n") else zeile + "\n")
            counts[s] += 1
            try:
                tokens += len((json.loads(zeile).get("text") or "").split())
            except json.JSONDecodeError:
                pass
            idx += 1
    for h in handles:
        h.close()
    erzeugt = []
    for i in range(shards):
        p = out_dir / f"{basisname}__{i}.jsonl"
        if counts[i] > 0:
            erzeugt.append(f"{basisname}__{i}")
        else:
            p.unlink(missing_ok=True)
    return erzeugt, tokens


def merge_parts(part_dbs: list, out_db: Path):
    """Alle Teil-triples-DBs in out_db mergen (UPSERT count += count)."""
    conn = sqlite3.connect(out_db)
    P.init_db(conn)
    for i, part in enumerate(part_dbs):
        if not Path(part).exists():
            continue
        conn.execute("ATTACH DATABASE ? AS p", (str(part),))
        conn.execute("""
            INSERT INTO triples
                (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr,
                 count, dep_case, dep_number)
            SELECT head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr,
                   count, dep_case, dep_number
            FROM p.triples
            WHERE true
            ON CONFLICT (head_lemma, head_pos, relation, dep_lemma, dep_pos, prep, quelle, jahr)
            DO UPDATE SET count = count + excluded.count
        """)
        conn.commit()
        conn.execute("DETACH DATABASE p")
    n = conn.execute("SELECT COUNT(*) FROM triples").fetchone()[0]
    total = conn.execute("SELECT COALESCE(SUM(count),0) FROM triples").fetchone()[0]
    conn.close()
    return n, total


def shard_done(part_db: Path, shard_basis: str) -> bool:
    """True, wenn die Teil-DB existiert und parse_deps_v2 den Shard als vollständig
    (parse_progress.done=1) markiert hat → beim Resume überspringen."""
    if not part_db.exists():
        return False
    try:
        c = sqlite3.connect(f"file:{part_db}?mode=ro", uri=True)
        row = c.execute("SELECT done FROM parse_progress WHERE datei=?",
                        (f"{shard_basis}.jsonl",)).fetchone()
        c.close()
        return row is not None and int(row[0]) == 1
    except sqlite3.Error:
        return False


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--input-dir", required=True)
    ap.add_argument("--out-db", required=True)
    ap.add_argument("--dateien", default=None,
                    help="Kommagetrennt ohne .jsonl; default = parse_deps_v2.DATEIEN ∩ vorhanden")
    ap.add_argument("--shards", type=int, default=6, help="Shards pro Datei")
    ap.add_argument("--pool", type=int, default=max(1, (os.cpu_count() or 4) // 2),
                    help="gleichzeitige Parse-Prozesse")
    ap.add_argument("--limit", type=int, default=None, help="Max. Chunks pro Shard (Test)")
    ap.add_argument("--no-dwdsmor", action="store_true")
    ap.add_argument("--workdir", default=None)
    ap.add_argument("--keep-work", action="store_true")
    ap.add_argument("--resume", action="store_true",
                    help="Vorhandene Shards + Teil-DBs im workdir wiederverwenden: "
                         "fertige Shards überspringen, angefangene ab Checkpoint fortsetzen "
                         "(für den Tage-Lauf – Absturz kostet nur den laufenden Shard). "
                         "Impliziert --keep-work.")
    ap.add_argument("--include-wikipedia", action="store_true",
                    help="wikipedia.jsonl zusätzlich parsen (F1-A/B 'mit wiki')")
    args = ap.parse_args()
    if args.resume:
        args.keep_work = True

    input_dir = Path(args.input_dir)
    out_db = Path(args.out_db)
    out_db.parent.mkdir(parents=True, exist_ok=True)
    workdir = Path(args.workdir) if args.workdir else (out_db.parent / f"_work_{out_db.stem}")
    shard_dir = workdir / "shards"
    part_dir = workdir / "parts"
    for d in (shard_dir, part_dir):
        d.mkdir(parents=True, exist_ok=True)

    # Dateiliste
    if args.dateien:
        basisnamen = [d.strip() for d in args.dateien.split(",")]
    else:
        basisnamen = [d[:-6] for d in P.DATEIEN if (input_dir / d).exists()]
        if args.include_wikipedia and (input_dir / "wikipedia.jsonl").exists():
            basisnamen.append("wikipedia")
    dateien = [(b, input_dir / f"{b}.jsonl") for b in basisnamen if (input_dir / f"{b}.jsonl").exists()]
    print(f"Dateien: {len(dateien)} | shards/Datei: {args.shards} | pool: {args.pool}")
    print(f"Ausgabe: {out_db}\n")

    # ── Shard-Phase (adaptiv: Shard-Zahl ~ Dateigröße) ───────────────────────
    # Modell-Load (~40s) fällt PRO Shard an → nicht zu viele kleine Shards.
    # Große Dateien bekommen bis zu --shards Teile, kleine genau 1 → wenige,
    # etwa gleich große Jobs, minimaler Load-Overhead bei guter Balance.
    meta_pfad = workdir / "_shard_meta.json"
    t_shard0 = time.perf_counter()
    vorhandene_shards = sorted(p.stem for p in shard_dir.glob("*.jsonl"))
    if args.resume and vorhandene_shards and meta_pfad.exists():
        # Resume: nicht neu sharden — vorhandene Shards + gespeicherte Token-Zahl nutzen.
        meta = json.loads(meta_pfad.read_text(encoding="utf-8"))
        jobs = meta["jobs"]
        total_tokens = meta["total_tokens"]
        print(f"[RESUME] {len(jobs)} vorhandene Shards aus {shard_dir} wiederverwendet "
              f"({total_tokens:,} split-Tokens).")
    else:
        groessen = {b: pfad.stat().st_size for b, pfad in dateien}
        max_groesse = max(groessen.values()) if groessen else 1
        jobs = []
        total_tokens = 0
        for basis, pfad in dateien:
            s_i = max(1, round(args.shards * groessen[basis] / max_groesse))
            erzeugt, tok = shard_datei(pfad, s_i, shard_dir, basis)
            total_tokens += tok
            jobs.extend(erzeugt)
        meta_pfad.write_text(json.dumps({"jobs": jobs, "total_tokens": total_tokens},
                                        ensure_ascii=False), encoding="utf-8")
        print(f"Shard-Phase: {len(jobs)} Shards (adaptiv), {total_tokens:,} split-Tokens "
              f"in {time.perf_counter()-t_shard0:.1f}s")

    # ── Parse-Phase (Prozess-Pool) ───────────────────────────────────────────
    t_parse0 = time.perf_counter()
    part_dbs = [part_dir / f"{j}.db" for j in jobs]

    def cmd_for(job):
        c = [PY, "-u", str(PARSE_SCRIPT), "--only", job,
             "--input-dir", str(shard_dir), "--db", str(part_dir / f"{job}.db")]
        # Ohne --resume: jeden Shard frisch (--reset). Mit --resume: KEIN --reset →
        # parse_deps_v2 setzt via parse_progress (Chunk-Offset, K8) am Checkpoint fort.
        if not args.resume:
            c += ["--reset"]
        if args.limit:
            c += ["--limit", str(args.limit)]
        if args.no_dwdsmor:
            c += ["--no-dwdsmor"]
        return c

    laufend = {}   # Popen -> job
    # Resume: bereits vollständige Shards (parse_progress.done=1) überspringen.
    if args.resume:
        offen = [j for j in jobs if not shard_done(part_dir / f"{j}.db", j)]
        n_skip = len(jobs) - len(offen)
        print(f"[RESUME] {n_skip} Shards bereits fertig, {len(offen)} offen (davon einige "
              f"ggf. mit Teil-Fortschritt).")
        warteschlange = offen
    else:
        warteschlange = list(jobs)
    logdir = workdir / "logs"
    logdir.mkdir(exist_ok=True)
    fertig = 0

    def starte_naechsten():
        if not warteschlange:
            return
        job = warteschlange.pop(0)
        logf = (logdir / f"{job}.log").open("w", encoding="utf-8")
        p = subprocess.Popen(cmd_for(job), stdout=logf, stderr=subprocess.STDOUT)
        laufend[p] = (job, logf)

    n_start = len(warteschlange)
    for _ in range(min(args.pool, len(warteschlange))):
        starte_naechsten()

    fehler = []
    while laufend:
        for p in list(laufend.keys()):
            rc = p.poll()
            if rc is not None:
                job, logf = laufend.pop(p)
                logf.close()
                fertig += 1
                status = "OK" if rc == 0 else f"FEHLER rc={rc}"
                if rc != 0:
                    fehler.append(job)
                print(f"  [{fertig}/{n_start}] {job}: {status}", flush=True)
                starte_naechsten()
        if laufend:
            time.sleep(0.5)
    if fehler:
        print(f"\n⚠️  {len(fehler)} Shard(s) mit Fehler: {fehler}")
        print("   → Ursache in workdir/logs/<shard>.log prüfen, dann erneut mit --resume "
              "(fertige Shards werden übersprungen, nur die fehlerhaften laufen neu).")
    t_parse = time.perf_counter() - t_parse0
    durchsatz = "" if args.resume else f" ({total_tokens/t_parse:,.0f} split-Tok/s aggregiert über {args.pool} Prozesse)"
    print(f"\nParse-Phase: {t_parse:.1f}s{durchsatz}")

    # Bei Shard-Fehlern NICHT mergen: sonst entstünde eine unvollständige triples-DB,
    # die wie fertig aussieht. workdir bleibt erhalten → erneut mit --resume starten.
    if fehler:
        print(f"\n[ABBRUCH] {len(fehler)} Shard(s) fehlgeschlagen — Merge übersprungen, "
              f"out-db NICHT gebaut. workdir behalten: {workdir}")
        print("Nach Fehleranalyse erneut mit --resume starten.")
        sys.exit(1)

    # ── Merge-Phase ──────────────────────────────────────────────────────────
    for suffix in ("", "-shm", "-wal"):
        Path(str(out_db) + suffix).unlink(missing_ok=True)
    t_merge0 = time.perf_counter()
    n_rows, n_count = merge_parts(part_dbs, out_db)
    print(f"Merge-Phase: {n_rows:,} distinkte Triples ({n_count:,} Vorkommen) in {time.perf_counter()-t_merge0:.1f}s")

    gesamt = time.perf_counter() - t_shard0
    print(f"\n=== Fertig: {out_db} ===")
    print(f"  Gesamt: {gesamt:.1f}s | aggregierter Parse-Durchsatz: {total_tokens/t_parse:,.0f} split-Tok/s")

    # Report-JSON
    report = {
        "out_db": str(out_db), "dateien": basisnamen, "shards": args.shards, "pool": args.pool,
        "n_jobs": len(jobs), "total_split_tokens": total_tokens,
        "parse_sekunden": t_parse, "aggregat_split_tok_s": total_tokens / t_parse,
        "merge_sekunden": time.perf_counter() - t_merge0, "distinkte_triples": n_rows,
        "gesamt_sekunden": gesamt,
    }
    (out_db.parent / f"{out_db.stem}_parse_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if not args.keep_work:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
