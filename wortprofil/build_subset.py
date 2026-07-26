"""
Phase C – Subset-Bau + Token-Zählung (planning/DB-Neuaufbau.md, Abschnitt 5 Phase C, Punkt 1+2)

Liest jede v2-JSONL in 02_parsed_v2/ EINMAL und tut dabei zweierlei:
  1. Schreibt jede 100. Zeile (idx % 100 == 0, deterministisch) nach
     02_parsed_v2_subset/<name>.jsonl  → 1 %-Subset, alle Korpora vertreten.
  2. Zählt split()-Tokens (identische Logik wie count_tokens.py) je quelle,
     sowohl für den Vollkorpus als auch für den Subset.

Damit fällt die Gesamt-Tokenzahl (Input für die Phase-C-Laufzeit-Hochrechnung
und die F9-Entscheidung) im selben Durchlauf ab, statt 24 GB zweimal zu lesen.
Die reine Token-Zählung ist bewusst dieselbe wie in count_tokens.py
(text.split()), damit die Zahlen vergleichbar bleiben.

Ausgabe zusätzlich als JSON: 02_parsed_v2_subset/_subset_stats.json

Aufruf (aus wortprofil/):
    wortprofil-env\\Scripts\\python.exe build_subset.py
    ... --step 100          # anderer Sampling-Schritt
    ... --out-dir X         # anderes Zielverzeichnis
"""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
IN_DIR_DEFAULT = ROOT / "02_parsed_v2"
OUT_DIR_DEFAULT = ROOT / "02_parsed_v2_subset"


def verarbeite(pfad: Path, out_pfad: Path, step: int):
    """Eine JSONL streamen: jede step-te Zeile in out_pfad schreiben, dabei
    split()-Tokens je quelle für Voll + Subset zählen.
    Rückgabe: dict mit voll/subset Dok- und Token-Zahlen je quelle."""
    voll_tokens: dict[str, int] = {}
    voll_docs: dict[str, int] = {}
    sub_tokens: dict[str, int] = {}
    sub_docs: dict[str, int] = {}
    idx = 0
    with pfad.open(encoding="utf-8") as f, out_pfad.open("w", encoding="utf-8") as out:
        for zeile in f:
            zeile_s = zeile.strip()
            if not zeile_s:
                continue
            try:
                obj = json.loads(zeile_s)
            except json.JSONDecodeError:
                continue
            quelle = obj.get("quelle", "?")
            ntok = len((obj.get("text") or "").split())
            voll_tokens[quelle] = voll_tokens.get(quelle, 0) + ntok
            voll_docs[quelle] = voll_docs.get(quelle, 0) + 1
            if idx % step == 0:
                out.write(zeile if zeile.endswith("\n") else zeile + "\n")
                sub_tokens[quelle] = sub_tokens.get(quelle, 0) + ntok
                sub_docs[quelle] = sub_docs.get(quelle, 0) + 1
            idx += 1
    return {
        "voll_tokens": voll_tokens, "voll_docs": voll_docs,
        "sub_tokens": sub_tokens, "sub_docs": sub_docs,
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser(description="Phase C: 1%-Subset bauen + Tokens zählen")
    ap.add_argument("--in-dir", default=str(IN_DIR_DEFAULT))
    ap.add_argument("--out-dir", default=str(OUT_DIR_DEFAULT))
    ap.add_argument("--step", type=int, default=100, help="Sampling-Schritt (jede N-te Zeile, Standard 100)")
    args = ap.parse_args()

    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dateien = sorted(in_dir.glob("*.jsonl"))
    print(f"{len(dateien)} JSONL-Dateien in {in_dir}, Sampling-Schritt {args.step}\n")
    print(f"{'Datei':<30} {'Voll-Dok':>10} {'Voll-Tokens':>16} {'Sub-Dok':>9} {'Sub-Tokens':>14}")
    print("-" * 84)

    gesamt = {
        "voll_tokens": {}, "voll_docs": {},
        "sub_tokens": {}, "sub_docs": {},
        "pro_datei": {},
    }
    t0 = time.perf_counter()
    for pfad in dateien:
        out_pfad = out_dir / pfad.name
        r = verarbeite(pfad, out_pfad, args.step)
        vd = sum(r["voll_docs"].values())
        vt = sum(r["voll_tokens"].values())
        sd = sum(r["sub_docs"].values())
        st = sum(r["sub_tokens"].values())
        print(f"{pfad.name:<30} {vd:>10,} {vt:>16,} {sd:>9,} {st:>14,}", flush=True)
        for k in ("voll_tokens", "voll_docs", "sub_tokens", "sub_docs"):
            for q, v in r[k].items():
                gesamt[k][q] = gesamt[k].get(q, 0) + v
        gesamt["pro_datei"][pfad.name] = {
            "voll_docs": vd, "voll_tokens": vt, "sub_docs": sd, "sub_tokens": st,
            "quellen": sorted(r["voll_docs"].keys()),
        }

    dt = time.perf_counter() - t0
    vt_total = sum(gesamt["voll_tokens"].values())
    st_total = sum(gesamt["sub_tokens"].values())
    vd_total = sum(gesamt["voll_docs"].values())
    sd_total = sum(gesamt["sub_docs"].values())
    print("=" * 84)
    print(f"{'TOTAL':<30} {vd_total:>10,} {vt_total:>16,} {sd_total:>9,} {st_total:>14,}")
    print(f"\nSubset-Anteil Tokens: {st_total/vt_total*100:.3f} %   (Ziel ~{100/args.step:.2f} %)")
    print(f"Durchlauf: {dt:,.1f}s")

    # Für die Parse-Hochrechnung: nur die wortprofil-Korpora (parse_deps_v2.DATEIEN,
    # OHNE wikipedia — die geht nur in belege). Wird hier nur roh je quelle abgelegt;
    # die Zuordnung quelle→wortprofil/belege macht die Auswertung.
    stats = {
        "step": args.step,
        "in_dir": str(in_dir),
        "out_dir": str(out_dir),
        "voll_tokens_total": vt_total,
        "subset_tokens_total": st_total,
        "voll_docs_total": vd_total,
        "subset_docs_total": sd_total,
        "voll_tokens_je_quelle": gesamt["voll_tokens"],
        "voll_docs_je_quelle": gesamt["voll_docs"],
        "subset_tokens_je_quelle": gesamt["sub_tokens"],
        "subset_docs_je_quelle": gesamt["sub_docs"],
        "pro_datei": gesamt["pro_datei"],
    }
    stats_pfad = out_dir / "_subset_stats.json"
    stats_pfad.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Stats: {stats_pfad}")


if __name__ == "__main__":
    main()
