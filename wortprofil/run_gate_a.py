"""
Gate A – Mini-Korpus durch die komplette v2-Kette (planning/DB-Neuaufbau.md,
Abschnitt 5 „Phase A – Pipeline-Fixes", Gate A)

Baut ein winziges Mini-Korpus (2–3 handverlesene Dokumente je Quell-Korpus,
über EXTRACT_SAMPLE_LIMIT automatisch inkl. 1 sehr langem DTA-Buch
[abel_leibmedicus_1699, ~630 KB TEI-XML], 1 Bundestag-Protokoll [WP18_0001]
und 1 Leipzig-Jahrgang-Ausschnitt [deu_news 1995]) plus ein handgeschriebenes
Canary-Korpus mit gezielten Sätzen für die strukturellen Golden Queries
(auftischen/tischen, Elend, grün→~PRED, Tisch+ATTR, E-Mail) und lässt die
komplette Kette einmal end-to-end laufen:

    extract_text.py → parse_deps_v2.py → build_wortprofil_v2.py
        → build_zeitreise_v2.py → build_belege_v2.py → validate_v2.py

Alle Artefakte landen unter wortprofil/gate_a/ – die Produktions-Verzeichnisse
(02_parsed_v2/, 03_deps/triples_v2.db, 05_db/wortprofil_v2.db,
06_belege/belege_v2.db) bleiben unangetastet (Grundregel „nichts in-place").

Abweichungen von den Produktions-Defaults (bewusst, für einen aussagekräftigen
Mini-Lauf statt eines mangels Frequenz leeren):
  - build_wortprofil_v2.py läuft mit --min-count 1 (Produktion: 3) – bei 1–3
    Vorkommen pro Canary-Satz würde der Produktions-Schwellwert alles wegfiltern.
  - build_belege_v2.py bekommt --korpora mit ALLEN in gate_a/parsed/ vorhandenen
    Dateien (auch dta_kern trotz Jahr 1699 < F3-Schwelle 1830) – Gate A prüft
    Pipeline-Mechanik, nicht die F3-Scope-Entscheidung.

Aufruf (aus wortprofil/ mit aktivem wortprofil-env):
    python run_gate_a.py                 # komplette Kette, frischer gate_a/-Ordner
    python run_gate_a.py --keep          # gate_a/ nicht vorher löschen (Resume)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
GATE_A = ROOT / "gate_a"
PARSED = GATE_A / "parsed"
DEPS_DB = GATE_A / "deps" / "triples_gate_a.db"
WP_DB = GATE_A / "db" / "wortprofil_gate_a.db"
BELEGE_DB = GATE_A / "db" / "belege_gate_a.db"
REPORT = GATE_A / "gate_a_report.md"

PY = sys.executable

# ── Canary-Korpus: gezielte Sätze für die strukturellen Golden Queries ──────
# Jedes Testwort (lüge, elend, grün, tisch, e-mail) kommt bewusst wörtlich in
# ≥2 Sätzen vor (Golden Query 6: „≥2 Belege je Paar"). Sätze gegen das echte
# Modell verifiziert (Triples wie erwartet, siehe Session-Notizen).
CANARY_SAETZE = [
    # K1/dwdsmor: auftischen (nicht tischen) – Golden Query 1
    ("Der Kellner tischte den Gästen eine große Lüge auf.", 1999),
    ("Man hat den Wählern schon oft eine Lüge aufgetischt.", 2001),
    # Elend als Substantiv (POS-Mehrheit) – Golden Query 2
    ("Das Elend der Stadt war unübersehbar groß.", 1920),
    ("Nach dem Krieg herrschte großes Elend im ganzen Land.", 1922),
    # PRED→INVERTIBLE: grün bekommt ~PRED-Einträge – Golden Query 3
    ("Das Blatt bleibt den ganzen Sommer über grün.", 2005),
    ("Die Wiese erscheint nach dem Regen besonders grün.", 2006),
    # Tisch + ATTR (rund, gedeckt) – Golden Query 4
    ("Der runde Tisch stand mitten im Zimmer.", 1955),
    ("Ein gedeckter Tisch wartete schon auf die Gäste.", 1956),
    # K6: Bindestrich-Lemma E-Mail – Golden Query 8
    ("Sie schreibt eine wichtige E-Mail an den Ausschuss.", 2015),
    ("Er hat heute schon drei E-Mails beantwortet.", 2016),
]


def schreibe_canary_korpus(ziel: Path):
    ziel.mkdir(parents=True, exist_ok=True)
    pfad = ziel / "testkorpus_canary.jsonl"
    with pfad.open("w", encoding="utf-8") as f:
        for i, (satz, jahr) in enumerate(CANARY_SAETZE):
            f.write(json.dumps({
                "id": f"testkorpus_canary/{i:03d}",
                "text": satz,
                "quelle": "testkorpus",
                "genre": "canary",
                "epoche": "Gegenwart",
                "jahr": jahr,
                "titel": "",
                "autor": "",
                "ref": f"Gate-A-Canary-Satz {i:03d}",
            }, ensure_ascii=False) + "\n")
    print(f"[OK] Canary-Korpus geschrieben: {pfad} ({len(CANARY_SAETZE)} Sätze)")


def run(cmd: list, cwd: Path, env: "dict | None" = None):
    print(f"\n$ {' '.join(cmd)}   (cwd={cwd})")
    voll_env = os.environ.copy()
    if env:
        voll_env.update(env)
    result = subprocess.run(cmd, cwd=str(cwd), env=voll_env)
    if result.returncode != 0:
        print(f"\n[FEHLER] Schritt fehlgeschlagen (exit {result.returncode}): {' '.join(cmd)}")
        sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="Gate A: Mini-Korpus durch die komplette v2-Kette")
    parser.add_argument("--keep", action="store_true",
                        help="gate_a/ nicht vorher löschen (Resume/Debug)")
    parser.add_argument("--sample-limit", type=int, default=3,
                        help="Dokumente je Korpus (Standard: 3)")
    parser.add_argument("--kalender-db", help="signifikation.db für Golden Query 10 (optional)")
    args = parser.parse_args()

    if GATE_A.exists() and not args.keep:
        print(f"[CLEAN] {GATE_A} wird gelöscht ...")
        shutil.rmtree(GATE_A)
    GATE_A.mkdir(parents=True, exist_ok=True)

    # ── Schritt 0: Canary-Korpus ─────────────────────────────────────────────
    schreibe_canary_korpus(PARSED)

    # ── Schritt 1: Extraktion (alle Korpora, Mini-Sampling) ──────────────────
    run(
        [PY, "extract_text.py"],
        cwd=ROOT / "02_parse",
        env={"EXTRACT_SAMPLE_LIMIT": str(args.sample_limit), "EXTRACT_OUT_DIR": str(PARSED)},
    )

    n_dateien = sorted(PARSED.glob("*.jsonl"))
    print(f"\n[OK] {len(n_dateien)} JSONL-Dateien in {PARSED}:")
    for p in n_dateien:
        zeilen = sum(1 for _ in p.open(encoding="utf-8"))
        print(f"  {p.name}: {zeilen} Dokumente")

    # ── Schritt 2: Dependency-Parsing → triples_gate_a.db ────────────────────
    run(
        [PY, "parse_deps_v2.py", "--input-dir", str(PARSED), "--db", str(DEPS_DB), "--reset"],
        cwd=ROOT / "03_parse",
    )

    # ── Schritt 3: wortprofil_gate_a.db (min-count 1, siehe Docstring) ───────
    run(
        [PY, "build_wortprofil_v2.py",
         "--deps-db", str(DEPS_DB), "--out-db", str(WP_DB), "--reset", "--min-count", "1"],
        cwd=ROOT / "04_score",
    )

    # ── Schritt 4: zeitreise-Tabelle ──────────────────────────────────────────
    run(
        [PY, "build_zeitreise_v2.py",
         "--deps-db", str(DEPS_DB), "--wortprofil-db", str(WP_DB), "--reset"],
        cwd=ROOT / "04_score",
    )

    # ── Schritt 5: belege_gate_a.db ───────────────────────────────────────────
    # Korpusliste wie build_belege_v2.DEFAULT_KORPORA (F3-Scope: KEIN
    # german_commons_justiz/ref_fnh/ref_mhd in belege.db, siehe DB-Neuaufbau.md
    # Abschnitt 4) – Ausnahme dta_kern/dta_erweiterungen/dta_github/gei_digital
    # OHNE die 1830er-Jahresschwelle (Gate A prüft Pipeline-Mechanik inkl. des
    # langen DTA-Buchs von 1699, nicht die F3-Scope-Entscheidung) + Canary.
    sys.path.insert(0, str(ROOT / "06_belege"))
    import build_belege_v2 as B  # noqa: E402
    vorhanden = {p.name for p in PARSED.glob("*.jsonl")}
    korpora = ",".join(
        [dateiname for dateiname, _, _ in B.DEFAULT_KORPORA if dateiname in vorhanden]
        + (["testkorpus_canary.jsonl"] if "testkorpus_canary.jsonl" in vorhanden else [])
    )
    run(
        [PY, "build_belege_v2.py",
         "--parsed-dir", str(PARSED), "--out-db", str(BELEGE_DB), "--reset",
         "--korpora", korpora],
        cwd=ROOT / "06_belege",
    )

    # ── Schritt 6: Golden-Query-Validierung ──────────────────────────────────
    cmd = [
        PY, "validate_v2.py",
        "--wortprofil-db", str(WP_DB),
        "--belege-db", str(BELEGE_DB),
        "--old-wortprofil-db", str(ROOT / "05_db" / "wortprofil.db"),
        "--old-belege-db", str(ROOT / "06_belege" / "belege.db"),
        "--report", str(REPORT),
        "--label", "Gate A – Mini-Korpus",
    ]
    if args.kalender_db:
        cmd += ["--kalender-db", str(Path(args.kalender_db).resolve())]
    print(f"\n$ {' '.join(cmd)}   (cwd={ROOT / '05_db'})")
    result = subprocess.run(cmd, cwd=str(ROOT / "05_db"))

    print(f"\n=== Gate A fertig. Report: {REPORT} ===")
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
