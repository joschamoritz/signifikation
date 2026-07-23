"""
German Commons – Ausgewählte Splits herunterladen
Quelle: huggingface.co/datasets/coral-nlp/german-commons
Lizenz: CC BY-SA 4.0 (Texte), ODC-BY 1.0 (Kompilation) – die Justiz-Splits
sind laut Datensatz-Metadaten einzeln als CC0-1.0 lizenziert (amtliche
Entscheidungen, § 5 UrhG) – wird pro Zeile im JSONL mitgeführt.

Lädt nur die Parquet-Dateien der gewünschten Quellen, nicht den gesamten
Subset.

Zwei Gruppen:
  BESTAND – reichtagsprotokolle/dibiphil (bereits heruntergeladen, Format:
    eine .txt je Split, Dokumente durch "\\n\\n" getrennt, siehe
    extrahiere_german_commons() in 02_parse/extract_text.py).
  JUSTIZ  – Bundesgerichte (DB-Neuaufbau.md, Abschnitt 4 "Neu aufzunehmen").
    btdrucksachen wurde geprüft und bewusst weggelassen (siehe Kommentar bei
    JUSTIZ_SPLITS unten – enthält trotz Namens nur Plenarprotokoll-Dopplungen).
    Diese Splits haben brauchbare Dokument-Metadaten
    (id kodiert Gericht/Datum/Aktenzeichen, license je Zeile) → Format:
    eine .jsonl je Split (id, source, license, text), damit
    02_parse/extract_text.py daraus dokumentgenaue ref-Angaben bauen kann
    (Plan 3.1) statt sie wie beim TXT-Format zu verlieren.

Aufruf:
  python download_german_commons.py                       # alles (Resume: bereits vorhandene Dateien werden übersprungen)
  python download_german_commons.py --only bestand         # nur reichtagsprotokolle/dibiphil
  python download_german_commons.py --only justiz          # nur Gerichte + btdrucksachen
  python download_german_commons.py --dry-run
  python download_german_commons.py --list-files
"""

import argparse
import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

DATASET_ID = "coral-nlp/german-commons"
ZIEL = Path(__file__).parent / "korpora" / "german-commons"
ZIEL.mkdir(parents=True, exist_ok=True)

# ── Bestand (Format: .txt, Dokumente durch Leerzeile getrennt) ──────────────
# Suchbegriff muss im Parquet-Dateipfad vorkommen (case-insensitive, Substring).
SPLITS = [
    {
        "split":           "reichtagsprotokolle",
        "pfad_suchbegriff": "reichtagsprotokolle",
        "desc":            "Reichstagsprotokoll-Korpus (Kaiserreich)",
        "lizenz":          "CC BY-SA 4.0",
        "tokens":          "~700 Mio.",
    },
    {
        "split":           "dibiphil",
        "pfad_suchbegriff": "dibiphil",
        "desc":            "DiBiPhil-Korpus (Literatur mit philosoph. Inhalt)",
        "lizenz":          "CC BY-SA 4.0",
        "tokens":          "~32 Mio.",
    },
]

# ── Justiz-Splits + btdrucksachen (Format: .jsonl mit id/source/license/text) ─
# "praefix" = exakter HF-Pfad (subset=.../source=.../) – NICHT als Substring-
# Suchbegriff verwenden, da z. B. "Entscheidungen des Bundesgerichtshofs" sonst
# auch die separate Datei "...in Strafsachen aus dem 20. Jahrhundert" träfe.
JUSTIZ_SPLITS = [
    {
        "split":  "bverfg",
        "praefix": "subset=Legal/source=Entscheidungen des Bundesverfassungsgerichts/",
        "desc":   "Bundesverfassungsgericht – Entscheidungen",
        "tokens": "~49 MB",
    },
    {
        "split":  "bverfg_amtlich",
        "praefix": "subset=Legal/source=Amtliche Entscheidungssammlung des Bundesverfassungsgerichts/",
        "desc":   "Bundesverfassungsgericht – Amtliche Entscheidungssammlung (BVerfGE)",
        "tokens": "~31 MB",
    },
    {
        "split":  "bgh",
        "praefix": "subset=Legal/source=Entscheidungen des Bundesgerichtshofs/",
        "desc":   "Bundesgerichtshof – Entscheidungen",
        "tokens": "~367 MB",
    },
    {
        "split":  "bgh_strafsachen_hist",
        "praefix": "subset=Legal/source=Entscheidungen des Bundesgerichtshofs in Strafsachen aus dem 20. Jahrhundert/",
        "desc":   "Bundesgerichtshof – Strafsachen, 20. Jahrhundert (historisch)",
        "tokens": "~133 MB",
    },
    {
        "split":  "bverwg",
        "praefix": "subset=Legal/source=Entscheidungen des Bundesverwaltungsgerichts/",
        "desc":   "Bundesverwaltungsgericht – Entscheidungen",
        "tokens": "~152 MB",
    },
    {
        "split":  "bpatg",
        "praefix": "subset=Legal/source=Entscheidungen des Bundespatentgerichts/",
        "desc":   "Bundespatentgericht – Entscheidungen",
        "tokens": "~225 MB",
    },
    {
        "split":  "bag",
        "praefix": "subset=Legal/source=Entscheidungen des Bundesarbeitsgerichts/",
        "desc":   "Bundesarbeitsgericht – Entscheidungen",
        "tokens": "~58 MB",
    },
    {
        "split":  "bfh",
        "praefix": "subset=Legal/source=Entscheidungen des Bundesfinanzhofs/",
        "desc":   "Bundesfinanzhof – Entscheidungen (ergänzt die im Auftrag genannten "
                  "BGH/BVerfG/BPatG/BVerwG/BAG um den fünften Bundesgerichtshof)",
        "tokens": "~84 MB",
    },
]

