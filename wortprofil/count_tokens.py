"""
Zählt Tokens (Wörter via split()) je JSONL-Datei in 02_parsed/.
Gruppiert nach quelle-Wert.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

PARSED_DIR = Path(__file__).parent / "02_parsed"

def count_file(path: Path):
    quelle_tokens = defaultdict(int)
    quelle_docs   = defaultdict(int)
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text   = obj.get("text", "")
                quelle = obj.get("quelle", "?")
                quelle_tokens[quelle] += len(text.split())
                quelle_docs[quelle]   += 1
            except Exception:
                pass
    return quelle_tokens, quelle_docs

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    total_tokens = 0
    print(f"{'Datei':<35} {'Quelle':<28} {'Tokens':>14} {'Dokumente':>10}")
    print("-" * 92)

    for path in sorted(PARSED_DIR.glob("*.jsonl")):
        qt, qd = count_file(path)
        file_tokens = sum(qt.values())
        total_tokens += file_tokens
        first = True
        for quelle in sorted(qt, key=lambda q: -qt[q]):
            fname = path.name if first else ""
            print(f"{fname:<35} {quelle:<28} {qt[quelle]:>14,} {qd[quelle]:>10,}")
            first = False
        if len(qt) > 1:
            print(f"{'':35} {'  GESAMT':<28} {file_tokens:>14,}")
        print()

    print("=" * 92)
    print(f"{'TOTAL':35} {'':28} {total_tokens:>14,}")
