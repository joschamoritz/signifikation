"""
German Commons – Ausgewählte Splits herunterladen
Quelle: huggingface.co/datasets/coral-nlp/german-commons
Lizenz: CC BY-SA 4.0 (Texte), ODC-BY 1.0 (Kompilation)

Lädt nur die Parquet-Dateien der gewünschten Quellen,
nicht den gesamten Subset.

Aufruf: python download_german_commons.py [--dry-run] [--list-files]
"""

import argparse
import io
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

DATASET_ID = "coral-nlp/german-commons"
ZIEL = Path(__file__).parent / "korpora" / "german-commons"
ZIEL.mkdir(parents=True, exist_ok=True)

# Suchbegriff muss im Parquet-Dateipfad vorkommen (case-insensitive)
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
    """Gibt alle Parquet-Pfade zurück, die den Suchbegriff enthalten."""
    alle = list(api.list_repo_files(DATASET_ID, repo_type="dataset"))
    treffer = [
        f for f in alle
        if suchbegriff.lower() in f.lower() and f.endswith(".parquet")
    ]
    return treffer


def download_split(eintrag: dict, dry_run: bool, HfApi, load_dataset):
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

    # Nur diese spezifischen Dateien laden
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
    args = parser.parse_args()

    HfApi, load_dataset = lade_bibliotheken()

    if args.list_files:
        liste_alle_dateien(HfApi)
        return

    if args.dry_run:
        print("=== DRY-RUN: Es wird nichts heruntergeladen ===\n")

    print("=== German Commons – Ausgewählte Splits ===")
    for eintrag in SPLITS:
        download_split(eintrag, args.dry_run, HfApi, load_dataset)

    print("\n=== Fertig ===")
    print(f"Ablageort: {ZIEL}")


if __name__ == "__main__":
    main()