# Bewusst NICHT aufgenommen (nicht im Auftrag genannt / anderer Umfang):
#   subset=Legal/source=Deutsches Bundesrecht  (Gesetzestexte, kein Gericht – Dopplung zu "gesetze")
#   subset=Legal/source=EurLEX                  (EU-Recht, nicht Deutsche Bundesgerichte)
#   subset=Legal/source=Open Legal Data          (~2,6 GB, heterogene/untere Instanzen, unklare Qualität)
#   subset=Political/source=Drucksachen des Bundestages (2026-07-22 geprüft: enthält trotz Namens
#     Plenarprotokolle/Stenografische Berichte, keine echten Drucksachen – Dopplung zu bundestag/
#     bundestag_pdf aus DIP. User-Entscheidung: weglassen.)
#   subset=Political/source=Plenarprotokolle...  (Dopplung zu bundestag/bundestag_pdf aus DIP)
#   subset=Political/source=German Political...  (Dopplung zu pol_reden)
#   subset=Political/source=EuroVoc              (Thesaurus, kein Fließtext)


def lade_bibliotheken():
    try:
        from huggingface_hub import HfApi
        from datasets import load_dataset
        return HfApi, load_dataset
    except ImportError as e:
        print(f"[FEHLER] Fehlende Bibliothek: {e}")
        print("         Bitte ausführen: pip install datasets huggingface_hub")
        sys.exit(1)


def finde_parquet_dateien(api, suchbegriff: str) -> list[str]:
    """Gibt alle Parquet-Pfade zurück, die den Suchbegriff enthalten (Substring)."""
    alle = list(api.list_repo_files(DATASET_ID, repo_type="dataset"))
    treffer = [
        f for f in alle
        if suchbegriff.lower() in f.lower() and f.endswith(".parquet")
    ]
    return treffer


def finde_parquet_dateien_exakt(api, praefix: str) -> list[str]:
    """Gibt alle Parquet-Pfade zurück, die exakt mit praefix beginnen
    (kein Substring-Treffer – vermeidet Kollisionen wie BGH/BGH-Strafsachen)."""
    alle = list(api.list_repo_files(DATASET_ID, repo_type="dataset"))
    return [f for f in alle if f.startswith(praefix) and f.endswith(".parquet")]


def download_split(eintrag: dict, dry_run: bool, HfApi, load_dataset):
    """Bestand-Format: reine Texte, durch Leerzeile getrennt (.txt)."""
    ziel_datei = ZIEL / f"{eintrag['split']}.txt"
    print(f"\n── {eintrag['desc']} ({eintrag['lizenz']}, {eintrag['tokens']})")

    if ziel_datei.exists() and ziel_datei.stat().st_size > 0:
        print(f"  [SKIP]  Bereits vorhanden: {ziel_datei}")
        return

    print(f"  Suche Parquet-Dateien für '{eintrag['pfad_suchbegriff']}' ...")
    api = HfApi()
    parquet_dateien = finde_parquet_dateien(api, eintrag["pfad_suchbegriff"])

    if not parquet_dateien:
        print(f"  [FEHLER] Keine Parquet-Dateien gefunden.")
        print(f"           Tipp: --list-files zeigt alle verfügbaren Pfade.")
        return

    print(f"  Gefunden: {len(parquet_dateien)} Parquet-Datei(en)")
    for p in parquet_dateien:
        print(f"    {p}")

    if dry_run:
        print(f"  [dry-run] würde laden und nach {ziel_datei} schreiben")
        return

    data_files = [f"hf://datasets/{DATASET_ID}/{p}" for p in parquet_dateien]
    print(f"  Lade Parquet-Dateien ...")
    try:
        ds = load_dataset("parquet", data_files={"train": data_files}, split="train")
    except Exception as e:
        print(f"  [FEHLER] {e}")
        return

    print(f"  {len(ds)} Dokumente geladen. Schreibe Text nach {ziel_datei} ...")
    zeichen = 0
    with ziel_datei.open("w", encoding="utf-8") as f:
        for dok in ds:
            text = dok.get("text", "").strip()
            if text:
                f.write(text)
                f.write("\n\n")
                zeichen += len(text)

    mb = ziel_datei.stat().st_size / 1e6
    print(f"  [OK]    {ziel_datei.name} ({mb:.1f} MB, {zeichen:,} Zeichen)")


