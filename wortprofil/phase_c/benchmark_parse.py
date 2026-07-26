"""
Phase C – Parser-Benchmark (F9): Tokens/s + Voll-Laufzeit-Hochrechnung

Misst den Durchsatz von parse_deps_v2 (dieselbe Parse+Extraktions-Kette wie der
echte Lauf, ohne DB-Schreiben) für verschiedene Konfigurationen:
  * dwdsmor AN / AUS
  * --workers 1 / N   (Windows: n_process>1 = spawn → jeder Worker lädt das
    Modell neu; dieser einmalige Overhead wird über die DIFFERENZMETHODE
    herausgerechnet: Rate = (Tokens[L2] - Tokens[L1]) / (Zeit[L2] - Zeit[L1]).
    Der konstante Spawn/Load-Overhead kürzt sich weg → Steady-State-Durchsatz,
    der für den langen Voll-Lauf relevant ist.)

Misst BEIDE Token-Definitionen:
  * spaCy-Tokens  (len(doc), inkl. Interpunktion)
  * split-Tokens  (len(doc.text.split()), identisch zu count_tokens.py) → für
    die konsistente ETA gegen die Gesamt-Tokenzahl aus count_tokens.py/build_subset.

Hochrechnung: ETA = Gesamt-split-Tokens (nur wortprofil-Korpora, OHNE wikipedia)
/ Steady-State-split-Tokens/s.

Aufruf (aus wortprofil/):
    wortprofil-env\\Scripts\\python.exe phase_c/benchmark_parse.py \\
        --datei 02_parsed_v2/leipzig.jsonl \\
        --total-split-tokens 2500000000 --out-json phase_c/benchmark.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "03_parse"))
import parse_deps_v2 as P  # noqa: E402


def measure(nlp, pfad: Path, workers: int, limit: int):
    """Verarbeitet limit Chunks aus pfad und misst Zeit + Token-/Triple-Zahlen.
    Kein DB-Schreiben (reiner Parse-Durchsatz)."""
    gen = P.iter_chunks(pfad, limit=limit)
    n_chunks = n_spacy = n_split = n_triples = 0
    t0 = time.perf_counter()
    for doc, ctx in nlp.pipe(gen, as_tuples=True, batch_size=P.BATCH_SIZE, n_process=workers):
        n_chunks += 1
        n_spacy += len(doc)
        n_split += len(doc.text.split())
        n_triples += len(P.extrahiere_triples(doc))
    dt = time.perf_counter() - t0
    return {"chunks": n_chunks, "spacy_tokens": n_spacy, "split_tokens": n_split,
            "triples": n_triples, "dt": dt}


def steady_rate(m1: dict, m2: dict, key: str):
    """Steady-State-Rate über Differenz zweier Messungen (Overhead kürzt sich)."""
    d_tok = m2[key] - m1[key]
    d_t = m2["dt"] - m1["dt"]
    if d_t <= 0:
        return None
    return d_tok / d_t


def run_config(nlp, pfad, workers, limit_small, limit_big, dwdsmor_on):
    print(f"\n--- Config: dwdsmor={'AN' if dwdsmor_on else 'AUS'} · workers={workers} ---")
    if workers == 1:
        # Kein Spawn/Reload → eine Messung genügt (Modell ist schon geladen).
        m = measure(nlp, pfad, workers, limit_big)
        naive_split = m["split_tokens"] / m["dt"]
        naive_spacy = m["spacy_tokens"] / m["dt"]
        print(f"  {m['chunks']:,} Chunks · {m['spacy_tokens']:,} spaCy-Tok · "
              f"{m['split_tokens']:,} split-Tok · {m['triples']:,} Triples in {m['dt']:.1f}s")
        print(f"  → split {naive_split:,.0f} Tok/s · spaCy {naive_spacy:,.0f} Tok/s")
        return {
            "workers": workers, "dwdsmor": dwdsmor_on,
            "messungen": [m],
            "steady_split_tok_s": naive_split,
            "steady_spacy_tok_s": naive_spacy,
            "spawn_overhead_s": 0.0,
        }
    # Multi-Worker: zwei Messungen (Differenzmethode)
    m1 = measure(nlp, pfad, workers, limit_small)
    m2 = measure(nlp, pfad, workers, limit_big)
    r_split = steady_rate(m1, m2, "split_tokens")
    r_spacy = steady_rate(m1, m2, "spacy_tokens")
    # Spawn/Load-Overhead schätzen: dt(L1) - Verarbeitungszeit(L1) bei Steady-Rate
    proc_time_l1 = m1["split_tokens"] / r_split if r_split else 0
    overhead = max(0.0, m1["dt"] - proc_time_l1)
    naive_split_big = m2["split_tokens"] / m2["dt"]
    print(f"  L1={m1['chunks']:,} Chunks in {m1['dt']:.1f}s | L2={m2['chunks']:,} Chunks in {m2['dt']:.1f}s")
    print(f"  Spawn/Load-Overhead ~{overhead:.1f}s")
    print(f"  → Steady split {r_split:,.0f} Tok/s · spaCy {r_spacy:,.0f} Tok/s "
          f"(naiv inkl. Overhead bei L2: {naive_split_big:,.0f} split Tok/s)")
    return {
        "workers": workers, "dwdsmor": dwdsmor_on,
        "messungen": [m1, m2],
        "steady_split_tok_s": r_split,
        "steady_spacy_tok_s": r_spacy,
        "naive_split_tok_s_big": naive_split_big,
        "spawn_overhead_s": overhead,
    }


def eta_zeile(total_split_tokens, split_tok_s):
    if not split_tok_s or split_tok_s <= 0:
        return None
    sek = total_split_tokens / split_tok_s
    return {"stunden": sek / 3600, "tage": sek / 86400}


def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--datei", required=True, help="JSONL-Datei zum Benchmarken (Voll oder Subset)")
    ap.add_argument("--workers-list", default="1,4,8", help="z.B. '1,4,8'")
    ap.add_argument("--dwdsmor", choices=["on", "off", "both"], default="both")
    ap.add_argument("--limit-small", type=int, default=1500)
    ap.add_argument("--limit-big", type=int, default=6000)
    ap.add_argument("--total-split-tokens", type=int, default=None,
                    help="Gesamt-split-Tokens der wortprofil-Korpora (ohne wikipedia) für die ETA")
    ap.add_argument("--out-json", default=None)
    args = ap.parse_args()

    pfad = Path(args.datei)
    if not pfad.is_absolute():
        pfad = ROOT / args.datei
    if not pfad.exists():
        print(f"FEHLER: Datei nicht gefunden: {pfad}")
        sys.exit(1)

    workers_list = [int(w) for w in args.workers_list.split(",")]
    dwds_settings = {"on": [True], "off": [False], "both": [True, False]}[args.dwdsmor]

    ergebnisse = []
    for dwdsmor_on in dwds_settings:
        nlp = P.lade_modell(use_dwdsmor=dwdsmor_on)
        for workers in workers_list:
            r = run_config(nlp, pfad, workers, args.limit_small, args.limit_big, dwdsmor_on)
            if args.total_split_tokens:
                r["eta"] = eta_zeile(args.total_split_tokens, r["steady_split_tok_s"])
            ergebnisse.append(r)
        del nlp

    # ETA-Tabelle
    print("\n\n=== ETA-Hochrechnung (Voll-Parse, wortprofil-Korpora) ===")
    if args.total_split_tokens:
        print(f"Gesamt-split-Tokens (ohne wikipedia): {args.total_split_tokens:,}")
        print(f"{'dwdsmor':<8} {'workers':>7} {'split Tok/s':>12} {'Stunden':>9} {'Tage':>7}")
        print("-" * 50)
        for r in ergebnisse:
            eta = r.get("eta")
            if eta:
                print(f"{'AN' if r['dwdsmor'] else 'AUS':<8} {r['workers']:>7} "
                      f"{r['steady_split_tok_s']:>12,.0f} {eta['stunden']:>9,.1f} {eta['tage']:>7,.2f}")

    out = {
        "datei": str(pfad),
        "total_split_tokens": args.total_split_tokens,
        "configs": ergebnisse,
    }
    if args.out_json:
        Path(args.out_json).write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nJSON: {args.out_json}")


if __name__ == "__main__":
    main()