def download_split_jsonl(eintrag: dict, dry_run: bool, HfApi, load_dataset):
    """Justiz-Format: id/source/license/text je Zeile als JSONL (streaming,
    damit große Splits wie btdrucksachen nicht komplett in den RAM müssen)."""
    ziel_datei = ZIEL / f"{eintrag['split']}.jsonl"
    print(f"\n── {eintrag['desc']} ({eintrag['tokens']})")

    if ziel_datei.exists() and ziel_datei.stat().st_size > 0:
        print(f"  [SKIP]  Bereits vorhanden: {ziel_datei}")
        return

    print(f"  Suche Parquet-Dateien unter '{eintrag['praefix']}' ...")
    api = HfApi()
    parquet_dateien = finde_parquet_dateien_exakt(api, eintrag["praefix"])

    if not parquet_dateien:
        print(f"  [FEHLER] Keine Parquet-Dateien gefunden.")
        print(f"           Tipp: --list-files zeigt alle verfügbaren Pfade.")
        return

    print(f"  Gefunden: {len(parquet_dateien)} Parquet-Datei(en)")
    for p in parquet_dateien:
        print(f"    {p}")

    if dry_run:
        print(f"  [dry-run] würde laden (streaming) und nach {ziel_datei} schreiben")
        return

    data_files = [f"hf://datasets/{DATASET_ID}/{p}" for p in parquet_dateien]
    print(f"  Lade Parquet-Dateien (streaming) ...")
    try:
        ds = load_dataset("parquet", data_files={"train": data_files},
                          split="train", streaming=True)
    except Exception as e:
        print(f"  [FEHLER] {e}")
        return

    n = 0
    zeichen = 0
    tmp_datei = ziel_datei.with_suffix(".jsonl.part")
    try:
        with tmp_datei.open("w", encoding="utf-8") as f:
            for row in ds:
                text = (row.get("text") or "").strip()
                if not text:
                    continue
                f.write(json.dumps({
                    "id":      row.get("id", ""),
                    "source":  row.get("source", ""),
                    "license": row.get("license", ""),
                    "text":    text,
                }, ensure_ascii=False))
                f.write("\n")
                n += 1
                zeichen += len(text)
                if n % 5000 == 0:
                    print(f"  {n:,} Dokumente ...", flush=True)
    except Exception as e:
        print(f"  [FEHLER] beim Streamen: {e} – Teildatei bleibt liegen ({tmp_datei}).")
        return

    tmp_datei.replace(ziel_datei)
    mb = ziel_datei.stat().st_size / 1e6
    print(f"  [OK]    {ziel_datei.name} ({mb:.1f} MB, {n:,} Dokumente, {zeichen:,} Zeichen)")


def liste_alle_dateien(HfApi):
    """Zeigt alle Parquet-Pfade im Dataset – zur Diagnose."""
    print(f"Alle Parquet-Dateien in {DATASET_ID}:\n")
    api = HfApi()
    alle = list(api.list_repo_files(DATASET_ID, repo_type="dataset"))
    parquet = [f for f in alle if f.endswith(".parquet")]
    for p in sorted(parquet):
        print(f"  {p}")
    print(f"\nGesamt: {len(parquet)} Dateien")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur anzeigen was passieren würde")
    parser.add_argument("--list-files", action="store_true",
                        help="Alle verfügbaren Parquet-Pfade anzeigen und beenden")
    parser.add_argument("--only", choices=["alle", "bestand", "justiz"], default="alle",
                        help="Nur eine Gruppe laden (Standard: alle)")
    args = parser.parse_args()

    HfApi, load_dataset = lade_bibliotheken()

    if args.list_files:
        liste_alle_dateien(HfApi)
        return

    if args.dry_run:
        print("=== DRY-RUN: Es wird nichts heruntergeladen ===\n")

    print("=== German Commons – Ausgewählte Splits ===")

    if args.only in ("alle", "bestand"):
        for eintrag in SPLITS:
            download_split(eintrag, args.dry_run, HfApi, load_dataset)

    if args.only in ("alle", "justiz"):
        for eintrag in JUSTIZ_SPLITS:
            download_split_jsonl(eintrag, args.dry_run, HfApi, load_dataset)

    print("\n=== Fertig ===")
    print(f"Ablageort: {ZIEL}")


if __name__ == "__main__":
    main()
